'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCents } from '@/lib/money';

interface ItemDraft {
  description: string;
  quantity: string;
  price: string; // dollars, as typed
}

const emptyItem = (): ItemDraft => ({ description: '', quantity: '1', price: '' });

function dollarsToCents(value: string): number {
  const parsed = Math.round(parseFloat(value) * 100);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function InvoiceForm() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [depositMode, setDepositMode] = useState<'none' | 'dollar' | 'percent'>('none');
  const [depositValue, setDepositValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalCents = items.reduce((sum, item) => {
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

    const line_items = items.map(item => ({
      description: item.description.trim(),
      quantity: parseInt(item.quantity, 10),
      unit_amount_cents: dollarsToCents(item.price),
    }));

    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_email: customerEmail,
          description,
          line_items,
          deposit_cents: depositMode === 'none' ? null : depositCents,
          due_date: dueDate || null,
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
          <label htmlFor="description">Description (shown on the invoice)</label>
          <input
            type="text"
            id="description"
            maxLength={1000}
            placeholder="e.g. Private dinner for 6 — Saturday, March 14"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
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
            <button
              type="button"
              className="line-item-remove"
              aria-label="Remove line item"
              disabled={items.length === 1}
              onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
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

        <div className="admin-total-row">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </div>
      </div>

      <div className="admin-card">
        <h2>Deposit &amp; Due Date</h2>
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
              % of Total
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
                Deposit: {formatCents(depositCents)} — the customer can pay this to reserve, then pay the balance later.
              </p>
            </>
          )}
        </div>
        <div className="form-group" style={{ maxWidth: '240px' }}>
          <label htmlFor="due_date">Due date (optional)</label>
          <input type="date" id="due_date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
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
