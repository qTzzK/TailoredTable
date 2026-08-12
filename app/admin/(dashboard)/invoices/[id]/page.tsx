import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import InvoiceActions from '@/components/admin/InvoiceActions';
import { dbSelect } from '@/lib/db';
import { siteUrl } from '@/lib/env';
import { getInvoiceById } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { isAdminSession } from '@/lib/session';
import type { Payment } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

function statusLabel(status: string): string {
  return status === 'deposit_paid' ? 'Deposit Paid' : status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Defense in depth alongside the middleware gate.
  if (!(await isAdminSession())) redirect('/admin/login');

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const payments = await dbSelect<Payment>('payments', `invoice_id=eq.${invoice.id}&order=created_at.desc`);
  const invoiceUrl = `${siteUrl()}/invoice/${invoice.token}`;
  const remaining = invoice.total_cents - invoice.amount_paid_cents;

  return (
    <>
      <div className="admin-title-row">
        <h1 className="admin-title">
          Invoice #{invoice.invoice_number}{' '}
          <span className={`status-pill status-${invoice.status}`} style={{ verticalAlign: 'middle' }}>
            {statusLabel(invoice.status)}
          </span>
        </h1>
        <Link href="/admin" className="admin-tab">
          ← All invoices
        </Link>
      </div>

      {invoice.last_email_status === 'skipped_no_api_key' && (
        <div className="admin-banner">
          Email isn&apos;t configured yet (RESEND_API_KEY is not set), so the invoice email was not sent. Copy the link
          below and share it directly.
        </div>
      )}
      {invoice.last_email_status === 'failed' && (
        <div className="admin-banner">
          The last email attempt failed{invoice.last_email_error ? ` (${invoice.last_email_error})` : ''}. You can retry,
          or copy the link below and share it directly.
        </div>
      )}

      <div className="admin-card">
        <h2>Details</h2>
        <div className="admin-detail-grid">
          <div>
            <p className="admin-detail-label">Customer</p>
            <p className="admin-detail-value">{invoice.customer_name}</p>
          </div>
          <div>
            <p className="admin-detail-label">Email</p>
            <p className="admin-detail-value">{invoice.customer_email}</p>
          </div>
          <div>
            <p className="admin-detail-label">Total</p>
            <p className="admin-detail-value">{formatCents(invoice.total_cents, invoice.currency)}</p>
          </div>
          <div>
            <p className="admin-detail-label">Paid so far</p>
            <p className="admin-detail-value">
              {formatCents(invoice.amount_paid_cents, invoice.currency)}
              {remaining > 0 && invoice.amount_paid_cents > 0 && (
                <> · {formatCents(remaining, invoice.currency)} remaining</>
              )}
            </p>
          </div>
          <div>
            <p className="admin-detail-label">Deposit</p>
            <p className="admin-detail-value">
              {invoice.deposit_cents ? formatCents(invoice.deposit_cents, invoice.currency) : 'None'}
            </p>
          </div>
          <div>
            <p className="admin-detail-label">Due date</p>
            <p className="admin-detail-value">{invoice.due_date ?? '—'}</p>
          </div>
          <div>
            <p className="admin-detail-label">Created</p>
            <p className="admin-detail-value">{fmtDateTime(invoice.created_at)}</p>
          </div>
          <div>
            <p className="admin-detail-label">Emailed</p>
            <p className="admin-detail-value">{fmtDateTime(invoice.sent_at)}</p>
          </div>
        </div>
        {invoice.description && (
          <p className="admin-note" style={{ marginTop: '1.25rem' }}>{invoice.description}</p>
        )}
      </div>

      <div className="admin-card">
        <h2>Line Items</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'normal' }}>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatCents(item.unit_amount_cents, invoice.currency)}</td>
                <td>{formatCents(item.quantity * item.unit_amount_cents, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceActions
        invoiceId={invoice.id}
        status={invoice.status}
        invoiceUrl={invoiceUrl}
        customerEmail={invoice.customer_email}
      />

      <div className="admin-card">
        <h2>Payments</h2>
        {payments.length === 0 ? (
          <p className="admin-empty" style={{ padding: '1rem 0' }}>No payments yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.paid_at ?? p.created_at)}</td>
                  <td>{p.payment_type}</td>
                  <td>{formatCents(p.amount_cents, invoice.currency)}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
