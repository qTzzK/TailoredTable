'use client';

import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PayOption {
  type: 'deposit' | 'full' | 'balance';
  label: string;
  /** Same amount, worded for the Zelle row ("Zelle the Deposit ($250)"). */
  zelleLabel: string;
  /** Echoed back on checkout purely as a staleness gate — never the charge. */
  chargeCents: number;
}

interface Props {
  token: string;
  options: PayOption[];
  returnedSessionId?: string;
  termsVersion: string;
  termsDigest: string;
  previouslyAcceptedOn?: string | null;
}

type SessionResult = { ok: true; clientSecret: string } | { ok: false; error: string; stale?: boolean };

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

export default function InvoicePayment({
  token,
  options,
  returnedSessionId,
  termsVersion,
  termsDigest,
  previouslyAcceptedOn,
}: Props) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);
  const [selected, setSelected] = useState<PayOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidJustNow, setPaidJustNow] = useState(false);
  const [checkingReturn, setCheckingReturn] = useState(Boolean(returnedSessionId));
  // Never pre-checked and never persisted: each payment needs its own
  // deliberate acceptance, which is what makes the record meaningful.
  const [accepted, setAccepted] = useState(false);
  // True from the click until the Stripe iframe is actually mounted. Without
  // it the buttons vanish into an empty div for a second or two and the page
  // looks like it ignored the click.
  const [starting, setStarting] = useState(false);
  // Arrives from the server only after the acceptance row is written, so the
  // number cannot be read out of the page source without agreeing first.
  const [zelle, setZelle] = useState<{ phone: string; amountLabel: string } | null>(null);
  const [zelleBusy, setZelleBusy] = useState<string | null>(null);

  // Checkout sessions already created, keyed by payment type, plus the
  // in-flight requests. Keeping the PROMISE (not just a "loading" flag) is what
  // makes a click during a prefetch join that request instead of starting a
  // second one — two requests would mean two sessions and two acceptance rows.
  const sessionsRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<SessionResult>>>(new Map());

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

  const getSession = useCallback(
    (option: PayOption): Promise<SessionResult> => {
      const cached = sessionsRef.current.get(option.type);
      if (cached) return Promise.resolve({ ok: true, clientSecret: cached });

      const existing = inFlightRef.current.get(option.type);
      if (existing) return existing;

      const request = (async (): Promise<SessionResult> => {
        try {
          const res = await fetch(`/api/invoice/${encodeURIComponent(token)}/checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_type: option.type,
              accept_terms: true,
              terms_version: termsVersion,
              expected_charge_cents: option.chargeCents,
              expected_terms_digest: termsDigest,
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.clientSecret) {
            return {
              ok: false,
              error: data?.error || 'Unable to start the payment. Please try again.',
              stale: data?.stale === true,
            };
          }
          return { ok: true, clientSecret: data.clientSecret };
        } catch {
          return { ok: false, error: 'Unable to start the payment. Please try again.' };
        }
      })().then(result => {
        // Only successes are cached — a failure has to be retryable.
        if (result.ok) sessionsRef.current.set(option.type, result.clientSecret);
        inFlightRef.current.delete(option.type);
        return result;
      });

      inFlightRef.current.set(option.type, request);
      return request;
    },
    [token, termsVersion, termsDigest]
  );

  // Warm the session ahead of the click. Only ever after the terms box is
  // ticked, because creating a session writes the acceptance record — doing it
  // on page load would file an agreement the customer never made.
  const prefetch = useCallback(
    (option: PayOption) => {
      if (!accepted) return;
      void stripePromise;
      void getSession(option);
    },
    [accepted, getSession]
  );

  // With a single amount there is nothing left to choose, so ticking the box is
  // already a commitment to that amount — warm it immediately. With two, wait
  // for the customer to reach for one, so only the amount they want is created.
  useEffect(() => {
    if (!accepted || options.length !== 1) return;
    prefetch(options[0]);
  }, [accepted, options, prefetch]);

  async function startCheckout(option: PayOption) {
    if (!accepted || starting) return;
    setError(null);
    setSelected(option);
    setStarting(true);
    try {
      const result = await getSession(option);
      if (!result.ok) {
        // A stale page means the chef changed the invoice while it was open —
        // reload so the customer sees the real amount before paying.
        if (result.stale) {
          setError(`${result.error} Reloading…`);
          setSelected(null);
          setTimeout(() => router.refresh(), 1800);
          return;
        }
        setError(result.error);
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
      const checkout = await stripe.initEmbeddedCheckout({ clientSecret: result.clientSecret });
      checkoutRef.current = checkout;
      if (mountRef.current) checkout.mount(mountRef.current);
    } catch {
      setError('Unable to start the payment. Please try again.');
      setSelected(null);
    } finally {
      setStarting(false);
    }
  }

  async function revealZelle(option: PayOption) {
    if (!accepted || zelleBusy) return;
    setError(null);
    setZelleBusy(option.type);
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(token)}/accept-terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_type: option.type,
          accept_terms: true,
          terms_version: termsVersion,
          expected_charge_cents: option.chargeCents,
          expected_terms_digest: termsDigest,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.zellePhone) {
        // Same staleness handling as the card path: a reprice while the page
        // sat open means the customer is looking at an amount that no longer
        // exists, so reload rather than send them off to Zelle with it.
        if (data?.stale) {
          setError(`${data.error} Reloading…`);
          setTimeout(() => router.refresh(), 1800);
          return;
        }
        setError(data?.error || 'Unable to show the Zelle details. Please try again.');
        return;
      }
      setZelle({ phone: data.zellePhone, amountLabel: data.amountLabel });
    } catch {
      setError('Unable to show the Zelle details. Please try again.');
    } finally {
      setZelleBusy(null);
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
        <>
          <label className="invoice-terms-accept">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              aria-describedby="invoice-terms-heading"
            />
            <span>
              I&apos;ve read and agree to the service terms above, including the deposit and cancellation policy.
            </span>
          </label>
          {previouslyAcceptedOn && (
            <p className="invoice-terms-prior">You accepted these terms on {previouslyAcceptedOn}.</p>
          )}
          <div className="invoice-pay-actions">
            {options.map(option => (
              <button
                key={option.type}
                type="button"
                className={option.type === 'deposit' ? 'btn btn-green' : 'btn btn-primary'}
                disabled={!accepted}
                onClick={() => startCheckout(option)}
                // Reaching for the button is the earliest honest signal of
                // intent; by the time the click lands the session is usually
                // already there. Focus covers keyboard and touch.
                onPointerEnter={() => prefetch(option)}
                onFocus={() => prefetch(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {!accepted && (
            <p className="invoice-pay-hint" aria-live="polite">
              Check the box above to continue to payment.
            </p>
          )}

          <div className="invoice-zelle">
            {zelle ? (
              <p className="invoice-zelle-note" aria-live="polite">
                Zelle <strong>{zelle.amountLabel}</strong> to <strong>{zelle.phone}</strong> with your
                name in the note, and I&apos;ll mark this invoice paid as soon as it lands. Your
                acceptance of the service terms is on file.
              </p>
            ) : (
              <>
                <p className="invoice-zelle-note">
                  {options.length > 1
                    ? 'Prefer Zelle? Agree to the terms above, then pick an amount.'
                    : 'Prefer Zelle? Agree to the terms above to see where to send it.'}
                </p>
                <div className="invoice-zelle-actions">
                  {options.map(option => (
                    <button
                      key={option.type}
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={!accepted || zelleBusy !== null}
                      onClick={() => revealZelle(option)}
                    >
                      {zelleBusy === option.type ? 'Getting details…' : option.zelleLabel}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="invoice-status-note muted" role="alert">
          {error}
        </p>
      )}
      {starting && (
        <div className="invoice-checkout-loading" role="status">
          <span className="invoice-spinner" aria-hidden="true" />
          Opening secure checkout…
        </div>
      )}
      <div className="invoice-checkout-mount" ref={mountRef} />
      {selected && !starting && options.length > 1 && (
        <button type="button" className="invoice-change-amount" onClick={changeAmount}>
          ← Choose a different amount
        </button>
      )}
    </div>
  );
}
