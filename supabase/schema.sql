-- Run this in the Supabase SQL Editor. Tables follow one convention:
-- RLS is ENABLED with ZERO policies, so nothing is readable or writable with
-- the public anon key. All access goes through server code using the
-- service_role key, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Contact-form inquiries
-- ---------------------------------------------------------------------------
create table public.inquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  email        text not null,
  phone        text,
  service      text,
  guests       text,
  event_date   text,
  message      text not null,
  email_status text not null default 'pending', -- pending | sent | failed
  email_error  text
);

alter table public.inquiries enable row level security;

-- ---------------------------------------------------------------------------
-- Invoices. The `token` is a 256-bit random capability: knowing it is what
-- grants a customer access to their invoice page. Amounts are integer cents.
-- Status flow: draft -> sent -> (deposit_paid) -> paid, with void reachable
-- from any unpaid state.
--
-- total_cents is the sum of PRICED + WAIVED line items only — i.e. "priced so
-- far". While any item has pricing = 'tbd' the total is NOT final and the
-- customer may only pay the (fixed) deposit; see allowedPaymentTypes() in
-- lib/invoices.ts. due_date is an explicit payment-deadline override; when it
-- is null the balance-due date is derived as service_date - 1 day.
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    bigint generated always as identity unique,
  token             text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  customer_name     text not null,
  customer_email    text not null,
  description       text,              -- one-line invoice title
  notes             text,              -- multi-line message to the customer
  -- [{id, description, quantity, pricing, unit_amount_cents, tbd_note,
  --   origin, priced_at, previous_unit_amount_cents}]
  -- pricing: 'priced' (or absent, on legacy rows) | 'tbd' | 'waived'
  -- unit_amount_cents is null if and only if pricing = 'tbd'
  line_items        jsonb not null default '[]',
  currency          text not null default 'usd',
  total_cents       integer not null,
  deposit_cents     integer check (deposit_cents > 0 and deposit_cents < total_cents),
  amount_paid_cents integer not null default 0,
  status            text not null default 'draft'
                    check (status in ('draft','sent','deposit_paid','paid','void')),
  due_date          date,
  service_date      date,
  service_time      text,              -- display only, e.g. '6:30 PM'
  sent_at           timestamptz,
  paid_at           timestamptz,
  voided_at         timestamptz,
  terms_accepted_at timestamptz,       -- FIRST acceptance; full log below
  last_email_status text,              -- sent | failed | skipped_no_api_key
  last_email_error  text,
  constraint invoices_total_floor       check (total_cents >= 50 and total_cents <= 100000000),
  constraint invoices_total_covers_paid check (total_cents >= amount_paid_cents),
  constraint invoices_tbd_requires_deposit
    check (not (line_items @> '[{"pricing": "tbd"}]'::jsonb) or deposit_cents is not null),
  constraint invoices_service_time_len  check (service_time is null or char_length(service_time) <= 40),
  constraint invoices_notes_len         check (notes is null or char_length(notes) <= 2000)
);

create index invoices_status_idx       on public.invoices (status);
create index invoices_service_date_idx on public.invoices (service_date);

alter table public.invoices enable row level security;

-- ---------------------------------------------------------------------------
-- Payments: one row per Stripe Checkout Session (or manual settlement).
-- stripe_session_id is unique so webhook retries can never double-settle.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  invoice_id               uuid not null references public.invoices(id),
  stripe_session_id        text not null unique,
  stripe_payment_intent_id text,
  amount_cents             integer not null,
  payment_type             text not null check (payment_type in ('deposit','balance','full','manual')),
  status                   text not null default 'pending'
                           check (status in ('pending','succeeded','failed','expired')),
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz
);

create index payments_invoice_idx on public.payments (invoice_id);

alter table public.payments enable row level security;

-- ---------------------------------------------------------------------------
-- Terms acceptance log. One row per checkout attempt. This is the primary
-- chargeback artifact: it proves WHAT text was on screen, WHEN, from WHERE,
-- for WHICH amount, on WHICH line items.
-- ---------------------------------------------------------------------------
create table public.terms_acceptances (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id),
  terms_version     text not null,
  payment_type      text not null check (payment_type in ('deposit','balance','full')),
  accepted_at       timestamptz not null default now(),
  ip                text,
  user_agent        text,
  -- VERBATIM plain text of what was rendered. Paste this into a Stripe
  -- dispute response; do not regenerate it, the wording may have changed.
  terms_text        text not null,
  snapshot          jsonb not null default '{}',
  stripe_session_id text,          -- backfilled right after session creation
  created_at        timestamptz not null default now()
);

create index terms_acceptances_invoice_idx
  on public.terms_acceptances (invoice_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- ---------------------------------------------------------------------------
-- Admin login attempts, used for serverless-safe rate limiting.
-- ---------------------------------------------------------------------------
create table public.login_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);

create index login_attempts_ip_time_idx on public.login_attempts (ip, created_at);

alter table public.login_attempts enable row level security;
