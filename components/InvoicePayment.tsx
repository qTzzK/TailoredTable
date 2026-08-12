'use client';

import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface PayOption {
  type: 'deposit' | 'full' | 'balance';
  label: string;
}

interface Props {
  token: string;
  options: PayOption[];
  returnedSessionId?: string;
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

export default function InvoicePayment({ token, options, returnedSessionId }: Props) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);
  const [selected, setSelected] = useState<PayOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidJustNow, setPaidJustNow] = useState(false);
  const [checkingReturn, setCheckingReturn] = useState(Boolean(returnedSessionId));

  // Returning from checkout: confirm the session's outcome, then refresh so
  // the server re-renders from (webhook-updated) DB state.
  useEffect(() => {
    if (!returnedSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/invoice/${encodeURIComponent(token)}/session-status?session_id=${encodeURIComponent(returnedSessionId)}`
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.status === 'complete') {
          setPaidJustNow(true);
          // Give the webhook a moment, then re-render from the database.
          setTimeout(() => router.refresh(), 2500);
        }
      } catch {
        // Fall through to the normal payment UI.
      }
      if (!cancelled) setCheckingReturn(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [returnedSessionId, token, router]);

  useEffect(() => {
    return () => {
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, []);

  async function startCheckout(option: PayOption) {
    setError(null);
    setSelected(option);
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(token)}/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_type: option.type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.clientSecret) {
        setError(data?.error || 'Unable to start the payment. Please try again.');
        setSelected(null);
        return;
      }
      const stripe = await stripePromise;
      if (!stripe) {
        setError('Payments are unavailable right now. Please try again later.');
        setSelected(null);
        return;
      }
      checkoutRef.current?.destroy();
      const checkout = await stripe.initEmbeddedCheckout({ clientSecret: data.clientSecret });
      checkoutRef.current = checkout;
      if (mountRef.current) checkout.mount(mountRef.current);
    } catch {
      setError('Unable to start the payment. Please try again.');
      setSelected(null);
    }
  }

  function changeAmount() {
    checkoutRef.current?.destroy();
    checkoutRef.current = null;
    setSelected(null);
  }

  if (paidJustNow) {
    return (
      <div className="invoice-status-note success">
        ✦ &nbsp;Payment received — thank you! A receipt is on its way to your email.
      </div>
    );
  }

  if (checkingReturn) {
    return <div className="invoice-status-note muted">Checking your payment…</div>;
  }

  return (
    <div>
      {!selected && (
        <div className="invoice-pay-actions">
          {options.map(option => (
            <button
              key={option.type}
              type="button"
              className={option.type === 'deposit' ? 'btn btn-green' : 'btn btn-primary'}
              onClick={() => startCheckout(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="invoice-status-note muted" role="alert">
          {error}
        </p>
      )}
      <div className="invoice-checkout-mount" ref={mountRef} />
      {selected && options.length > 1 && (
        <button type="button" className="invoice-change-amount" onClick={changeAmount}>
          ← Choose a different amount
        </button>
      )}
    </div>
  );
}
