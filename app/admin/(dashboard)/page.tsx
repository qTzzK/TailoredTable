import Link from 'next/link';
import { redirect } from 'next/navigation';
import InvoiceTable from '@/components/admin/InvoiceTable';
import PaymentsTable, { type PaymentWithInvoice } from '@/components/admin/PaymentsTable';
import { dbSelect } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { isAdminSession } from '@/lib/session';
import { stripeDashboardBase } from '@/lib/stripe-dashboard';
import type { Invoice, InvoiceStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'payments', label: 'Payments' },
  { key: 'void', label: 'Void' },
] as const;

// The invoice tabs filter by lifecycle status; 'payments' is a different query
// entirely — money actually received, one row per settlement.
const TAB_STATUSES: Record<string, InvoiceStatus[]> = {
  active: ['draft', 'sent', 'deposit_paid'],
  completed: ['paid'],
  void: ['void'],
};

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

  return (
    <>
      <div className="admin-title-row">
        <h1 className="admin-title">{activeTab.key === 'payments' ? 'Payments' : 'Invoices'}</h1>
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

      {activeTab.key === 'payments' ? <PaymentsPanel /> : <InvoicePanel tabKey={activeTab.key} label={activeTab.label} />}
    </>
  );
}

async function InvoicePanel({ tabKey, label }: { tabKey: string; label: string }) {
  const statusFilter = TAB_STATUSES[tabKey].map(s => `"${s}"`).join(',');
  const invoices = await dbSelect<Invoice>(
    'invoices',
    `status=in.(${statusFilter})&order=created_at.desc&limit=200`
  );

  return (
    <div className="admin-table-wrap">
      {invoices.length === 0 ? (
        <p className="admin-empty">
          No {label.toLowerCase()} invoices yet.
          {tabKey === 'active' && (
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
  );
}

async function PaymentsPanel() {
  // Only succeeded rows: pending and expired sessions are checkout attempts,
  // not money. Deposits appear alongside full settlements, so a part-paid
  // invoice still shows the payment it did take.
  const payments = await dbSelect<PaymentWithInvoice>(
    'payments',
    'status=eq.succeeded' +
      // One comma-separated order param, not two: PostgREST keeps only the
      // last `order` it is given, which would drop the paid_at sort entirely.
      '&order=paid_at.desc.nullslast,created_at.desc' +
      '&limit=200' +
      '&select=*,invoices(id,invoice_number,customer_name,customer_email,currency)'
  );

  const receivedCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const stripeCount = payments.filter(p => p.payment_type !== 'manual').length;
  const offlineCount = payments.length - stripeCount;

  return (
    <div className="admin-table-wrap">
      {payments.length === 0 ? (
        <p className="admin-empty">No payments received yet.</p>
      ) : (
        <>
          <div className="admin-total-row" style={{ marginBottom: '1rem' }}>
            <span>
              {payments.length} payment{payments.length === 1 ? '' : 's'} received
              {offlineCount > 0 && ` · ${stripeCount} via Stripe, ${offlineCount} offline`}
            </span>
            <span>{formatCents(receivedCents, payments[0].invoices?.currency ?? 'usd')}</span>
          </div>
          <PaymentsTable payments={payments} stripeBase={stripeDashboardBase()} />
        </>
      )}
    </div>
  );
}
