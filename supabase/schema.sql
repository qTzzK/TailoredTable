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
-- from any unpaid state. due_date is informational only.
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    bigint generated always as identity unique,
  token             text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  customer_name     text not null,
  customer_email    text not null,
  description       text,
  line_items        jsonb not null default '[]', -- [{description, quantity, unit_amount_cents}]
  currency          text not null default 'usd',
  total_cents       integer not null check (total_cents > 0),
  deposit_cents     integer check (deposit_cents > 0 and deposit_cents < total_cents),
  amount_paid_cents integer not null default 0,
  status            text not null default 'draft'
                    check (status in ('draft','sent','deposit_paid','paid','void')),
  due_date          date,
  sent_at           timestamptz,
  paid_at           timestamptz,
  voided_at         timestamptz,
  last_email_status text, -- sent | failed | skipped_no_api_key
  last_email_error  text
);

create index invoices_status_idx on public.invoices (status);

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
