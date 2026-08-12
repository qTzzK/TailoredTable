import { NextResponse } from 'next/server';
import { dbUpdate } from '@/lib/db';
import { invoiceEmail, sendEmail } from '@/lib/email';
import { getInvoiceById } from '@/lib/invoices';
import { rejectCrossSite, requireAdmin } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (invoice.status === 'paid' || invoice.status === 'void') {
    return NextResponse.json({ error: 'This invoice can no longer be sent.' }, { status: 409 });
  }

  const { subject, html } = invoiceEmail(invoice);
  const result = await sendEmail({ to: invoice.customer_email, subject, html });

  const emailStatus = result.sent ? 'sent' : result.error === 'not_configured' ? 'skipped_no_api_key' : 'failed';

  try {
    await dbUpdate('invoices', `id=eq.${invoice.id}`, {
      // The invoice only advances to 'sent' when the email actually went out.
      ...(result.sent && invoice.status === 'draft' ? { status: 'sent' } : {}),
      ...(result.sent ? { sent_at: new Date().toISOString() } : {}),
      last_email_status: emailStatus,
      last_email_error: result.sent ? null : result.error || null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to record email outcome:', err);
  }

  if (result.sent) {
    return NextResponse.json({ ok: true, notice: `Invoice emailed to ${invoice.customer_email}.` });
  }
  if (result.error === 'not_configured') {
    return NextResponse.json({
      ok: false,
      notice: 'Email is not configured yet — copy the invoice link and share it directly.',
    });
  }
  return NextResponse.json({ error: 'The email failed to send. Try again, or share the link directly.' }, { status: 502 });
}
