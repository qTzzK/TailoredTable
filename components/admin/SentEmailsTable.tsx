import Link from 'next/link';
import type { SentEmail } from '@/lib/types';

// Server-renderable table of admin-composed emails. Shared by the invoice
// detail page (one invoice) and the dashboard Emails tab (everything).

export type SentEmailWithInvoice = SentEmail & {
  invoices?: { id: string; invoice_number: number; customer_name: string } | null;
};

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusText(email: SentEmail): string {
  if (email.status === 'sent') return 'Sent';
  if (email.status === 'failed') return `Failed${email.error ? ` — ${email.error}` : ''}`;
  return 'Sending…';
}

export default function SentEmailsTable({
  emails,
  showInvoice = false,
}: {
  emails: SentEmailWithInvoice[];
  showInvoice?: boolean;
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Sent</th>
            <th>From</th>
            <th>To</th>
            <th>Subject</th>
            <th>Attachments</th>
            {showInvoice && <th>Invoice</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {emails.map(e => (
            <tr key={e.id}>
              <td>{fmtDateTime(e.created_at)}</td>
              <td>{e.from_address}</td>
              <td style={{ whiteSpace: 'normal' }}>
                {e.to_addresses.join(', ')}
                {e.cc_addresses.length > 0 && <span className="invoice-item-note">cc {e.cc_addresses.join(', ')}</span>}
              </td>
              <td style={{ whiteSpace: 'normal' }}>{e.subject}</td>
              <td style={{ whiteSpace: 'normal' }}>
                {e.attachments.length === 0 ? '—' : e.attachments.map(a => a.filename).join(', ')}
              </td>
              {showInvoice && (
                <td>
                  {e.invoices ? (
                    <Link href={`/admin/invoices/${e.invoices.id}`} className="admin-row-link">
                      #{e.invoices.invoice_number} · {e.invoices.customer_name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              )}
              <td className={e.status === 'failed' ? 'mail-status-failed' : e.status === 'sent' ? 'mail-status-sent' : ''}>
                {statusText(e)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
