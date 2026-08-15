import 'server-only';
import { dbInsert, dbUpdate } from './db';
import { sendEmail } from './email';
import { TERMS_VERSION, balanceDueDate, buildTerms, cancelCutoffDate, termsPlainText } from './terms';
import { termsDigest } from './terms-digest';
import type { CustomerPaymentType, Invoice } from './types';

// The terms-acceptance record, written identically for every way a customer
// can pay. It lives here rather than in the checkout route because a card
// acceptance and a Zelle acceptance have to produce the SAME evidence — two
// copies of this logic would drift the moment the wording changes, and the
// drift would only surface in a dispute, which is the worst place to find it.

/** How the customer said they would pay. Recorded in the snapshot, not in
 *  payment_type — that column is the AMOUNT (deposit/balance/full) and is
 *  constrained to those three values in the schema. */
export type AcceptanceMethod = 'card' | 'zelle';

export type AcceptanceResult =
  | { ok: true; acceptanceId: string; acceptedAt: string; digest: string }
  | { ok: false; status: number; error: string; stale?: boolean };

export async function recordAcceptance(opts: {
  req: Request;
  invoice: Invoice;
  /** Which amount is being agreed to. */
  type: CustomerPaymentType;
  amount: number;
  method: AcceptanceMethod;
  body: Record<string, unknown>;
}): Promise<AcceptanceResult> {
  const { req, invoice, type, amount, method, body } = opts;

  // Terms gate — enforced here, not just in the UI. This acceptance record is
  // the single highest-value artifact in a chargeback: it proves what text was
  // on screen, when, from where, and for which amount.
  if (body.accept_terms !== true || body.terms_version !== TERMS_VERSION) {
    return { ok: false, status: 400, error: 'Please accept the service terms to continue.' };
  }

  const terms = buildTerms(invoice);
  const termsText = termsPlainText(terms, {
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
  });

  // Staleness gate. The page echoes back the amount and a digest of the exact
  // terms it rendered; if the chef repriced in the meantime, refuse rather
  // than proceed on a number the customer never agreed to. These values are
  // only ever compared — never used as the charge — so the client still cannot
  // influence any amount.
  if (typeof body.expected_charge_cents === 'number' && body.expected_charge_cents !== amount) {
    return {
      ok: false,
      status: 409,
      error: 'Your invoice was updated — please review the new amount.',
      stale: true,
    };
  }
  const digest = termsDigest(termsText);
  if (typeof body.expected_terms_digest === 'string' && body.expected_terms_digest !== digest) {
    return {
      ok: false,
      status: 409,
      error: 'Your invoice was updated — please review the new terms.',
      stale: true,
    };
  }

  const acceptedAt = new Date().toISOString();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 60) ||
    req.headers.get('x-real-ip')?.slice(0, 60) ||
    null;

  const acceptanceRow = {
    invoice_id: invoice.id,
    terms_version: TERMS_VERSION,
    payment_type: type,
    accepted_at: acceptedAt,
    ip,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400) || null,
    terms_text: termsText,
    snapshot: {
      method,
      invoice_number: invoice.invoice_number,
      currency: invoice.currency,
      total_cents: invoice.total_cents,
      deposit_cents: invoice.deposit_cents,
      amount_paid_cents: invoice.amount_paid_cents,
      charge_cents: amount,
      terms_digest: digest,
      service_date: invoice.service_date,
      service_time: invoice.service_time,
      balance_due_date: balanceDueDate(invoice),
      cancel_cutoff_date: cancelCutoffDate(invoice),
      line_items: invoice.line_items,
    },
  };

  // Fail CLOSED: without this row there is no dispute evidence, and Stripe
  // metadata cannot hold a copy (values cap at 500 chars; the terms run to
  // thousands). One retry absorbs a transient blip; a persistent failure
  // refuses the payment and pages the owner rather than silently taking money
  // with no record of what was agreed.
  let acceptanceId: string | null = null;
  for (let attempt = 0; attempt < 2 && !acceptanceId; attempt++) {
    try {
      const row = await dbInsert<{ id: string }>('terms_acceptances', acceptanceRow);
      acceptanceId = row.id;
    } catch (err) {
      console.error(`Terms acceptance record failed (attempt ${attempt + 1}):`, err);
    }
  }
  if (!acceptanceId) {
    const adminTo = process.env.CONTACT_TO;
    if (adminTo) {
      await sendEmail({
        to: adminTo,
        subject: 'URGENT: invoice payments are blocked',
        html: `<p>Could not write a terms-acceptance record for invoice #${invoice.invoice_number}, so the payment was refused. Payments stay blocked until this is fixed — check that the terms_acceptances table exists and the migration has been run.</p>`,
      }).catch(() => null);
    }
    return {
      ok: false,
      status: 503,
      error: 'We could not start your payment just now. Please try again in a moment.',
    };
  }

  try {
    // First acceptance only — denormalized for display.
    await dbUpdate('invoices', `id=eq.${invoice.id}&terms_accepted_at=is.null`, {
      terms_accepted_at: acceptedAt,
    });
  } catch (err) {
    console.error('Failed to stamp first terms acceptance:', err);
  }

  return { ok: true, acceptanceId, acceptedAt, digest };
}
