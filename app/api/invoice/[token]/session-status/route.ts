import { NextResponse } from 'next/server';
import { getInvoiceByToken } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';

// Called by the invoice page when the customer returns from Embedded
// Checkout. The DB stays webhook-driven truth; this only powers the
// immediate "payment received" message.

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 200) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    // A session for invoice A must never reveal anything via invoice B's token.
    if (session.metadata?.invoice_id !== invoice.id) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({
      status: session.status, // open | complete | expired
      payment_status: session.payment_status, // paid | unpaid | no_payment_required
    });
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
}
