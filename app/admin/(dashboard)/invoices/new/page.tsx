import InvoiceForm from '@/components/admin/InvoiceForm';

export default function NewInvoicePage() {
  return (
    <>
      <div className="admin-title-row">
        <h1 className="admin-title">New Invoice</h1>
      </div>
      <InvoiceForm />
    </>
  );
}
