import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import InvoiceActions from '@/components/admin/InvoiceActions';
import PriceItemControl from '@/components/admin/PriceItemControl';
import { dbSelect } from '@/lib/db';
import { siteUrl } from '@/lib/env';
import { getInvoiceById } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { isAdminSession } from '@/lib/session';
import { balanceDueDate } from '@/lib/terms';
import { hasUnpricedItems, lineAmountCents } from '@/lib/types';
import type { Payment, TermsAcceptance } from '@/lib/types';

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
  const acceptances = await dbSelect<TermsAcceptance>(
    'terms_acceptances',
    `invoice_id=eq.${invoice.id}&order=accepted_at.desc`
  );
  const invoiceUrl = `${siteUrl()}/invoice/${invoice.token}`;
  const remaining = invoice.total_cents - invoice.amount_paid_cents;
  const unpriced = hasUnpricedItems(invoice);
  const unpricedCount = invoice.line_items.filter(i => i.pricing === 'tbd').length;
  const canPrice = invoice.status !== 'paid' && invoice.status !== 'void';

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

      {unpriced && (
        <div className="admin-banner">
          {unpricedCount} item{unpricedCount === 1 ? '' : 's'} still need{unpricedCount === 1 ? 's' : ''} a price.
          Until you set it, the customer can only pay the deposit — they cannot pay their balance.
        </div>
      )}

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
            <p className="admin-detail-label">{unpriced ? 'Priced so far' : 'Total'}</p>
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
            <p className="admin-detail-label">Service date</p>
            <p className="admin-detail-value">
              {invoice.service_date ?? '—'}
              {invoice.service_time ? ` · ${invoice.service_time}` : ''}
            </p>
          </div>
          <div>
            <p className="admin-detail-label">Balance due</p>
            <p className="admin-detail-value">{balanceDueDate(invoice) ?? '—'}</p>
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
        {invoice.notes && (
          <div style={{ marginTop: '1.25rem' }}>
            <p className="admin-detail-label">Note to customer</p>
            <p className="admin-notes-preview">{invoice.notes}</p>
          </div>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => {
              const amount = lineAmountCents(item);
              return (
                <tr key={item.id ?? i}>
                  <td style={{ whiteSpace: 'normal' }}>
                    {item.description}
                    {item.pricing === 'tbd' && item.tbd_note && (
                      <span className="invoice-item-note">{item.tbd_note}</span>
                    )}
                    {item.pricing === 'waived' && <span className="invoice-item-note">waived — not required</span>}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.pricing === 'tbd' ? '—' : formatCents(item.unit_amount_cents ?? 0, invoice.currency)}</td>
                  <td>{amount === null ? 'TBD' : formatCents(amount, invoice.currency)}</td>
                  <td>
                    {(item.pricing === 'tbd' || item.origin === 'tbd') && canPrice && item.id && (
                      <PriceItemControl
                        invoiceId={invoice.id}
                        itemId={item.id}
                        description={item.description}
                        quantity={item.quantity}
                        currentCents={item.unit_amount_cents}
                        alreadyPriced={Boolean(item.priced_at)}
                        expectedUpdatedAt={invoice.updated_at}
                        defaultNotify={invoice.status !== 'draft'}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
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

      <div className="admin-card">
        <h2>Terms Acceptance</h2>
        {acceptances.length === 0 ? (
          <p className="admin-empty" style={{ padding: '1rem 0' }}>
            Not accepted yet — the customer accepts when they start a payment.
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Accepted</th>
                <th>For</th>
                <th>Version</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {acceptances.map(a => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.accepted_at)}</td>
                  <td>{a.payment_type}</td>
                  <td>{a.terms_version}</td>
                  <td>{a.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="admin-note">
          Each row stores the exact terms text and amounts the customer saw before paying. If you ever get a
          dispute, paste that text into the Stripe evidence form under &quot;cancellation policy disclosure&quot;.
        </p>
      </div>
    </>
  );
}
