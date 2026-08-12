import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dbInsert, dbUpdate } from '@/lib/db';
import { getInvoiceById } from '@/lib/invoices';
import { rejectCrossSite, requireAdmin } from '@/lib/session';

// Settles the remaining balance offline (cash, Zelle, etc.).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const remaining = invoice.total_cents - invoice.amount_paid_cents;
  if (invoice.status === 'paid' || invoice.status === 'void' || remaining <= 0) {
    return NextResponse.json({ error: 'This invoice cannot be marked paid.' }, { status: 409 });
  }

  const now = new Date().toISOString();

  // Atomic status guard first — a concurrent Stripe settlement loses no money.
  const updated = await dbUpdate(
    'invoices',
    `id=eq.${invoice.id}&status=in.("draft","sent","deposit_paid")&amount_paid_cents=eq.${invoice.amount_paid_cents}`,
    { status: 'paid', amount_paid_cents: invoice.total_cents, paid_at: now, updated_at: now }
  );
  if (updated.length === 0) {
    return NextResponse.json({ error: 'The invoice changed underneath you — refresh and try again.' }, { status: 409 });
  }

  try {
    await dbInsert('payments', {
      invoice_id: invoice.id,
      stripe_session_id: `manual-${randomBytes(12).toString('base64url')}`,
      amount_cents: remaining,
      payment_type: 'manual',
      status: 'succeeded',
      paid_at: now,
    });
  } catch (err) {
    // The invoice is already marked paid; the payment row is bookkeeping.
    console.error('Failed to record manual payment row:', err);
  }

  return NextResponse.json({ ok: true });
}
