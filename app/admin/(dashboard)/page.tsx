import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dbSelect } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { isAdminSession } from '@/lib/session';
import type { Invoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'active', label: 'Active', statuses: ['draft', 'sent', 'deposit_paid'] },
  { key: 'completed', label: 'Completed', statuses: ['paid'] },
  { key: 'void', label: 'Void', statuses: ['void'] },
] as const;

function statusLabel(status: Invoice['status']): string {
  return status === 'deposit_paid' ? 'Deposit Paid' : status.charAt(0).toUpperCase() + status.slice(1);
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Defense in depth: the middleware already gates /admin, and this page
  // re-checks the session itself before touching any data.
  if (!(await isAdminSession())) redirect('/admin/login');

  const { tab } = await searchParams;
  const activeTab = TABS.find(t => t.key === tab) ?? TABS[0];

  const statusFilter = activeTab.statuses.map(s => `"${s}"`).join(',');
  const invoices = await dbSelect<Invoice>(
    'invoices',
    `status=in.(${statusFilter})&order=created_at.desc&limit=200`
  );

  return (
    <>
      <div className="admin-title-row">
        <h1 className="admin-title">Invoices</h1>
      </div>

      <nav className="admin-tabs">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={t.key === 'active' ? '/admin' : `/admin?tab=${t.key}`}
            className={t.key === activeTab.key ? 'admin-tab active' : 'admin-tab'}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="admin-table-wrap">
        {invoices.length === 0 ? (
          <p className="admin-empty">
            No {activeTab.label.toLowerCase()} invoices yet.
            {activeTab.key === 'active' && (
              <>
                {' '}
                <Link href="/admin/invoices/new" style={{ color: 'var(--burgundy)' }}>
                  Create your first invoice
                </Link>
                .
              </>
            )}
          </p>
        ) : (
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
                <tr key={inv.id}>
                  <td>
                    <Link href={`/admin/invoices/${inv.id}`}>#{inv.invoice_number}</Link>
                  </td>
                  <td>
                    {inv.customer_name}
                    <br />
                    <span style={{ color: 'var(--warm-gray)', fontSize: '0.9rem' }}>{inv.customer_email}</span>
                  </td>
                  <td>{formatCents(inv.total_cents, inv.currency)}</td>
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
        )}
      </div>
    </>
  );
}
