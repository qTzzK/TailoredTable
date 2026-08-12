import Link from 'next/link';
import { redirect } from 'next/navigation';
import InvoiceTable from '@/components/admin/InvoiceTable';
import { dbSelect } from '@/lib/db';
import { isAdminSession } from '@/lib/session';
import type { Invoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'active', label: 'Active', statuses: ['draft', 'sent', 'deposit_paid'] },
  { key: 'completed', label: 'Completed', statuses: ['paid'] },
  { key: 'void', label: 'Void', statuses: ['void'] },
] as const;

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

      {/* Deliberately a div: styles.css pins bare <nav> elements to the top
          of the viewport for the marketing site's navigation bar. */}
      <div className="admin-tabs">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={t.key === 'active' ? '/admin' : `/admin?tab=${t.key}`}
            className={t.key === activeTab.key ? 'admin-tab active' : 'admin-tab'}
          >
            {t.label}
          </Link>
        ))}
      </div>

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
          <InvoiceTable invoices={invoices} />
        )}
      </div>
    </>
  );
}
