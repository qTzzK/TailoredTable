'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCents } from '@/lib/money';
import { hasUnpricedItems } from '@/lib/types';
import type { Invoice } from '@/lib/types';

function statusLabel(status: Invoice['status']): string {
  return status === 'deposit_paid' ? 'Deposit Paid' : status.charAt(0).toUpperCase() + status.slice(1);
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Customer</th>
          <th>Total</th>
          <th>Paid</th>
          <th>Deposit</th>
          <th>Due</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map(inv => (
          <tr key={inv.id} className="admin-row-link" onClick={() => router.push(`/admin/invoices/${inv.id}`)}>
            <td>
              {/* Real link kept for middle-click / keyboard access. */}
              <Link href={`/admin/invoices/${inv.id}`} onClick={e => e.stopPropagation()}>
                #{inv.invoice_number}
              </Link>
            </td>
            <td>
              {inv.customer_name}
              <br />
              <span style={{ color: 'var(--warm-gray)', fontSize: '0.9rem' }}>{inv.customer_email}</span>
            </td>
            <td>
              {formatCents(inv.total_cents, inv.currency)}
              {hasUnpricedItems(inv) && <span style={{ color: 'var(--warm-gray)' }}> + TBD</span>}
            </td>
            <td>{inv.amount_paid_cents > 0 ? formatCents(inv.amount_paid_cents, inv.currency) : '—'}</td>
            <td>{inv.deposit_cents ? formatCents(inv.deposit_cents, inv.currency) : '—'}</td>
            <td>{fmtDate(inv.due_date)}</td>
            <td>
              <span className={`status-pill status-${inv.status}`}>{statusLabel(inv.status)}</span>
            </td>
            <td>{fmtDate(inv.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
