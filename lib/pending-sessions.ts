import 'server-only';
import { dbSelect, dbUpdate } from './db';
import { stripe } from './stripe';
import type { Payment } from './types';

// Any admin action that changes what a customer owes — pricing a TBD item,
// voiding, settling offline — must first kill every open Stripe session on the
// invoice. Otherwise a customer holding a mounted checkout can complete a
// payment computed from the pre-change state: paying a stale balance, paying a
// voided invoice, or paying twice for an offline settlement.
//
// Returns null on success, or a description of why the caller must stop.
export type ExpiryFailure =
  | { kind: 'settled'; message: string }
  | { kind: 'error'; message: string };

export async function expirePendingSessions(invoiceId: string): Promise<ExpiryFailure | null> {
  const pending = await dbSelect<Payment>('payments', `invoice_id=eq.${invoiceId}&status=eq.pending`);

  for (const p of pending) {
    if (p.stripe_session_id.startsWith('manual-')) continue;
    try {
      await stripe().checkout.sessions.expire(p.stripe_session_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Stripe refuses to expire a completed session — the customer paid in
      // the moment before we got here.
      if (/complete/i.test(msg)) {
        return { kind: 'settled', message: 'A payment just came in — refresh and try again.' };
      }
      console.error('Failed to expire Stripe session:', err);
      return { kind: 'error', message: 'Could not safely update this invoice. Try again.' };
    }
    // The resulting checkout.session.expired webhook is idempotent, so this
    // duplicate write is harmless.
    await dbUpdate('payments', `stripe_session_id=eq.${p.stripe_session_id}&status=eq.pending`, {
      status: 'expired',
    });
  }
  return null;
}
