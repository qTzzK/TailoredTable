import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dbInsert, dbUpdate } from '@/lib/db';
import { getInvoiceById, hasUnpricedItems } from '@/lib/invoices';
import { expirePendingSessions } from '@/lib/pending-sessions';
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

  // Marking paid while items are unpriced would silently write off the
  // groceries — the total is not final yet.
  if (hasUnpricedItems(invoice)) {
    return NextResponse.json(
      { error: 'Price or waive the TBD items before marking this paid.' },
      { status: 409 }
    );
  }

  // Kill any open checkout first: otherwise the customer can still pay online
  // for a balance that was just settled in cash, and we owe them a refund.
  const expiry = await expirePendingSessions(invoice.id);
  if (expiry) {
    return NextResponse.json({ error: expiry.message }, { status: expiry.kind === 'settled' ? 409 : 502 });
  }

  // Re-read: a session may have settled microseconds before we expired it.
  const fresh = await getInvoiceById(invoice.id);
  if (!fresh) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  const freshRemaining = fresh.total_cents - fresh.amount_paid_cents;
  if (fresh.status === 'paid' || fresh.status === 'void' || freshRemaining <= 0) {
    return NextResponse.json({ error: 'This invoice cannot be marked paid.' }, { status: 409 });
  }

  const now = new Date().toISOString();

  // Atomic status guard first — a concurrent Stripe settlement loses no money.
  // The total_cents term is not optional: a reprice landing between this
  // route's read and its write changes neither status nor amount_paid_cents,
  // so without it we would write the stale, lower total and flip to 'paid'.
  const updated = await dbUpdate(
    'invoices',
    `id=eq.${fresh.id}&status=in.("draft","sent","deposit_paid")` +
      `&amount_paid_cents=eq.${fresh.amount_paid_cents}` +
      `&total_cents=eq.${fresh.total_cents}`,
    { status: 'paid', amount_paid_cents: fresh.total_cents, paid_at: now, updated_at: now }
  );
  if (updated.length === 0) {
    return NextResponse.json({ error: 'The invoice changed underneath you — refresh and try again.' }, { status: 409 });
  }

  try {
    await dbInsert('payments', {
      invoice_id: fresh.id,
      stripe_session_id: `manual-${randomBytes(12).toString('base64url')}`,
      amount_cents: freshRemaining,
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
