import Link from 'next/link';
import { redirect } from 'next/navigation';
import ComposeEmailForm from '@/components/admin/ComposeEmailForm';
import { getInvoiceById } from '@/lib/invoices';
import { mailFromDomain } from '@/lib/outbound-mail';
import { isAdminSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ComposeEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  // Defense in depth alongside the middleware gate.
  if (!(await isAdminSession())) redirect('/admin/login');

  const { invoice: invoiceParam } = await searchParams;
  const invoice = invoiceParam ? await getInvoiceById(invoiceParam) : null;
  const firstName = invoice?.customer_name.trim().split(/\s+/)[0] ?? null;

  return (
    <>
      <div className="admin-title-row">
        <h1 className="admin-title">Compose Email</h1>
        {invoice ? (
          <Link href={`/admin/invoices/${invoice.id}`} className="admin-tab">
            ← Invoice #{invoice.invoice_number}
          </Link>
        ) : (
          <Link href="/admin" className="admin-tab">
            ← All invoices
          </Link>
        )}
      </div>
      <ComposeEmailForm
        domain={mailFromDomain()}
        defaults={{
          to: invoice?.customer_email ?? '',
          subject: invoice?.description ? `${invoice.description} — Tailored Taste` : '',
          body: firstName ? `Hi ${firstName},\n\n` : '',
          invoiceId: invoice?.id ?? null,
          customerName: invoice?.customer_name ?? null,
        }}
      />
    </>
  );
}
