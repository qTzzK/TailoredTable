'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { InvoiceStatus } from '@/lib/types';

interface Props {
  invoiceId: string;
  status: InvoiceStatus;
  invoiceUrl: string;
  customerEmail: string;
}

export default function InvoiceActions({ invoiceId, status, invoiceUrl, customerEmail }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link text and copy it manually.');
    }
  }

  async function post(action: 'send' | 'void' | 'mark-paid', confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/${action}`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Action failed.');
      } else if (data?.notice) {
        setNotice(data.notice);
      }
      router.refresh();
    } catch {
      setError('Action failed.');
    }
    setBusy(null);
  }

  const isFinal = status === 'paid' || status === 'void';

  return (
    <div className="admin-card">
      <h2>Invoice Link &amp; Actions</h2>

      <div className="admin-link-row">
        <input className="admin-link-input" readOnly value={invoiceUrl} onFocus={e => e.currentTarget.select()} />
        <button type="button" className="btn btn-outline btn-sm" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      <div className="admin-actions-row" style={{ marginTop: '1.25rem' }}>
        {!isFinal && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy !== null}
            onClick={() => post('send')}
          >
            {busy === 'send' ? 'Sending…' : status === 'draft' ? `Email Invoice to ${customerEmail}` : 'Resend Invoice Email'}
          </button>
        )}
        {!isFinal && (
          <button
            type="button"
            className="btn btn-green btn-sm"
            disabled={busy !== null}
            onClick={() =>
              post('mark-paid', 'Mark this invoice as fully paid? Use this for cash, Zelle, or other offline payments.')
            }
          >
            {busy === 'mark-paid' ? 'Saving…' : 'Mark Paid (offline)'}
          </button>
        )}
        {!isFinal && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy !== null}
            onClick={() => post('void', 'Void this invoice? The payment link will stop working. This cannot be undone.')}
          >
            {busy === 'void' ? 'Voiding…' : 'Void Invoice'}
          </button>
        )}
      </div>

      {error && <p className="admin-error" style={{ margin: '1rem 0 0' }}>{error}</p>}
      {notice && <p className="admin-note">{notice}</p>}
      {status === 'draft' && (
        <p className="admin-note">
          This invoice is a draft — the link already works, so you can preview it before sending.
        </p>
      )}
    </div>
  );
}
