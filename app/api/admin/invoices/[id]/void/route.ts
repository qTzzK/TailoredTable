import { NextResponse } from 'next/server';
import { dbUpdate } from '@/lib/db';
import { getInvoiceById } from '@/lib/invoices';
import { expirePendingSessions } from '@/lib/pending-sessions';
import { rejectCrossSite, requireAdmin } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  // Kill any open checkout first, or a customer with the page still mounted
  // can pay after the void — the webhook now refuses to apply that payment,
  // but taking the money at all means an avoidable refund.
  const expiry = await expirePendingSessions(invoice.id);
  if (expiry) {
    return NextResponse.json({ error: expiry.message }, { status: expiry.kind === 'settled' ? 409 : 502 });
  }

  // Re-read: a session may have settled microseconds before we expired it.
  const fresh = await getInvoiceById(invoice.id);
  if (!fresh) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const now = new Date().toISOString();
  // Atomic: the status filter means a concurrent payment/void can't be
  // overwritten, and amount_paid_cents surfaces a settlement that raced us.
  const updated = await dbUpdate(
    'invoices',
    `id=eq.${fresh.id}&status=in.("draft","sent","deposit_paid")` +
      `&amount_paid_cents=eq.${fresh.amount_paid_cents}`,
    { status: 'void', voided_at: now, updated_at: now }
  );

  if (updated.length === 0) {
    return NextResponse.json({ error: 'This invoice can no longer be voided.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
