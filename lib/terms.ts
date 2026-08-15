// The service terms shown on every invoice, on /terms, and in every invoice
// email. Bump TERMS_VERSION when the wording changes; what a customer actually
// accepted is recorded per acceptance in the terms_acceptances table, together
// with the verbatim rendered text.
//
// These are business terms, not legal advice — worth one review by a Florida
// attorney before leaning on them in a large dispute.
//
// Pure module: no I/O, no secrets. Safe to import from client components.

import { formatCents } from './money';
import { hasUnpricedItems } from './types';
import type { Invoice } from './types';

export const TERMS_VERSION = '2026-08-14';

export interface TermsClause {
  id: string;
  title: string;
  body: string;
}

export interface RenderedTerms {
  version: string;
  intro: string;
  clauses: TermsClause[];
  closing: string;
  serviceDateLabel: string | null;
  balanceDueLabel: string | null;
  cancelCutoffLabel: string | null;
}

const INTRO = 'The short version, so there are no surprises:';
const CLOSING =
  'Paying this invoice means these terms work for you. Questions about any of it? Just ask — I would much rather sort it out now.';

// ---------------------------------------------------------------------------
// Date helpers. All dates are plain YYYY-MM-DD and handled in UTC so a
// timezone never shifts a cancellation deadline by a day.
// ---------------------------------------------------------------------------

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The year is deliberately included: this string is archived verbatim into
// terms_acceptances and has to identify a specific booking years later.
export function longDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "by Tuesday, September 1, 2026" or the generic rule when no date is known. */
export function balanceDuePhrase(terms: Pick<RenderedTerms, 'balanceDueLabel'>): string {
  return terms.balanceDueLabel ? `by ${terms.balanceDueLabel}` : '24 hours before your service date';
}

/** Explicit due_date wins; otherwise the day before service. Never stored. */
export function balanceDueDate(inv: Pick<Invoice, 'due_date' | 'service_date'>): string | null {
  if (inv.due_date) return inv.due_date;
  return inv.service_date ? shiftDate(inv.service_date, -1) : null;
}

/** Two calendar days before service — the "within 48 hours" line. */
export function cancelCutoffDate(inv: Pick<Invoice, 'service_date'>): string | null {
  return inv.service_date ? shiftDate(inv.service_date, -2) : null;
}

export function outstandingCents(inv: Invoice): number {
  return Math.max(inv.total_cents - inv.amount_paid_cents, 0);
}

// ---------------------------------------------------------------------------
// Clause builders
// ---------------------------------------------------------------------------

function depositClause(invoice: Invoice): TermsClause | null {
  if (!invoice.deposit_cents) return null;

  // Deliberately silent on a settled invoice: balanceClause already says
  // "paid in full", and a past-tense deposit clause here would both claim a
  // reservation that is no longer pending and — if the customer paid in full
  // in one go — describe a deposit payment that never happened.
  if (invoice.status === 'paid') return null;

  if (invoice.status === 'deposit_paid') {
    // Always the configured deposit, never amount_paid_cents: the two diverge
    // whenever more than the deposit has been collected.
    return {
      id: 'deposit',
      title: 'Your deposit',
      body: `Your deposit of ${formatCents(invoice.deposit_cents, invoice.currency)} is in and your date is reserved. It covers menu planning and the time I set aside for you, and it comes off your total — it is not added on top.`,
    };
  }
  return {
    id: 'deposit',
    title: 'Your deposit',
    body: `The deposit of ${formatCents(invoice.deposit_cents, invoice.currency)} reserves your date and covers menu planning and the time I set aside for you. It comes off your total — it is not added on top.`,
  };
}

