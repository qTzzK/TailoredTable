import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { dbSelect, dbUpdate } from '@/lib/db';
import { adminPaymentNotification, disputeAlertEmail, receiptEmail, sendEmail } from '@/lib/email';
import { requireEnv } from '@/lib/env';
import { getInvoiceById } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';
import type { Invoice, Payment } from '@/lib/types';

// This endpoint has no session auth by design: the Stripe signature over the
// raw body IS the authentication. Settlement is idempotent — the conditional
// "pending -> succeeded" update fires exactly once per session, so webhook
// retries and replays can never double-count a payment.

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch (err) {
    console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Async payment methods complete the session before the money moves;
        // those settle on async_payment_succeeded instead.
        if (session.payment_status === 'paid') await settle(session);
        break;
      }
      case 'checkout.session.async_payment_succeeded':
        await settle(event.data.object);
        break;
      case 'checkout.session.async_payment_failed':
        await markPayment(event.data.object.id, 'failed');
        break;
      case 'checkout.session.expired':
        await markPayment(event.data.object.id, 'expired');
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        await alertDispute(event.data.object, event.type);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    // Non-2xx makes Stripe retry — settlement is idempotent, so that's safe.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function markPayment(sessionId: string, status: 'failed' | 'expired'): Promise<void> {
  await dbUpdate('payments', `stripe_session_id=eq.${sessionId}&status=eq.pending`, { status });
}

// Disputes have a hard evidence deadline (7-21 days) and missing it is an
// automatic total loss, so the only thing that matters here is that the chef
// finds out within minutes. Stripe's dashboard stays the system of record.
async function alertDispute(dispute: Stripe.Dispute, eventType: string): Promise<void> {
  const pi =
    typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
  const [payment] = pi
    ? await dbSelect<Payment>('payments', `stripe_payment_intent_id=eq.${pi}&limit=1`)
    : [];
  const invoice = payment ? await getInvoiceById(payment.invoice_id) : null;
  const dueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString().slice(0, 16).replace('T', ' ')
    : 'ASAP';

  console.error(
    `DISPUTE ${eventType} ${dispute.id} ${dispute.amount} ${dispute.reason} ${dispute.status} due_by=${dueBy}`
  );

  const adminTo = process.env.CONTACT_TO;
  if (!adminTo) return;
  const note = disputeAlertEmail(dispute, invoice, dueBy, eventType);
  await sendEmail({ to: adminTo, subject: note.subject, html: note.html });
}

async function settle(session: Stripe.Checkout.Session): Promise<void> {
  // Exactly-once anchor: only the transition pending -> succeeded returns a row.
  const now = new Date().toISOString();
  const settled = await dbUpdate<Payment>(
    'payments',
    `stripe_session_id=eq.${session.id}&status=eq.pending`,
    {
      status: 'succeeded',
      paid_at: now,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    }
  );
  if (settled.length === 0) return; // replay or unknown session — already handled
  const payment = settled[0];

  // Apply to the invoice with compare-and-set on amount_paid_cents so two
  // near-simultaneous settlements both count exactly once.
  let invoice: Invoice | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getInvoiceById(payment.invoice_id);
    if (!current) {
      console.error(`Webhook: invoice ${payment.invoice_id} not found for payment ${payment.id}`);
      return;
    }
    // The cap below discards anything above the total. Say so loudly — this
    // is the difference between quietly keeping money and knowing a refund
    // is owed (e.g. a customer who paid a deposit and then paid in full).
    const overpaidBy = current.amount_paid_cents + payment.amount_cents - current.total_cents;
    if (overpaidBy > 0) {
      console.error(
        `OVERPAYMENT invoice=${current.id} #${current.invoice_number} payment=${payment.id} ` +
          `excess_cents=${overpaidBy} — a refund is owed`
      );
    }

    const newPaid = Math.min(current.amount_paid_cents + payment.amount_cents, current.total_cents);
    const fullyPaid = newPaid >= current.total_cents;
    const updated = await dbUpdate<Invoice>(
      'invoices',
      `id=eq.${current.id}&amount_paid_cents=eq.${current.amount_paid_cents}`,
      {
        amount_paid_cents: newPaid,
        status: fullyPaid ? 'paid' : 'deposit_paid',
        ...(fullyPaid ? { paid_at: now } : {}),
        updated_at: now,
      }
    );
    if (updated.length > 0) {
      invoice = updated[0];
      break;
    }
  }
  if (!invoice) {
    console.error(`Webhook: failed to apply payment ${payment.id} to invoice after retries`);
    return;
  }

  // Emails are fire-and-forget: a failure must not make Stripe retry the
  // event (the money is already recorded).
  try {
    const receipt = receiptEmail(invoice, payment.amount_cents, payment.payment_type);
    await sendEmail({ to: invoice.customer_email, subject: receipt.subject, html: receipt.html });

    const adminTo = process.env.CONTACT_TO;
    if (adminTo) {
      const note = adminPaymentNotification(invoice, payment.amount_cents, payment.payment_type);
      await sendEmail({ to: adminTo, subject: note.subject, html: note.html });
    }
  } catch (err) {
    console.error('Post-payment email failed:', err);
  }
}
