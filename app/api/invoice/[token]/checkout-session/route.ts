import { NextResponse } from 'next/server';
import { recordAcceptance } from '@/lib/accept-terms';
import { dbInsert, dbUpdate } from '@/lib/db';
import { descriptorSuffix } from '@/lib/descriptor';
import { siteUrl } from '@/lib/env';
import { allowedPaymentTypes, getInvoiceByToken, paymentAmountCents } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';
import { TERMS_VERSION } from '@/lib/terms';
import type { CustomerPaymentType } from '@/lib/types';

// Public, token-gated: possessing the 256-bit invoice token is the customer's
// capability. The client sends ONLY a payment_type and a terms acknowledgement
// — every amount is computed server-side from the invoice row, and the terms
// text is rebuilt from that row rather than trusted from the client.

const PAY_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Remaining balance',
  full: 'Payment',
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const allowed = allowedPaymentTypes(invoice);
  const paymentType = body.payment_type;
  if (typeof paymentType !== 'string' || !allowed.includes(paymentType as CustomerPaymentType)) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }
  const type = paymentType as CustomerPaymentType;

  const amount = paymentAmountCents(invoice, type);
  if (amount < 50) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }

  const acceptance = await recordAcceptance({ req, invoice, type, amount, method: 'card', body });
  if (!acceptance.ok) {
    return NextResponse.json(
      { error: acceptance.error, ...(acceptance.stale ? { stale: true } : {}) },
      { status: acceptance.status }
    );
  }
  const { acceptanceId } = acceptance;

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: `${siteUrl()}/invoice/${invoice.token}?session_id={CHECKOUT_SESSION_ID}`,
        customer_email: invoice.customer_email,
        // AVS: a billing postal code lets the issuer verify the card, and
        // Stripe attaches the AVS/CVC result to dispute evidence.
        billing_address_collection: 'required',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: invoice.currency,
              unit_amount: amount,
              product_data: {
                // Customers see the invoice's description, not a number.
                name: invoice.description
                  ? `${invoice.description.slice(0, 180)} — ${PAY_LABEL[type]} — Tailored Taste`
                  : `${PAY_LABEL[type]} — Tailored Taste`,
              },
            },
          },
        ],
        metadata: { invoice_id: invoice.id, payment_type: type, terms_version: TERMS_VERSION },
        payment_intent_data: {
          description:
            `Tailored Taste — Invoice #${invoice.invoice_number} — ${PAY_LABEL[type]}` +
            (invoice.service_date ? ` — private chef service on ${invoice.service_date}` : ''),
          // "I don't recognize this charge" is the cheapest dispute to prevent.
          statement_descriptor_suffix: descriptorSuffix(invoice.invoice_number),
          metadata: {
            invoice_id: invoice.id,
            invoice_number: String(invoice.invoice_number),
            payment_type: type,
            service_date: invoice.service_date ?? '',
            terms_version: TERMS_VERSION,
          },
        },
        // Belt-and-braces: Stripe records consent.terms_of_service='accepted'
        // on the session. REQUIRES a Terms-of-service URL in the Dashboard's
        // public business details, or session creation ERRORS — hence the env
        // flag, so deploy order can never take payments down.
        ...(process.env.STRIPE_TOS_CONSENT === 'on'
          ? {
              consent_collection: { terms_of_service: 'required' as const },
              custom_text: {
                terms_of_service_acceptance: {
                  message:
                    `I agree to the [Tailored Taste Service Terms](${siteUrl()}/terms) — the balance ` +
                    `and grocery costs are due 24 hours before the service date, and cancellations ` +
                    `within 48 hours of the service date forfeit the deposit.`,
                },
              },
            }
          : {}),
      },
      // Absorbs double-clicks. The AMOUNT is in the key because a reprice
      // between two clicks in the same minute would otherwise reuse the key
      // with different params, which Stripe rejects.
      { idempotencyKey: `inv-${invoice.id}-${type}-${amount}-${Math.floor(Date.now() / 60000)}` }
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

    // Links the acceptance to the charge. If this fails the evidence still
    // exists (matched by invoice + timestamp), but log it loudly enough to be
    // found later, since it is what the receipt email keys off.
    try {
      await dbUpdate('terms_acceptances', `id=eq.${acceptanceId}`, { stripe_session_id: session.id });
    } catch (err) {
      console.error(
        `ACCEPTANCE UNLINKED acceptance=${acceptanceId} session=${session.id} invoice=${invoice.id} — ` +
          `dispute evidence exists but is not joined to the charge`,
        err
      );
    }

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkout session creation failed:', err);
    return NextResponse.json({ error: 'Unable to start the payment. Please try again.' }, { status: 500 });
  }
}
