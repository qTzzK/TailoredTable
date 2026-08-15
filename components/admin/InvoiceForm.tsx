'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCents } from '@/lib/money';
import { TERMS_VERSION } from '@/lib/terms';

interface ItemDraft {
  description: string;
  quantity: string;
  price: string; // dollars, as typed
  tbd: boolean;
  tbdNote: string;
}

const emptyItem = (): ItemDraft => ({ description: '', quantity: '1', price: '', tbd: false, tbdNote: '' });

function dollarsToCents(value: string): number {
  const parsed = Math.round(parseFloat(value) * 100);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function InvoiceForm() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [depositMode, setDepositMode] = useState<'none' | 'dollar' | 'percent'>('none');
  const [depositValue, setDepositValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [serviceTime, setServiceTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tbdCount = items.filter(i => i.tbd).length;

  const totalCents = items.reduce((sum, item) => {
    if (item.tbd) return sum;
    const qty = parseInt(item.quantity, 10);
    const unit = dollarsToCents(item.price);
    return sum + (Number.isFinite(qty) && qty > 0 && unit > 0 ? qty * unit : 0);
  }, 0);

  const depositCents =
    depositMode === 'dollar'
      ? dollarsToCents(depositValue)
      : depositMode === 'percent'
        ? Math.round((totalCents * (parseFloat(depositValue) || 0)) / 100)
        : 0;

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    // Mirrors the DB CHECK and the server validation: a TBD invoice with no
    // deposit would render a payment page with no button at all.
    if (tbdCount > 0 && depositMode === 'none') {
      setError('Invoices with TBD items need a deposit — that is what the customer pays up front.');
      setBusy(false);
      return;
    }

    const line_items = items.map(item =>
      item.tbd
        ? {
            description: item.description.trim(),
            quantity: parseInt(item.quantity, 10),
            pricing: 'tbd',
            unit_amount_cents: null,
            tbd_note: item.tbdNote.trim() || null,
          }
        : {
            description: item.description.trim(),
            quantity: parseInt(item.quantity, 10),
            pricing: 'priced',
            unit_amount_cents: dollarsToCents(item.price),
          }
    );

    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_email: customerEmail,
          description,
          notes,
          line_items,
          deposit_cents: depositMode === 'none' ? null : depositCents,
          due_date: dueDate || null,
          service_date: serviceDate || null,
          service_time: serviceTime || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.id) {
        router.push(`/admin/invoices/${data.id}`);
        return;
      }
      setError(data?.error || 'Failed to create the invoice.');
    } catch {
      setError('Failed to create the invoice.');
    }
    setBusy(false);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-card">
        <h2>Customer</h2>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="customer_name">Name</label>
            <input
              type="text"
              id="customer_name"
              required
              maxLength={200}
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="customer_email">Email</label>
            <input
              type="email"
              id="customer_email"
              required
              maxLength={320}
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="description">Invoice title</label>
          <input
            type="text"
            id="description"
            maxLength={1000}
            placeholder="e.g. Italian Dinner for 6"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <p className="form-hint">One line. Becomes the email subject and the name on their card receipt.</p>
        </div>
      </div>

      <div className="admin-card">
        <h2>Line Items</h2>
        {items.map((item, i) => (
          <div className="line-item-row" key={i}>
            <input
              type="text"
              aria-label="Item description"
              placeholder="Description"
              required
              maxLength={300}
              value={item.description}
              onChange={e => updateItem(i, { description: e.target.value })}
            />
            <input
              type="number"
              aria-label="Quantity"
              placeholder="Qty"
              required
              min={1}
              max={1000}
              step={1}
              value={item.quantity}
              onChange={e => updateItem(i, { quantity: e.target.value })}
            />
            <label className="line-item-tbd">
              <input
                type="checkbox"
                checked={item.tbd}
                onChange={e => updateItem(i, { tbd: e.target.checked, price: '' })}
              />
              <span className="line-item-switch" />
              <span className="line-item-tbd-text">TBD</span>
            </label>
            {item.tbd ? (
              <input
                type="text"
                aria-label="TBD note"
                placeholder="e.g. billed at cost, usually $200–$300"
                maxLength={300}
                value={item.tbdNote}
                onChange={e => updateItem(i, { tbdNote: e.target.value })}
              />
            ) : (
              <input
                type="number"
                aria-label="Unit price in dollars"
                placeholder="Price ($)"
                required
                min={0.01}
                max={100000}
                step={0.01}
                value={item.price}
                onChange={e => updateItem(i, { price: e.target.value })}
              />
            )}
            {/* The form always needs at least one row, so on the last one the
                × clears the fields instead of removing it — a disabled button
                just reads as broken when you are trying to start over. */}
            <button
              type="button"
              className="line-item-remove"
              aria-label={items.length === 1 ? 'Clear line item' : 'Remove line item'}
              title={items.length === 1 ? 'Clear this line item' : 'Remove this line item'}
              onClick={() =>
                setItems(prev =>
                  prev.length === 1 ? [emptyItem()] : prev.filter((_, idx) => idx !== i)
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginTop: '0.5rem' }}
          onClick={() => setItems(prev => (prev.length < 50 ? [...prev, emptyItem()] : prev))}
        >
          + Add Item
        </button>
        <p className="form-hint" style={{ marginTop: '0.75rem' }}>
          Tick <strong>TBD</strong> for anything you can&apos;t price yet, like groceries. You set the real price
          later from the invoice page and the customer gets an updated invoice by email.
        </p>

        <div className="admin-total-row">
          <span>{tbdCount ? 'Priced so far' : 'Total'}</span>
          <span>
            {formatCents(totalCents)}
            {tbdCount ? ` + ${tbdCount} TBD` : ''}
          </span>
        </div>
      </div>

      <div className="admin-card">
        <h2>Deposit, Service Date &amp; Due Date</h2>
        <div className="form-group">
          <label>Deposit</label>
          <div className="deposit-toggle" style={{ marginBottom: '0.6rem' }}>
            <button type="button" className={depositMode === 'none' ? 'active' : ''} onClick={() => setDepositMode('none')}>
              None
            </button>
            <button type="button" className={depositMode === 'dollar' ? 'active' : ''} onClick={() => setDepositMode('dollar')}>
              $ Amount
            </button>
            <button type="button" className={depositMode === 'percent' ? 'active' : ''} onClick={() => setDepositMode('percent')}>
              % of priced subtotal
            </button>
          </div>
          {depositMode !== 'none' && (
            <>
              <input
                type="number"
                aria-label={depositMode === 'dollar' ? 'Deposit in dollars' : 'Deposit percentage'}
                placeholder={depositMode === 'dollar' ? 'e.g. 250' : 'e.g. 50'}
                min={depositMode === 'dollar' ? 0.5 : 1}
                max={depositMode === 'dollar' ? undefined : 99}
                step={depositMode === 'dollar' ? 0.01 : 1}
                value={depositValue}
                onChange={e => setDepositValue(e.target.value)}
              />
              <p className="admin-note">
                Deposit: {formatCents(depositCents)} — the customer pays this to reserve, then the balance later.
                Make it large enough to cover a late cancellation, since a forfeited deposit is your only remedy.
              </p>
            </>
          )}
          {tbdCount > 0 && depositMode === 'none' && (
            <p className="admin-error" style={{ margin: '0.75rem 0 0' }}>
              TBD items require a deposit — it&apos;s the only thing the customer can pay before you price them.
            </p>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="service_date">Service date (optional)</label>
            <input type="date" id="service_date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
            <p className="form-hint">
              The day you cook. Fills the real dates into the terms: balance due, guest count locked, and the
              deposit non-refundable all from two days before. Leave blank for meal prep or an unscheduled hold.
            </p>
          </div>
          <div className="form-group">
            <label htmlFor="service_time">Start time (optional)</label>
            <input
              type="text"
              id="service_time"
              maxLength={40}
              placeholder="e.g. 6:30 PM"
              value={serviceTime}
              onChange={e => setServiceTime(e.target.value)}
            />
            <p className="form-hint">Shown on the invoice only.</p>
          </div>
        </div>
        <div className="form-group" style={{ maxWidth: '240px' }}>
          <label htmlFor="due_date">Payment due date (optional)</label>
          <input type="date" id="due_date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <p className="form-hint">
            Only to override the default, which is two days before service. With a service date set, leave this
            blank.
          </p>
        </div>
      </div>

      <div className="admin-card">
        <h2>Note to the Customer</h2>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="notes">Note (optional)</label>
          <textarea
            id="notes"
            maxLength={2000}
            placeholder={
              "Menu is set: burrata & heirloom tomato, braised short rib, olive oil cake.\n\nI'll arrive around 4:30 to set up — street parking out front is fine."
            }
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <p className="form-hint">
            A message to your client — appears on the invoice and in the email, line breaks and all. It never
            changes any amount. {notes.length}/2000
          </p>
        </div>
        <p className="admin-note" style={{ marginTop: '1.25rem' }}>
          Service terms (v{TERMS_VERSION}) are attached to every invoice automatically, with this invoice&apos;s
          dates and amounts filled in. The customer must tick a box accepting them before the Pay button unlocks.{' '}
          <a href="/terms" target="_blank" rel="noopener" style={{ color: 'var(--burgundy)' }}>
            Preview the terms
          </a>
        </p>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-actions-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create Invoice'}
        </button>
        <p className="admin-note" style={{ marginTop: 0 }}>
          Creating an invoice doesn&apos;t send anything — you&apos;ll get the link and a send button next.
        </p>
      </div>
    </form>
  );
}
