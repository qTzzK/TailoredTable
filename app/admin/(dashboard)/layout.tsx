import Link from 'next/link';
import LogoutButton from '@/components/admin/LogoutButton';

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="admin-header">
        <Link href="/admin" className="admin-header-brand">
          Tailored Taste <span>Admin</span>
        </Link>
        <div className="admin-header-actions">
          <Link href="/admin/invoices/new" className="btn btn-primary btn-sm">
            New Invoice
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </>
  );
}
