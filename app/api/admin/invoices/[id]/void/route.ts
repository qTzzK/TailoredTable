import { NextResponse } from 'next/server';
import { dbUpdate } from '@/lib/db';
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

  // Atomic: the status filter means a concurrent payment/void can't be overwritten.
  const updated = await dbUpdate(
    'invoices',
    `id=eq.${invoice.id}&status=in.("draft","sent","deposit_paid")`,
    { status: 'void', voided_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  );

  if (updated.length === 0) {
    return NextResponse.json({ error: 'This invoice can no longer be voided.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