function balanceClause(invoice: Invoice, balanceLabel: string | null, derived: boolean): TermsClause {
  if (invoice.status === 'paid') {
    return {
      id: 'balance',
      title: 'Final payment',
      body: 'This invoice is paid in full — thank you. Nothing further is due.',
    };
  }

  const plusGroceries = hasUnpricedItems(invoice) ? ', plus the grocery total once it is final,' : '';
  const tail = 'I shop right before I cook, so the final payment needs to land before I do.';

  // Before anything is paid, measure the remainder against the deposit this
  // same page is asking for — otherwise "your remaining balance" prints the
  // full total, contradicting the deposit clause's "it comes off your total".
  const pendingDeposit = invoice.amount_paid_cents === 0 ? (invoice.deposit_cents ?? 0) : 0;
  const remainder = Math.max(invoice.total_cents - invoice.amount_paid_cents - pendingDeposit, 0);
  const outstanding = formatCents(remainder, invoice.currency);
  const lead = pendingDeposit > 0 ? 'After the deposit, your remaining balance of' : 'Your remaining balance of';

  if (balanceLabel) {
    const suffix = derived ? ' — the day before your service date' : '';
    return {
      id: 'balance',
      title: 'Final payment',
      body: `${lead} ${outstanding}${plusGroceries} is due by ${balanceLabel}${suffix}. ${tail}`,
    };
  }
  return {
    id: 'balance',
    title: 'Final payment',
    body: `${lead} ${outstanding}${plusGroceries} is due 24 hours before your service date. I will confirm the exact date with you as soon as we have one on the calendar. ${tail}`,
  };
}

const GROCERIES_CLAUSE: TermsClause = {
  id: 'groceries',
  title: 'Groceries & TBD items',
  body: 'Anything listed as TBD — usually groceries — is billed at actual cost. I shop, I keep the receipts, and I add the real amounts to this invoice as their own line items before the balance is due. No markup and no surprise fees, and you are welcome to ask for the receipts.',
};

function cancellationClause(invoice: Invoice, cutoffLabel: string | null): TermsClause {
  // With no service date on file, say so rather than citing a date that does
  // not exist — and supply the trailing comma the em-dash variant carries.
  const window = cutoffLabel
    ? `on or after ${cutoffLabel} — within 48 hours of your service date —`
    : 'within 48 hours of your service date, which I will confirm with you in writing as soon as it is on the calendar,';

  // Parenthetical variant for the branch that continues with a comma, so the
  // sentence never renders "— ,".
  const windowBeforeComma = cutoffLabel
    ? `on or after ${cutoffLabel} (within 48 hours of your service date)`
    : 'within 48 hours of your service date, which I will confirm with you in writing as soon as it is on the calendar';

  if (invoice.deposit_cents) {
    return {
      id: 'cancellation',
      title: 'Cancellations & rescheduling',
      body: `Plans change — just tell me as early as you can. Cancelling ${window} forfeits the deposit, because the date is no longer bookable and the shopping is usually already done. Before then, your deposit moves to a new date within 60 days, or I refund it in full if you would rather not reschedule. Groceries I have already bought for your menu are billed at cost either way.`,
    };
  }
  return {
    id: 'cancellation',
    title: 'Cancellations & rescheduling',
    body: `Plans change — just tell me as early as you can. If you cancel ${windowBeforeComma}, any groceries I have already bought for your menu are billed at cost, and work already done is invoiced as scheduled. Before then there is no cancellation charge.`,
  };
}

const HEADCOUNT_CLAUSE: TermsClause = {
  id: 'headcount',
  title: 'Guest count & menu changes',
  body: 'Final guest count and any menu, allergy, or dietary changes are locked in 48 hours before service. Before that I can accommodate almost anything — after that, the invoice stands as written.',
};

const ONSITE_CLAUSE: TermsClause = {
  id: 'onsite',
  title: 'What I need on the day',
  body: 'For in-home service I need kitchen access at the agreed time, plus a working stove or oven, a sink, and some counter space. If I arrive and cannot get in or cannot cook, I will do everything I can to make it work, but the service is treated as delivered and the invoice stands.',
};

