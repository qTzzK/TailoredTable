import { NextResponse } from 'next/server';
import { recordAcceptance } from '@/lib/accept-terms';
import { allowedPaymentTypes, getInvoiceByToken, paymentAmountCents } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { ZELLE_PHONE } from '@/lib/terms';
import type { CustomerPaymentType } from '@/lib/types';

// The Zelle path. A Zelle transfer never touches Stripe, so nothing else in
// the system would ever ask this customer to agree to anything — this route is
// the only place their acceptance can be captured. It therefore does the same
// work the checkout route does, minus the charge, and hands back the number
// only once the acceptance row exists. The number is deliberately NOT in the
// page HTML: gating it behind this call is what makes the agreement real
// rather than decorative.

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
  if (amount <= 0) {
    return NextResponse.json({ error: 'This payment is not available for this invoice.' }, { status: 409 });
  }

  const acceptance = await recordAcceptance({ req, invoice, type, amount, method: 'zelle', body });
  if (!acceptance.ok) {
    return NextResponse.json(
      { error: acceptance.error, ...(acceptance.stale ? { stale: true } : {}) },
      { status: acceptance.status }
    );
  }

  return NextResponse.json({
    zellePhone: ZELLE_PHONE,
    amountLabel: formatCents(amount, invoice.currency),
  });
}
