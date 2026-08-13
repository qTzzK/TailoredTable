import { NextResponse } from 'next/server';
import { dbInsert, dbUpdate } from '@/lib/db';
import { descriptorSuffix } from '@/lib/descriptor';
import { siteUrl } from '@/lib/env';
import { allowedPaymentTypes, getInvoiceByToken, paymentAmountCents } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';
import { TERMS_VERSION, balanceDueDate, buildTerms, cancelCutoffDate, termsPlainText } from '@/lib/terms';
import type { PaymentType } from '@/lib/types';

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
  if (typeof paymentType !== 'string' || !allowed.includes(paymentType as PaymentType)) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }
  const type = paymentType as PaymentType;

  const amount = paymentAmountCents(invoice, type);
  if (amount < 50) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }

  // Terms gate — enforced here, not just in the UI. This acceptance record is
  // the single highest-value artifact in a chargeback: it proves what text was
  // on screen, when, from where, and for which amount.
  if (body.accept_terms !== true || body.terms_version !== TERMS_VERSION) {
    return NextResponse.json({ error: 'Please accept the service terms to continue.' }, { status: 400 });
  }

  const terms = buildTerms(invoice);
  const acceptedAt = new Date().toISOString();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 60) ||
    req.headers.get('x-real-ip')?.slice(0, 60) ||
    null;

  let acceptanceId: string | null = null;
  try {
    const row = await dbInsert<{ id: string }>('terms_acceptances', {
      invoice_id: invoice.id,
      terms_version: TERMS_VERSION,
      payment_type: type,
      accepted_at: acceptedAt,
      ip,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400) || null,
      terms_text: termsPlainText(terms),
      snapshot: {
        invoice_number: invoice.invoice_number,
        currency: invoice.currency,
        total_cents: invoice.total_cents,
        deposit_cents: invoice.deposit_cents,
        amount_paid_cents: invoice.amount_paid_cents,
        charge_cents: amount,
        service_date: invoice.service_date,
        service_time: invoice.service_time,
        balance_due_date: balanceDueDate(invoice),
        cancel_cutoff_date: cancelCutoffDate(invoice),
        line_items: invoice.line_items,
      },
    });
    acceptanceId = row.id;
    // First acceptance only.
    await dbUpdate('invoices', `id=eq.${invoice.id}&terms_accepted_at=is.null`, {
      terms_accepted_at: acceptedAt,
    });
  } catch (err) {
    // A logging failure must never block a payment: terms_version also rides
    // along in the Stripe metadata, so Stripe holds a second copy.
    console.error('Terms acceptance record failed:', err);
  }

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

    if (acceptanceId) {
      try {
        await dbUpdate('terms_acceptances', `id=eq.${acceptanceId}`, { stripe_session_id: session.id });
      } catch (err) {
        console.error('Failed to link acceptance to session:', err);
      }
    }

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkout session creation failed:', err);
    return NextResponse.json({ error: 'Unable to start the payment. Please try again.' }, { status: 500 });
  }
}
