'use client';

import { useEffect, useRef, useState } from 'react';
import type { RenderedTerms } from '@/lib/terms';

/**
 * The service terms, compact. The full wording is what gets archived into
 * terms_acceptances and hashed into the checkout digest, so every clause is
 * rendered verbatim — just inside a dialog instead of a metre of invoice.
 * The clause titles stay on the page so the customer can see what the terms
 * cover before deciding to open them.
 */
export default function InvoiceTerms({ terms }: { terms: RenderedTerms }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // showModal() (not the `open` attribute) is what gives the focus trap,
  // Esc-to-close and ::backdrop. It throws if called on an already-open
  // dialog, hence the state mirror.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <section className="invoice-terms" aria-labelledby="invoice-terms-heading">
      <div className="invoice-terms-head">
        <h2 id="invoice-terms-heading" className="invoice-terms-title">
          Service Terms
        </h2>
        <span className="invoice-terms-version">v{terms.version}</span>
      </div>

      <p className="invoice-terms-intro">{terms.intro}</p>

      <ul className="invoice-terms-topics">
        {terms.clauses.map(clause => (
          <li key={clause.id}>{clause.title}</li>
        ))}
      </ul>

      <button type="button" className="invoice-terms-open" onClick={() => setOpen(true)}>
        Read the full terms
      </button>

      <dialog
        ref={dialogRef}
        className="invoice-terms-dialog"
        aria-labelledby="invoice-terms-dialog-heading"
        onClose={() => setOpen(false)}
        // Esc and the backdrop both land here; the ::backdrop is outside the
        // panel, so a click on the dialog element itself is a backdrop click.
        onClick={e => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <div className="invoice-terms-dialog-panel">
          <div className="invoice-terms-dialog-head">
            <h2 id="invoice-terms-dialog-heading" className="invoice-terms-title">
              Service Terms
            </h2>
            <span className="invoice-terms-version">v{terms.version}</span>
            <button
              type="button"
              className="invoice-terms-close"
              aria-label="Close the service terms"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="invoice-terms-dialog-body">
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
          </div>

          <div className="invoice-terms-dialog-foot">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
