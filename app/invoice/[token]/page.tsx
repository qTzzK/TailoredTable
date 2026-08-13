import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import InvoicePayment, { type PayOption } from '@/components/InvoicePayment';
import { dbSelect } from '@/lib/db';
import { allowedPaymentTypes, getInvoiceByToken, paymentAmountCents } from '@/lib/invoices';
import { formatCents } from '@/lib/money';
import { balanceDuePhrase, buildTerms, termsPlainText } from '@/lib/terms';
import { termsDigest } from '@/lib/terms-digest';
import { hasUnpricedItems, lineAmountCents } from '@/lib/types';
import type { Payment } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invoice | Tailored Taste',
  robots: { index: false, follow: false },
};

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const PAY_LABEL: Record<string, (amount: string) => string> = {
  deposit: amount => `Pay Deposit (${amount})`,
  full: amount => `Pay in Full (${amount})`,
  balance: amount => `Pay Balance (${amount})`,
};

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { token } = await params;
  const { session_id } = await searchParams;

  const invoice = await getInvoiceByToken(token);
  if (!invoice) notFound();

  const brand = (
    <div className="invoice-brand">
      <span className="invoice-brand-name">Tailored Taste</span>
      <span className="invoice-brand-tag">Flavors True to You</span>
    </div>
  );
  const footer = (
    <p className="invoice-footer">
      Questions about this invoice? Reply to your email thread or reach out via{' '}
      <a href="https://www.instagram.com/miaprivatechef" target="_blank" rel="noopener" style={{ color: 'var(--burgundy)' }}>
        Instagram
      </a>
      .<br />
      Payments are processed securely by Stripe.
    </p>
  );

  // Void: nothing but the notice — no amounts, no payment UI.
  if (invoice.status === 'void') {
    return (
      <div className="invoice-shell">
        {brand}
        <div className="invoice-card">
          <div className="invoice-card-header">
            <span className="invoice-number">Invoice #{invoice.invoice_number}</span>
          </div>
          <div className="invoice-status-note muted">
            This invoice is no longer active. Please contact Tailored Taste with any questions.
          </div>
        </div>
        {footer}
      </div>
    );
  }

  const terms = buildTerms(invoice);
  const unpriced = hasUnpricedItems(invoice);
  const unpricedItems = invoice.line_items.filter(i => i.pricing === 'tbd');
  const unpricedCount = unpricedItems.length;
  // Name the actual item rather than assuming it is groceries.
  const unpricedLabel =
    unpricedCount === 1 ? unpricedItems[0].description.toLowerCase() : 'the remaining items';

  const options: PayOption[] = allowedPaymentTypes(invoice).map(type => {
    const chargeCents = paymentAmountCents(invoice, type);
    return {
      type: type as PayOption['type'],
      label: PAY_LABEL[type](formatCents(chargeCents, invoice.currency)),
      chargeCents,
    };
  });

  // Echoed back on checkout so a reprice between page load and payment is
  // refused rather than silently charging a different amount.
  const digest = termsDigest(
    termsPlainText(terms, { invoiceNumber: invoice.invoice_number, customerName: invoice.customer_name })
  );

  const remaining = invoice.total_cents - invoice.amount_paid_cents;
  const succeededPayments =
    invoice.amount_paid_cents > 0
      ? await dbSelect<Payment>('payments', `invoice_id=eq.${invoice.id}&status=eq.succeeded&order=paid_at.asc`)
      : [];

  const notesAndTerms = (
    <>
      {invoice.notes && (
        <div className="invoice-notes">
          <p className="admin-detail-label">A note from your chef</p>
          <p className="invoice-notes-body">{invoice.notes}</p>
        </div>
      )}

      <section className="invoice-terms" aria-labelledby="invoice-terms-heading">
        <div className="invoice-terms-head">
          <h2 id="invoice-terms-heading" className="invoice-terms-title">Service Terms</h2>
          <span className="invoice-terms-version">v{terms.version}</span>
        </div>
        <p className="invoice-terms-intro">{terms.intro}</p>
        <dl className="invoice-terms-list">
          {terms.clauses.map(clause => (
            <div className="invoice-terms-clause" key={clause.id}>
              <dt>{clause.title}</dt>
              <dd>{clause.body}</dd>
            </div>
          ))}
        </dl>
        <p className="invoice-terms-closing">
          {terms.closing}{' '}
          <a href="/terms" target="_blank" rel="noopener" className="invoice-terms-link">
            Full terms
          </a>
        </p>
      </section>
    </>
  );

  return (
    <div className="invoice-shell">
      {brand}
      <div className="invoice-card">
        <div className="invoice-card-header">
          <span className="invoice-number">Invoice #{invoice.invoice_number}</span>
          <div className="invoice-meta">
            Issued {fmtDate(invoice.created_at)}
            {terms.serviceDateLabel && (
              <>
                <br />
                <span className="invoice-meta-strong">
                  Service {terms.serviceDateLabel}
                  {invoice.service_time ? ` · ${invoice.service_time}` : ''}
                </span>
              </>
            )}
            {terms.balanceDueLabel && invoice.status !== 'paid' && (
              <>
                <br />
                Balance due {terms.balanceDueLabel}
              </>
            )}
          </div>
        </div>

        <div className="invoice-billto">
          <p className="admin-detail-label">Billed to</p>
          <p className="admin-detail-value">
            {invoice.customer_name}
            <br />
            <span style={{ color: 'var(--warm-gray)' }}>{invoice.customer_email}</span>
          </p>
          {invoice.description && <p className="admin-note">{invoice.description}</p>}
        </div>

        <table className="invoice-items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => {
              const amount = lineAmountCents(item);
              return (
                <tr key={item.id ?? i}>
                  <td>
                    {item.description}
                    {item.pricing === 'tbd' && item.tbd_note && (
                      <span className="invoice-item-note">{item.tbd_note}</span>
                    )}
                    {item.pricing === 'waived' && <span className="invoice-item-note">not required</span>}
                  </td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">
                    {amount === null ? (
                      <span className="invoice-tbd">TBD</span>
                    ) : (
                      formatCents(amount, invoice.currency)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="invoice-total-row">
          <span>{unpriced ? 'Priced so far' : 'Total'}</span>
          <span>{formatCents(invoice.total_cents, invoice.currency)}</span>
        </div>
        {unpriced && (
          <div className="invoice-subrow">
            <span>Still to be priced</span>
            <span>
              {unpricedCount} item{unpricedCount === 1 ? '' : 's'} — you&apos;ll be emailed
            </span>
          </div>
        )}
        {invoice.amount_paid_cents > 0 && (
          <>
            <div className="invoice-subrow">
              <span>Paid</span>
              <span>−{formatCents(invoice.amount_paid_cents, invoice.currency)}</span>
            </div>
            <div className="invoice-subrow" style={{ fontWeight: 700, color: 'var(--charcoal)' }}>
              <span>{unpriced ? 'Balance so far' : 'Balance due'}</span>
              <span>{formatCents(Math.max(remaining, 0), invoice.currency)}</span>
            </div>
          </>
        )}

        {notesAndTerms}

        {invoice.status === 'paid' ? (
          <>
            <div className="invoice-status-note success">✦ &nbsp;Paid in full — thank you!</div>
            {succeededPayments.length > 0 && (
              <table className="invoice-items" style={{ marginTop: '1.25rem' }}>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th className="num">Date</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {succeededPayments.map(p => (
                    <tr key={p.id}>
                      <td>{p.payment_type === 'manual' ? 'payment' : p.payment_type}</td>
                      <td className="num">{fmtDate(p.paid_at ?? p.created_at)}</td>
                      <td className="num">{formatCents(p.amount_cents, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <>
            {invoice.status === 'deposit_paid' && (
              <div className="invoice-status-note success">
                ✦ &nbsp;Deposit of {formatCents(invoice.amount_paid_cents, invoice.currency)} received — thank you!
              </div>
            )}
            {invoice.deposit_cents && invoice.status !== 'deposit_paid' && (
              <div className="invoice-status-note muted">
                A deposit of {formatCents(invoice.deposit_cents, invoice.currency)} reserves your date
                {unpriced ? '.' : ' — or pay in full below.'}
              </div>
            )}
            {options.length === 0 ? (
              <div className="invoice-status-note muted">
                Your final balance will be ready once I&apos;ve priced {unpricedLabel} — I&apos;ll email you as
                soon as it&apos;s set. Payment is due {balanceDuePhrase(terms)}.
              </div>
            ) : (
              <InvoicePayment
                token={invoice.token}
                options={options}
                returnedSessionId={session_id}
                termsVersion={terms.version}
                termsDigest={digest}
                previouslyAcceptedOn={
                  invoice.terms_accepted_at
                    ? new Date(invoice.terms_accepted_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : null
                }
              />
            )}
          </>
        )}
      </div>
      {footer}
    </div>
  );
}
