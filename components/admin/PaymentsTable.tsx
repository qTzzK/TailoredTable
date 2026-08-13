import Link from 'next/link';
import { formatCents } from '@/lib/money';
import type { Payment } from '@/lib/types';

/** A payment row with its parent invoice embedded by PostgREST. */
export interface PaymentWithInvoice extends Payment {
  invoices: {
    id: string;
    invoice_number: number;
    customer_name: string;
    customer_email: string;
    currency: string;
  } | null;
}

const TYPE_LABELS: Record<Payment['payment_type'], string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Paid in full',
  manual: 'Offline',
};

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The verification cell. Card payments link straight to the payment in the
 * Stripe dashboard; offline settlements have no Stripe record to link to and
 * say so, rather than rendering a link that would 404.
 */
export function StripeCell({ payment, stripeBase }: { payment: Payment; stripeBase: string }) {
  if (payment.payment_type === 'manual') {
    return <span className="payment-offline">Marked offline — no Stripe record</span>;
  }

  if (payment.stripe_payment_intent_id) {
    return (
      <a
        className="payment-stripe-link"
        href={`${stripeBase}/payments/${encodeURIComponent(payment.stripe_payment_intent_id)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Verify in Stripe ↗
      </a>
    );
  }

  // Settled without a payment intent on the row — rare, but the session id is
  // still enough to find the charge by searching the dashboard.
  return <span className="payment-offline">Session {payment.stripe_session_id.slice(0, 18)}…</span>;
}

export default function PaymentsTable({
  payments,
  stripeBase,
}: {
  payments: PaymentWithInvoice[];
  stripeBase: string;
}) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Paid</th>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Verify</th>
        </tr>
      </thead>
      <tbody>
        {payments.map(p => (
          <tr key={p.id}>
            <td>{fmtDateTime(p.paid_at ?? p.created_at)}</td>
            <td>
              {p.invoices ? (
                <Link href={`/admin/invoices/${p.invoice_id}`}>#{p.invoices.invoice_number}</Link>
              ) : (
                '—'
              )}
            </td>
            <td>
              {p.invoices?.customer_name ?? '—'}
              {p.invoices && (
                <>
                  <br />
                  <span style={{ color: 'var(--warm-gray)', fontSize: '0.9rem' }}>
                    {p.invoices.customer_email}
                  </span>
                </>
              )}
            </td>
            <td>{TYPE_LABELS[p.payment_type]}</td>
            <td>{formatCents(p.amount_cents, p.invoices?.currency ?? 'usd')}</td>
            <td>
              <StripeCell payment={p} stripeBase={stripeBase} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