/** Extra clauses shown only on the public /terms page, not per invoice. */
export const SITE_ONLY_CLAUSES: TermsClause[] = [
  {
    id: 'payments',
    title: 'Payments',
    body: 'Invoices are paid by card through Stripe, from the private link I send you. I never see or store your card details, and I will never ask you to pay by any other method — if you get a message asking you to, it is not from me.',
  },
  {
    id: 'allergies',
    title: 'Allergies & dietary needs',
    body: 'Tell me up front and I will build the menu around them. I cook in home kitchens, so while I take allergies seriously and keep prep separate, I cannot guarantee a completely allergen-free environment.',
  },
  {
    id: 'area',
    title: 'Where I cook',
    body: 'I serve Miami-Dade and Broward Counties. Anywhere further out is welcome — travel is quoted as its own line item on your invoice so you can see exactly what it costs.',
  },
];

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

export function buildTerms(invoice: Invoice): RenderedTerms {
  const balanceIso = balanceDueDate(invoice);
  const cutoffIso = cancelCutoffDate(invoice);
  const derived = !invoice.due_date && Boolean(invoice.service_date);

  const balanceDueLabel = longDate(balanceIso);
  const cancelCutoffLabel = longDate(cutoffIso);

  const clauses: TermsClause[] = [];
  const deposit = depositClause(invoice);
  if (deposit) clauses.push(deposit);
  clauses.push(balanceClause(invoice, balanceDueLabel, derived));
  if (hasUnpricedItems(invoice)) clauses.push(GROCERIES_CLAUSE);
  clauses.push(cancellationClause(invoice, cancelCutoffLabel));
  clauses.push(HEADCOUNT_CLAUSE, ONSITE_CLAUSE);

  return {
    version: TERMS_VERSION,
    intro: INTRO,
    clauses,
    closing: CLOSING,
    serviceDateLabel: longDate(invoice.service_date),
    balanceDueLabel,
    cancelCutoffLabel,
  };
}

/** Invoice-independent wording for the public /terms page. */
export function genericTerms(): RenderedTerms {
  return {
    version: TERMS_VERSION,
    intro: 'These are the terms that come with every Tailored Taste invoice. Your invoice shows them again with your own dates and amounts filled in.',
    clauses: [
      {
        id: 'deposit',
        title: 'Deposits',
        body: 'Most bookings start with a deposit. It reserves your date and covers menu planning and the time I set aside for you, and it always comes off your total — it is never added on top.',
      },
      {
        id: 'balance',
        title: 'Final payment',
        body: 'Your remaining balance, plus the actual cost of groceries, is due 24 hours before your service date. I shop right before I cook, so the final payment needs to land before I do.',
      },
      GROCERIES_CLAUSE,
      {
        id: 'cancellation',
        title: 'Cancellations & rescheduling',
        body: 'Plans change — just tell me as early as you can. Cancelling within 48 hours of your service date forfeits the deposit, because the date is no longer bookable and the shopping is usually already done. Before then, your deposit moves to a new date within 60 days, or I refund it in full if you would rather not reschedule. Groceries I have already bought for your menu are billed at cost either way.',
      },
      HEADCOUNT_CLAUSE,
      ONSITE_CLAUSE,
      ...SITE_ONLY_CLAUSES,
    ],
    closing: CLOSING,
    serviceDateLabel: null,
    balanceDueLabel: null,
    cancelCutoffLabel: null,
  };
}

/**
 * Verbatim plain text of what the customer saw. Stored per acceptance and
 * pasted straight into a Stripe dispute response — never regenerated, since
 * the wording may have changed since.
 */
export function termsPlainText(terms: RenderedTerms, identity?: { invoiceNumber: number; customerName: string }): string {
  const lines = [
    `TAILORED TASTE — SERVICE TERMS (v${terms.version})`,
    ...(identity ? [`Invoice #${identity.invoiceNumber} — ${identity.customerName}`] : []),
    ...(terms.serviceDateLabel ? [`Service date: ${terms.serviceDateLabel}`] : []),
    '',
    terms.intro,
    '',
  ];
  terms.clauses.forEach((clause, i) => {
    lines.push(`${i + 1}. ${clause.title}`);
    lines.push(clause.body);
    lines.push('');
  });
  lines.push(terms.closing);
  return lines.join('\n');
}
