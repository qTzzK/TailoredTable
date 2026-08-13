import { NextResponse } from 'next/server';
import { dbSelect, dbUpdate } from '@/lib/db';
import { invoiceUpdatedEmail, sendEmail } from '@/lib/email';
import { LIMITS, computeTotalCents, getInvoiceById } from '@/lib/invoices';
import { rejectCrossSite, requireAdmin } from '@/lib/session';
import { stripe } from '@/lib/stripe';
import type { Invoice, LineItem, Payment } from '@/lib/types';

// Sets the price of a TBD line item (e.g. groceries, once shopped) and
// re-totals the invoice. This is the ONE controlled mutation on an otherwise
// immutable invoice, so every guard here is load-bearing:
//   - only items CREATED as TBD may be priced, which is what structurally
//     preserves deposit_cents < total_cents (prices only ever get added)
//   - pending Stripe sessions are expired FIRST, so nobody can pay a stale
//     balance computed from the old total
//   - the write is one atomic compare-and-set over status, amount_paid_cents
//     and updated_at

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (invoice.status === 'paid' || invoice.status === 'void') {
    return NextResponse.json({ error: 'This invoice can no longer be changed.' }, { status: 409 });
  }

  const itemId = body.item_id;
  if (typeof itemId !== 'string' || !itemId) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const item = invoice.line_items.find(i => i.id === itemId);
  if (!item) return NextResponse.json({ error: 'Line item not found.' }, { status: 404 });

  // Items priced at creation are frozen — this is what guarantees the total
  // can only ever grow, keeping deposit_cents < total_cents true forever.
  if (item.pricing !== 'tbd' && item.origin !== 'tbd') {
    return NextResponse.json(
      {
        error:
          'Only to-be-determined items can be priced. To fix an original line item, void this invoice and create a new one.',
      },
      { status: 403 }
    );
  }
  if (item.priced_at && body.confirm_reprice !== true) {
    return NextResponse.json({ error: 'This item already has a price. Confirm to change it.' }, { status: 409 });
  }

  const unit = body.unit_amount_cents;
  if (!Number.isInteger(unit) || (unit as number) < 0 || (unit as number) > LIMITS.maxUnitCents) {
    return NextResponse.json({ error: 'Price must be between $0.00 and $100,000.' }, { status: 400 });
  }
  const unitCents = unit as number;

  let quantity = item.quantity;
  if (body.quantity !== undefined && body.quantity !== null) {
    if (!Number.isInteger(body.quantity) || (body.quantity as number) < 1 || (body.quantity as number) > LIMITS.maxQuantity) {
      return NextResponse.json({ error: 'Quantity must be a whole number between 1 and 1000.' }, { status: 400 });
    }
    quantity = body.quantity as number;
  }

  // Expire every pending Stripe session BEFORE writing anything: otherwise a
  // customer holding an open checkout could pay a balance computed from the
  // pre-reprice total. Never continue past a failed expire.
  const pending = await dbSelect<Payment>('payments', `invoice_id=eq.${invoice.id}&status=eq.pending`);
  for (const p of pending) {
    if (p.stripe_session_id.startsWith('manual-')) continue;
    try {
      await stripe().checkout.sessions.expire(p.stripe_session_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/complete/i.test(msg)) {
        return NextResponse.json({ error: 'A payment just came in — refresh and try again.' }, { status: 409 });
      }
      console.error('Failed to expire session before reprice:', err);
      return NextResponse.json({ error: 'Could not safely update the price. Try again.' }, { status: 502 });
    }
    // The resulting checkout.session.expired webhook is idempotent, so this
    // duplicate write is harmless.
    await dbUpdate('payments', `stripe_session_id=eq.${p.stripe_session_id}&status=eq.pending`, {
      status: 'expired',
    });
  }

  // Re-read: a session may have settled microseconds before we expired it.
  const fresh = await getInvoiceById(invoice.id);
  if (!fresh) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (fresh.status === 'paid' || fresh.status === 'void') {
    return NextResponse.json({ error: 'This invoice can no longer be changed.' }, { status: 409 });
  }
  if (typeof body.expected_updated_at === 'string' && fresh.updated_at !== body.expected_updated_at) {
    return NextResponse.json({ error: 'The invoice changed underneath you — refresh and try again.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const nextItems: LineItem[] = fresh.line_items.map(i =>
    i.id === itemId
      ? {
          ...i,
          quantity,
          pricing: unitCents === 0 ? ('waived' as const) : ('priced' as const),
          unit_amount_cents: unitCents,
          origin: 'tbd' as const,
          priced_at: now,
          previous_unit_amount_cents: i.unit_amount_cents,
        }
      : i
  );

  // Recomputed server-side; a client-sent total is never read.
  const nextTotal = computeTotalCents(nextItems);

  if (nextTotal < fresh.amount_paid_cents) {
    return NextResponse.json(
      { error: 'That price would drop the total below what has already been paid. Refund the difference in Stripe first.' },
      { status: 400 }
    );
  }
  if (fresh.deposit_cents !== null && nextTotal <= fresh.deposit_cents) {
    return NextResponse.json(
      { error: 'The total must stay above the deposit amount.' },
      { status: 400 }
    );
  }
  if (nextTotal < 50 || nextTotal > LIMITS.maxTotalCents) {
    return NextResponse.json({ error: 'That price puts the invoice total out of range.' }, { status: 400 });
  }

  // One atomic compare-and-set. Each term closes a specific race:
  //   status=in.(...)          -> blocks pricing a paid/voided invoice
  //   amount_paid_cents=eq.    -> races the webhook's own settlement CAS
  //   updated_at=eq.           -> races a second concurrent reprice, which
  //                               changes neither of the other two terms
  // encodeURIComponent is mandatory: the timestamp contains '+', which
  // PostgREST would otherwise read as a space and never match.
  const filter =
    `id=eq.${fresh.id}` +
    `&status=in.("draft","sent","deposit_paid")` +
    `&amount_paid_cents=eq.${fresh.amount_paid_cents}` +
    `&updated_at=eq.${encodeURIComponent(fresh.updated_at)}`;

  const updated = await dbUpdate<Invoice>('invoices', filter, {
    line_items: nextItems,
    total_cents: nextTotal,
    updated_at: now,
  });
  if (updated.length === 0) {
    return NextResponse.json({ error: 'The invoice changed underneath you — refresh and try again.' }, { status: 409 });
  }
  const saved = updated[0];

  // The price is committed. Email is best-effort from here on.
  const notify = typeof body.notify === 'boolean' ? body.notify : saved.status !== 'draft';
  let emailSent = false;
  if (notify) {
    const { subject, html } = invoiceUpdatedEmail(saved, {
      itemDescription: item.description,
      previousTotalCents: fresh.total_cents,
    });
    const result = await sendEmail({ to: saved.customer_email, subject, html });
    emailSent = result.sent;
    try {
      await dbUpdate('invoices', `id=eq.${saved.id}`, {
        last_email_status: result.sent ? 'sent' : result.error === 'not_configured' ? 'skipped_no_api_key' : 'failed',
        last_email_error: result.sent ? null : result.error || null,
      });
    } catch (err) {
      console.error('Failed to record reprice email outcome:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    total_cents: saved.total_cents,
    amount_paid_cents: saved.amount_paid_cents,
    balance_cents: Math.max(saved.total_cents - saved.amount_paid_cents, 0),
    has_unpriced_items: saved.line_items.some(i => i.pricing === 'tbd'),
    updated_at: saved.updated_at,
    email: { sent: emailSent },
  });
}
