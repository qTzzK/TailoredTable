import { NextResponse } from 'next/server';
import { dbInsert, dbUpdate } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getInvoiceById } from '@/lib/invoices';
import {
  buildSender,
  parseRecipients,
  plainToHtml,
  prepareAttachments,
  validateBody,
  validateSubject,
} from '@/lib/outbound-mail';
import { rejectCrossSite, requireAdmin } from '@/lib/session';
import type { SentEmail } from '@/lib/types';

// Admin-composed email: any sender at the verified domain, optional PDF/Word
// attachments (the contract). Attachments travel browser -> here -> Resend as
// multipart form data and are never written to disk or storage.

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the form. If you attached large files, try fewer or smaller ones.' }, { status: 400 });
  }

  const sender = buildSender(form.get('from_name'), form.get('from_local'));
  if (!sender.ok) return NextResponse.json({ error: sender.error }, { status: 400 });

  const to = parseRecipients(form.get('to'), 'To', true);
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });
  const cc = parseRecipients(form.get('cc'), 'Cc', false);
  if (!cc.ok) return NextResponse.json({ error: cc.error }, { status: 400 });
  const replyTo = parseRecipients(form.get('reply_to'), 'Reply-To', false);
  if (!replyTo.ok) return NextResponse.json({ error: replyTo.error }, { status: 400 });
  if (replyTo.value.length > 1) {
    return NextResponse.json({ error: 'Reply-To takes a single address.' }, { status: 400 });
  }

  const subject = validateSubject(form.get('subject'));
  if (!subject.ok) return NextResponse.json({ error: subject.error }, { status: 400 });
  const body = validateBody(form.get('body'));
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const attachments = await prepareAttachments(files);
  if (!attachments.ok) return NextResponse.json({ error: attachments.error }, { status: 400 });

  // The invoice link is optional context for the log. A bad id is dropped,
  // not rejected — it must never block a contract from going out.
  let invoiceId: string | null = null;
  const rawInvoiceId = form.get('invoice_id');
  if (typeof rawInvoiceId === 'string' && rawInvoiceId) {
    const invoice = await getInvoiceById(rawInvoiceId).catch(() => null);
    invoiceId = invoice?.id ?? null;
  }

  // Log first, send second: a crash mid-send still leaves a 'sending' row,
  // which is far better than a contract that may or may not have gone out.
  let logId: string | null = null;
  try {
    const row = await dbInsert<SentEmail>('sent_emails', {
      invoice_id: invoiceId,
      from_address: sender.value,
      to_addresses: to.value,
      cc_addresses: cc.value,
      reply_to: replyTo.value[0] ?? null,
      subject: subject.value,
      body_text: body.value,
      attachments: attachments.value.forLog,
      status: 'sending',
    });
    logId = row.id;
  } catch (err) {
    console.error('Failed to log outbound email before sending:', err);
  }

  const result = await sendEmail({
    from: sender.value,
    to: to.value,
    cc: cc.value.length ? cc.value : undefined,
    replyTo: replyTo.value[0],
    subject: subject.value,
    html: plainToHtml(body.value),
    text: body.value,
    attachments: attachments.value.forResend.length ? attachments.value.forResend : undefined,
  });

  if (logId) {
    try {
      await dbUpdate('sent_emails', `id=eq.${logId}`, {
        status: result.sent ? 'sent' : 'failed',
        resend_id: result.id ?? null,
        error: result.sent ? null : result.error || 'send_failed',
      });
    } catch (err) {
      console.error('Failed to record outbound email outcome:', err);
    }
  }

  if (result.sent) {
    const count = to.value.length + cc.value.length;
    const attached = attachments.value.forLog.length;
    return NextResponse.json({
      ok: true,
      notice:
        `Sent to ${to.value.join(', ')}` +
        (cc.value.length ? ` (cc ${cc.value.join(', ')})` : '') +
        (attached ? ` with ${attached} attachment${attached === 1 ? '' : 's'}` : '') +
        (count > 1 ? '.' : '.'),
    });
  }
  if (result.error === 'not_configured') {
    return NextResponse.json(
      { error: 'Email is not configured yet — RESEND_API_KEY is not set, so nothing was sent.' },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: `The email failed to send${result.error ? ` (${result.error})` : ''}. Nothing was delivered — fix the issue and try again.` },
    { status: 502 }
  );
}
