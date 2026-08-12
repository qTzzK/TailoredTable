import 'server-only';
import { siteUrl } from './env';
import { formatCents } from './money';
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
    .map(
      item => `
      <tr>
        <td style="padding:6px 12px 6px 0;border-bottom:1px solid #EDE7DE;">${escapeHtml(item.description)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #EDE7DE;text-align:center;color:#8A8178;">×${item.quantity}</td>
        <td style="padding:6px 0;border-bottom:1px solid #EDE7DE;text-align:right;">${formatCents(item.quantity * item.unit_amount_cents, invoice.currency)}</td>
      </tr>`
    )
    .join('');
}

export function invoiceEmail(invoice: Invoice): { subject: string; html: string } {
  const link = `${siteUrl()}/invoice/${invoice.token}`;
  const due = invoice.due_date
    ? `<p style="font-size:14px;color:#8A8178;text-align:center;margin:4px 0 0;">Due ${escapeHtml(invoice.due_date)}</p>`
    : '';
  const deposit =
    invoice.deposit_cents && invoice.status !== 'deposit_paid'
      ? `<p style="font-size:15px;text-align:center;margin:12px 0 0;color:#2D4E1A;">A deposit of <strong>${formatCents(invoice.deposit_cents, invoice.currency)}</strong> is available to reserve your date — or pay in full.</p>`
      : '';

  const html = wrap(`
    <h2 style="font-size:20px;margin:0 0 6px;text-align:center;color:#2C2C2C;">${invoice.description ? escapeHtml(invoice.description) : 'Invoice'}</h2>
    <p style="font-size:15px;text-align:center;margin:0 0 20px;color:#8A8178;">for ${escapeHtml(invoice.customer_name)}</p>
    <table style="width:100%;font-size:15px;border-collapse:collapse;margin-bottom:16px;">
      ${lineItemRows(invoice)}
      <tr>
        <td colspan="2" style="padding:10px 12px 0 0;font-weight:bold;">Total</td>
        <td style="padding:10px 0 0;text-align:right;font-weight:bold;">${formatCents(invoice.total_cents, invoice.currency)}</td>
      </tr>
    </table>
    ${due}
    ${deposit}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${link}" style="background:#7A1530;color:#FDFBF8;text-decoration:none;padding:14px 36px;font-size:15px;letter-spacing:1px;display:inline-block;">View &amp; Pay Invoice</a>
    </div>
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

  const balanceBlock =
    remaining > 0
      ? `
      <p style="font-size:15px;text-align:center;margin:18px 0 0;">Remaining balance: <strong>${formatCents(remaining, invoice.currency)}</strong></p>
      <div style="text-align:center;margin:18px 0 8px;">
        <a href="${link}" style="background:#2D4E1A;color:#FDFBF8;text-decoration:none;padding:12px 32px;font-size:14px;letter-spacing:1px;display:inline-block;">Pay Remaining Balance</a>
      </div>`
      : `<p style="font-size:15px;text-align:center;margin:18px 0 0;color:#2D4E1A;"><strong>This invoice is now paid in full — thank you!</strong></p>`;

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
    <p style="font-size:13px;color:#8A8178;text-align:center;margin:20px 0 0;">You can view your invoice anytime at the link above. Payments are processed securely by Stripe.</p>
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
      ${remaining > 0 ? `Remaining balance: ${formatCents(remaining, invoice.currency)}` : 'Invoice is now paid in full.'}
    </p>
  `);
  return {
    subject: `Payment: ${formatCents(paidCents, invoice.currency)} on invoice #${invoice.invoice_number}`,
    html,
  };
}
