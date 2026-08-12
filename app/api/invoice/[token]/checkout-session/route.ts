import { NextResponse } from 'next/server';
import { dbInsert } from '@/lib/db';
import { siteUrl } from '@/lib/env';
import { allowedPaymentTypes, getInvoiceByToken, paymentAmountCents } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';
import type { PaymentType } from '@/lib/types';

// Public, token-gated: possessing the 256-bit invoice token is the customer's
// capability. The client sends ONLY a payment_type — every amount is computed
// server-side from the invoice row.

const PAY_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Remaining balance',
  full: 'Payment',
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  let paymentType: unknown;
  try {
    ({ payment_type: paymentType } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const allowed = allowedPaymentTypes(invoice);
  if (typeof paymentType !== 'string' || !allowed.includes(paymentType as PaymentType)) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }
  const type = paymentType as PaymentType;

  const amount = paymentAmountCents(invoice, type);
  if (amount < 50) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: `${siteUrl()}/invoice/${invoice.token}?session_id={CHECKOUT_SESSION_ID}`,
        customer_email: invoice.customer_email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: invoice.currency,
              unit_amount: amount,
              product_data: {
                // Customers see the invoice's description ("Italian Dinner"),
                // not an internal invoice number.
                name: invoice.description
                  ? `${invoice.description.slice(0, 200)} — ${PAY_LABEL[type]} — Tailored Taste`
                  : `${PAY_LABEL[type]} — Tailored Taste`,
              },
            },
          },
        ],
        metadata: { invoice_id: invoice.id, payment_type: type },
        payment_intent_data: { metadata: { invoice_id: invoice.id, payment_type: type } },
        // No expires_at: the default is already 24h, and a second-precision
        // timestamp here would break idempotency-key reuse within the same
        // minute (same key + different params = Stripe idempotency_error).
      },
      // Absorbs double-clicks: same invoice+type within the same minute reuses
      // one session instead of creating several.
      { idempotencyKey: `inv-${invoice.id}-${type}-${Math.floor(Date.now() / 60000)}` }
    );

    try {
      await dbInsert('payments', {
        invoice_id: invoice.id,
        stripe_session_id: session.id,
        amount_cents: amount,
        payment_type: type,
        status: 'pending',
      });
    } catch (err) {
      // Unique-violation when the idempotency key returned an existing
      // session — the pending row is already there, which is exactly right.
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('23505') && !message.includes('duplicate')) throw err;
    }

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkout session creation failed:', err);
    return NextResponse.json({ error: 'Unable to start the payment. Please try again.' }, { status: 500 });
  }
}
