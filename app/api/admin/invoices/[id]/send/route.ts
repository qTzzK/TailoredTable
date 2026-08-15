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

  const now = new Date().toISOString();

  // Telemetry always lands: this write touches no money and no status.
  try {
    await dbUpdate('invoices', `id=eq.${invoice.id}`, {
      ...(result.sent ? { sent_at: now } : {}),
      last_email_status: emailStatus,
      last_email_error: result.sent ? null : result.error || null,
      updated_at: now,
    });
  } catch (err) {
    console.error('Failed to record email outcome:', err);
  }

  // The status advance is a separate compare-and-set. The filter re-checks
  // 'draft' at write time, so a deposit that settled during the Resend round
  // trip is never stomped back to 'sent' — which would re-offer "Pay in Full"
  // on top of a deposit the customer had already paid.
  if (result.sent) {
    try {
      await dbUpdate('invoices', `id=eq.${invoice.id}&status=eq.draft`, { status: 'sent', updated_at: now });
    } catch (err) {
      console.error('Failed to advance invoice to sent:', err);
    }
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
