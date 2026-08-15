'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  invoiceId: string;
  itemId: string;
  description: string;
  quantity: number;
  currentCents: number | null;
  alreadyPriced: boolean;
  expectedUpdatedAt: string;
  defaultNotify: boolean;
}

export default function PriceItemControl({
  invoiceId,
  itemId,
  description,
  quantity,
  currentCents,
  alreadyPriced,
  expectedUpdatedAt,
  defaultNotify,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(currentCents !== null ? (currentCents / 100).toFixed(2) : '');
  const [notify, setNotify] = useState(defaultNotify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(confirmReprice: boolean): Promise<Response> {
    return fetch(`/api/admin/invoices/${invoiceId}/price-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        unit_amount_cents: Math.round(parseFloat(price) * 100),
        notify,
        expected_updated_at: expectedUpdatedAt,
        ...(confirmReprice ? { confirm_reprice: true } : {}),
      }),
    });
  }

  async function save() {
    const cents = Math.round(parseFloat(price) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError('Enter a price of $0.00 or more.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let res = await post(false);
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        if (
          typeof data?.error === 'string' &&
          data.error.includes('already has a price') &&
          window.confirm(`"${description}" already has a price. Change it and email the customer an updated invoice?`)
        ) {
          res = await post(true);
        } else {
          setError(data?.error || 'Could not save the price.');
          setBusy(false);
          return;
        }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Could not save the price.');
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not save the price.');
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        {alreadyPriced ? 'Change price' : 'Set price'}
      </button>
    );
  }

  return (
    <div className="price-item-control">
      <div className="price-item-row">
        <span className="price-item-qty">×{quantity} @</span>
        <input
          type="number"
          min={0}
          step={0.01}
          autoFocus
          aria-label={`Unit price for ${description}`}
          placeholder="0.00"
          value={price}
          onChange={e => setPrice(e.target.value)}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save (0 = not required)'}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <label className="price-item-notify">
        <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
        Email the customer this update
      </label>
      {error && <p className="admin-error" style={{ margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  );
}
