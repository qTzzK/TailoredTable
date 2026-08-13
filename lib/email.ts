import 'server-only';
import type Stripe from 'stripe';
import { siteUrl } from './env';
import { formatCents } from './money';
import { TERMS_VERSION, buildTerms, type RenderedTerms } from './terms';
import { hasUnpricedItems, lineAmountCents } from './types';
import type { Invoice, PaymentType } from './types';

// Email delivery via the Resend REST API (no SDK — mirrors the original
// api/contact.js pattern). If Resend isn't configured yet, sendEmail reports
// { sent: false, error: 'not_configured' } and NEVER throws, so every feature
// keeps working before email is set up.

export const escapeHtml = (str: unknown): string =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c] as string);

export interface SendResult {
  sent: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM || 'Tailored Taste <onboarding@resend.dev>';

  if (!apiKey) {
    console.error('sendEmail skipped: RESEND_API_KEY not configured.');
    return { sent: false, error: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend error: ${res.status} ${body}`);
      return { sent: false, error: `Resend error: ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('Resend request failed:', err);
    return { sent: false, error: err instanceof Error ? err.message : 'send_failed' };
  }
}

// ---------------------------------------------------------------------------
// Branded template helpers (email-safe inline styles, serif approximation of
// the site's look).
// ---------------------------------------------------------------------------

function wrap(content: string): string {
  return `
  <div style="background:#F7F2EC;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#2C2C2C;">
    <div style="max-width:560px;margin:0 auto;background:#FDFBF8;border:1px solid #D4CBBF;padding:36px 32px;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:26px;font-weight:bold;color:#7A1530;letter-spacing:0.5px;">Tailored Taste</div>
        <div style="font-size:14px;font-style:italic;color:#8A8178;margin-top:4px;">Flavors True to You</div>
      </div>
      ${content}
      <div style="border-top:1px solid #D4CBBF;margin-top:32px;padding-top:16px;text-align:center;font-size:12px;color:#8A8178;">
        Tailored Taste · Miami, FL — Serving Miami-Dade &amp; Broward Counties
      </div>
    </div>
  </div>`;
}

function lineItemRows(invoice: Invoice): string {
  return invoice.line_items
    .map(item => {
      const amount = lineAmountCents(item);
      const cell =
        amount === null
          ? `<span style="font-style:italic;color:#8A8178;letter-spacing:1px;">TBD</span>`
          : formatCents(amount, invoice.currency);
      const note =
        item.pricing === 'tbd' && item.tbd_note
          ? `<div style="font-size:13px;font-style:italic;color:#8A8178;">${escapeHtml(item.tbd_note)}</div>`
          : item.pricing === 'waived'
            ? `<div style="font-size:13px;font-style:italic;color:#8A8178;">not required</div>`
            : '';
      return `
      <tr>
        <td style="padding:6px 12px 6px 0;border-bottom:1px solid #EDE7DE;">${escapeHtml(item.description)}${note}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #EDE7DE;text-align:center;color:#8A8178;">×${item.quantity}</td>
        <td style="padding:6px 0;border-bottom:1px solid #EDE7DE;text-align:right;">${cell}</td>
      </tr>`;
    })
    .join('');
}

// Escape FIRST, then insert <br /> — the other order would escape away the
// tags, and injecting before escaping would be an XSS hole.
function notesBlock(invoice: Invoice): string {
  if (!invoice.notes) return '';
  const body = escapeHtml(invoice.notes).replace(/\n/g, '<br />');
  return `
    <div style="background:#F7F2EC;border:1px solid #D4CBBF;padding:16px 18px;margin:24px 0 0;">
      <p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8A8178;margin:0 0 8px;">A note from your chef</p>
      <p style="font-size:15px;color:#2C2C2C;margin:0;line-height:1.6;">${body}</p>
    </div>`;
}

function termsBlock(terms: RenderedTerms): string {
  const clauses = terms.clauses
    .map(
      clause => `
      <tr>
        <td style="padding:8px 0 0;">
          <div style="font-size:13px;font-weight:bold;color:#2C2C2C;">${escapeHtml(clause.title)}</div>
          <div style="font-size:13px;color:#5A544E;line-height:1.55;">${escapeHtml(clause.body)}</div>
        </td>
      </tr>`
    )
    .join('');

  return `
    <div style="background:#F7F2EC;border:1px solid #D4CBBF;padding:18px;margin:24px 0 0;">
      <p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7A1530;margin:0 0 4px;font-weight:bold;">Service Terms</p>
      <p style="font-size:13px;font-style:italic;color:#8A8178;margin:0 0 6px;">${escapeHtml(terms.intro)}</p>
      <table style="width:100%;border-collapse:collapse;">${clauses}</table>
      <p style="font-size:13px;color:#5A544E;margin:14px 0 0;">${escapeHtml(terms.closing)}</p>
      <p style="font-size:12px;color:#8A8178;margin:8px 0 0;">
        <a href="${siteUrl()}/terms" style="color:#7A1530;">Full terms</a> · v${escapeHtml(terms.version)}
      </p>
    </div>`;
}

export function invoiceEmail(invoice: Invoice): { subject: string; html: string } {
  const link = `${siteUrl()}/invoice/${invoice.token}`;
  const terms = buildTerms(invoice);
  const unpriced = hasUnpricedItems(invoice);

  const dateLines: string[] = [];
  if (terms.serviceDateLabel) {
    dateLines.push(`Service ${escapeHtml(terms.serviceDateLabel)}${invoice.service_time ? ` · ${escapeHtml(invoice.service_time)}` : ''}`);
  }
  if (terms.balanceDueLabel) dateLines.push(`Balance due ${escapeHtml(terms.balanceDueLabel)}`);
  const dates = dateLines.length
    ? `<p style="font-size:14px;color:#8A8178;text-align:center;margin:4px 0 0;">${dateLines.join('<br />')}</p>`
    : '';

  const pending = unpriced
    ? `<tr>
        <td colspan="2" style="padding:4px 12px 0 0;font-size:13px;color:#8A8178;">Final total pending</td>
        <td style="padding:4px 0 0;text-align:right;font-size:13px;color:#8A8178;">+ groceries at cost</td>
      </tr>`
    : '';

  const deposit =
    invoice.deposit_cents && invoice.status !== 'deposit_paid'
      ? `<p style="font-size:15px;text-align:center;margin:12px 0 0;color:#2D4E1A;">A deposit of <strong>${formatCents(invoice.deposit_cents, invoice.currency)}</strong> reserves your date${unpriced ? '.' : ' — or pay in full.'}</p>`
      : '';

  const html = wrap(`
    <h2 style="font-size:20px;margin:0 0 6px;text-align:center;color:#2C2C2C;">${invoice.description ? escapeHtml(invoice.description) : 'Invoice'}</h2>
    <p style="font-size:15px;text-align:center;margin:0 0 20px;color:#8A8178;">for ${escapeHtml(invoice.customer_name)}</p>
    <table style="width:100%;font-size:15px;border-collapse:collapse;margin-bottom:16px;">
      ${lineItemRows(invoice)}
      <tr>
        <td colspan="2" style="padding:10px 12px 0 0;font-weight:bold;">${unpriced ? 'Priced so far' : 'Total'}</td>
        <td style="padding:10px 0 0;text-align:right;font-weight:bold;">${formatCents(invoice.total_cents, invoice.currency)}</td>
      </tr>
      ${pending}
    </table>
    ${dates}
    ${deposit}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${link}" style="background:#7A1530;color:#FDFBF8;text-decoration:none;padding:14px 36px;font-size:15px;letter-spacing:1px;display:inline-block;">View &amp; Pay Invoice</a>
    </div>
    ${notesBlock(invoice)}
    ${termsBlock(terms)}
    <p style="font-size:13px;color:#8A8178;text-align:center;margin:16px 0 0;">Payments are processed securely by Stripe.</p>
  `);

  return {
    subject: invoice.description
      ? `${invoice.description} — Invoice from Tailored Taste`
      : 'Invoice from Tailored Taste',
    html,
  };
}

export function receiptEmail(
  invoice: Invoice,
  paidCents: number,
  paymentType: PaymentType
): { subject: string; html: string } {
  const link = `${siteUrl()}/invoice/${invoice.token}`;
  const remaining = invoice.total_cents - invoice.amount_paid_cents;
  const label =
    paymentType === 'deposit' ? 'deposit payment' : paymentType === 'balance' ? 'balance payment' : 'payment';

  const terms = buildTerms(invoice);
  const unpriced = hasUnpricedItems(invoice);
  const dueLine = terms.balanceDueLabel ? ` Due by ${escapeHtml(terms.balanceDueLabel)}.` : '';

  // While items are unpriced there is deliberately NO pay button: the invoice
  // page has no balance option yet, so a button would lead to a dead end.
  const balanceBlock = unpriced
    ? `<p style="font-size:15px;text-align:center;margin:18px 0 0;">
         Remaining balance <em>so far</em>: <strong>${formatCents(remaining, invoice.currency)}</strong>,
         plus the grocery total once it&rsquo;s final. I&rsquo;ll email your final balance as soon as the
         shopping is done — it&rsquo;s due 24 hours before your service date.
       </p>`
    : remaining > 0
      ? `
      <p style="font-size:15px;text-align:center;margin:18px 0 0;">Remaining balance: <strong>${formatCents(remaining, invoice.currency)}</strong>.${dueLine}</p>
      <div style="text-align:center;margin:18px 0 8px;">
        <a href="${link}" style="background:#2D4E1A;color:#FDFBF8;text-decoration:none;padding:12px 32px;font-size:14px;letter-spacing:1px;display:inline-block;">Pay Remaining Balance</a>
      </div>`
      : `<p style="font-size:15px;text-align:center;margin:18px 0 0;color:#2D4E1A;"><strong>This invoice is now paid in full — thank you!</strong></p>`;

  // Restating the acceptance makes this email itself dispute evidence.
  const acceptedLine = invoice.terms_accepted_at
    ? `<p style="font-size:12px;color:#8A8178;text-align:center;margin:18px 0 0;">
         You accepted the Tailored Taste service terms (v${escapeHtml(TERMS_VERSION)}) on
         ${escapeHtml(new Date(invoice.terms_accepted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}.
         <a href="${siteUrl()}/terms" style="color:#7A1530;">Read them again</a>
       </p>`
    : '';

  const html = wrap(`
    <h2 style="font-size:20px;margin:0 0 6px;text-align:center;">Thank you, ${escapeHtml(invoice.customer_name)}!</h2>
    <p style="font-size:15px;text-align:center;margin:0 0 20px;color:#8A8178;">Your ${label} has been received.</p>
    <table style="width:100%;font-size:15px;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 12px 8px 0;color:#8A8178;">For</td>
        <td style="padding:8px 0;text-align:right;">${invoice.description ? escapeHtml(invoice.description) : 'Invoice'}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;color:#8A8178;border-top:1px solid #EDE7DE;">Amount paid</td>
        <td style="padding:8px 0;text-align:right;border-top:1px solid #EDE7DE;font-weight:bold;">${formatCents(paidCents, invoice.currency)}</td>
      </tr>
    </table>
    ${balanceBlock}
    ${acceptedLine}
    <p style="font-size:13px;color:#8A8178;text-align:center;margin:20px 0 0;">You can view your invoice anytime at <a href="${link}" style="color:#7A1530;">your invoice page</a>. Payments are processed securely by Stripe.</p>
  `);

  return {
    subject: invoice.description
      ? `Receipt — ${invoice.description} — Tailored Taste`
      : 'Receipt from Tailored Taste',
    html,
  };
}

export function adminPaymentNotification(
  invoice: Invoice,
  paidCents: number,
  paymentType: PaymentType
): { subject: string; html: string } {
  const remaining = invoice.total_cents - invoice.amount_paid_cents;
  const html = wrap(`
    <h2 style="font-size:18px;margin:0 0 12px;text-align:center;">Payment received</h2>
    <p style="font-size:15px;margin:0;text-align:center;">
      <strong>${escapeHtml(invoice.customer_name)}</strong> paid
      <strong>${formatCents(paidCents, invoice.currency)}</strong> (${paymentType})
      on ${invoice.description ? `&quot;${escapeHtml(invoice.description)}&quot; (invoice #${invoice.invoice_number})` : `invoice #${invoice.invoice_number}`}.
    </p>
    <p style="font-size:14px;color:#8A8178;text-align:center;margin:12px 0 0;">
      ${
        remaining > 0
          ? `Remaining balance${hasUnpricedItems(invoice) ? ' so far' : ''}: ${formatCents(remaining, invoice.currency)}` +
            (hasUnpricedItems(invoice)
              ? ` + ${invoice.line_items.filter(i => i.pricing === 'tbd').length} unpriced item(s)`
              : '')
          : 'Invoice is now paid in full.'
      }
    </p>
  `);
  return {
    subject: `Payment: ${formatCents(paidCents, invoice.currency)} on invoice #${invoice.invoice_number}`,
    html,
  };
}

/**
 * Sent when the chef prices a TBD item (usually groceries). Never a bare
 * "your invoice was updated" — it states the item, the old and new totals,
 * the new balance and its deadline, and restates the terms, so the email
 * itself stands as customer_communication evidence in a dispute.
 */
export function invoiceUpdatedEmail(
  invoice: Invoice,
  change: { itemDescription: string; previousTotalCents: number }
): { subject: string; html: string } {
  const link = `${siteUrl()}/invoice/${invoice.token}`;
  const terms = buildTerms(invoice);
  const remaining = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  const stillUnpriced = hasUnpricedItems(invoice);
  const dueLine = terms.balanceDueLabel
    ? `due by <strong>${escapeHtml(terms.balanceDueLabel)}</strong>`
    : 'due 24 hours before your service date';

  const payButton =
    remaining > 0 && !stillUnpriced
      ? `<div style="text-align:center;margin:24px 0 8px;">
           <a href="${link}" style="background:#7A1530;color:#FDFBF8;text-decoration:none;padding:14px 36px;font-size:15px;letter-spacing:1px;display:inline-block;">View &amp; Pay Balance</a>
         </div>`
      : `<div style="text-align:center;margin:24px 0 8px;">
           <a href="${link}" style="background:#7A1530;color:#FDFBF8;text-decoration:none;padding:14px 36px;font-size:15px;letter-spacing:1px;display:inline-block;">View Your Invoice</a>
         </div>`;

  const html = wrap(`
    <h2 style="font-size:20px;margin:0 0 6px;text-align:center;color:#2C2C2C;">Your updated invoice</h2>
    <p style="font-size:15px;text-align:center;margin:0 0 20px;color:#8A8178;">${invoice.description ? escapeHtml(invoice.description) : 'Invoice'}</p>
    <p style="font-size:15px;margin:0 0 16px;line-height:1.6;">
      Hi ${escapeHtml(invoice.customer_name)} — I&rsquo;ve added the final cost for
      <strong>${escapeHtml(change.itemDescription)}</strong>. As noted on your invoice, this was billed at
      actual cost with no markup, and it&rsquo;s itemised below.
    </p>
    <table style="width:100%;font-size:15px;border-collapse:collapse;margin-bottom:16px;">
      ${lineItemRows(invoice)}
      <tr>
        <td colspan="2" style="padding:10px 12px 0 0;color:#8A8178;">Previous total</td>
        <td style="padding:10px 0 0;text-align:right;color:#8A8178;">${formatCents(change.previousTotalCents, invoice.currency)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 12px 0 0;font-weight:bold;">${stillUnpriced ? 'Priced so far' : 'New total'}</td>
        <td style="padding:4px 0 0;text-align:right;font-weight:bold;">${formatCents(invoice.total_cents, invoice.currency)}</td>
      </tr>
      ${
        invoice.amount_paid_cents > 0
          ? `<tr>
               <td colspan="2" style="padding:4px 12px 0 0;color:#8A8178;">Already paid</td>
               <td style="padding:4px 0 0;text-align:right;color:#8A8178;">&minus;${formatCents(invoice.amount_paid_cents, invoice.currency)}</td>
             </tr>`
          : ''
      }
      <tr>
        <td colspan="2" style="padding:8px 12px 0 0;font-weight:bold;border-top:1px solid #EDE7DE;">Balance ${stillUnpriced ? 'so far' : 'due'}</td>
        <td style="padding:8px 0 0;text-align:right;font-weight:bold;border-top:1px solid #EDE7DE;">${formatCents(remaining, invoice.currency)}</td>
      </tr>
    </table>
    <p style="font-size:15px;text-align:center;margin:0;">
      ${
        stillUnpriced
          ? 'There are still items to price — I&rsquo;ll email you again once your final balance is set.'
          : `Your balance is ${dueLine}.`
      }
    </p>
    ${payButton}
    ${notesBlock(invoice)}
    ${termsBlock(terms)}
    <p style="font-size:13px;color:#8A8178;text-align:center;margin:16px 0 0;">Payments are processed securely by Stripe.</p>
  `);

  return {
    subject: invoice.description
      ? `Your updated invoice — ${invoice.description} — Tailored Taste`
      : 'Your updated invoice — Tailored Taste',
    html,
  };
}

/** Internal alert. Disputes have a hard deadline; missing it loses by default. */
export function disputeAlertEmail(
  dispute: Stripe.Dispute,
  invoice: Invoice | null,
  dueBy: string,
  eventType: string
): { subject: string; html: string } {
  const amount = formatCents(dispute.amount, dispute.currency);
  const invoiceLine = invoice
    ? `Invoice #${invoice.invoice_number} — ${escapeHtml(invoice.customer_name)} (${escapeHtml(invoice.customer_email)})<br />
       <a href="${siteUrl()}/admin/invoices/${invoice.id}" style="color:#7A1530;">Open it in the admin</a>`
    : 'Could not match this dispute to an invoice automatically.';

  const html = wrap(`
    <h2 style="font-size:18px;margin:0 0 12px;text-align:center;color:#7A1530;">
      ${eventType === 'charge.dispute.closed' ? 'Dispute closed' : 'Payment disputed'}
    </h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 12px 6px 0;color:#8A8178;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${amount}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#8A8178;">Reason</td><td style="padding:6px 0;text-align:right;">${escapeHtml(dispute.reason)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#8A8178;">Status</td><td style="padding:6px 0;text-align:right;">${escapeHtml(dispute.status)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#8A8178;">Respond by</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${escapeHtml(dueBy)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#8A8178;">Dispute ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(dispute.id)}</td></tr>
    </table>
    <p style="font-size:14px;margin:16px 0 0;line-height:1.6;">${invoiceLine}</p>
    ${
      eventType === 'charge.dispute.closed'
        ? ''
        : `<p style="font-size:14px;margin:16px 0 0;line-height:1.6;">
             <strong>Respond before the deadline — missing it loses automatically.</strong>
             Open Stripe &rarr; Payments &rarr; Disputes. Paste the terms text from the invoice&rsquo;s
             Terms Acceptance card into &ldquo;cancellation policy disclosure&rdquo;, and attach your
             service-date confirmation and any photos.
           </p>`
    }
  `);

  return {
    subject:
      eventType === 'charge.dispute.closed'
        ? `Dispute ${dispute.status} — ${amount}`
        : `⚠️ DISPUTE ${amount} — respond by ${dueBy}`,
    html,
  };
}
