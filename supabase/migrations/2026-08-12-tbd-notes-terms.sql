-- ===========================================================================
-- Tailored Taste — TBD line items, notes, service date, terms acceptance.
-- Additive + backfill-safe. Idempotent: safe to run more than once.
-- Run this in the Supabase SQL Editor.
-- ===========================================================================

-- ── PREFLIGHT. Run these two first; both must return 0 rows. ───────────────
-- select id, invoice_number, total_cents from public.invoices where total_cents < 50;
-- select id, invoice_number, total_cents, amount_paid_cents from public.invoices
--   where amount_paid_cents > total_cents;

-- ── 1. New invoice columns ─────────────────────────────────────────────────
alter table public.invoices add column if not exists service_date      date;
alter table public.invoices add column if not exists service_time      text;
alter table public.invoices add column if not exists notes             text;
alter table public.invoices add column if not exists terms_accepted_at timestamptz;

create index if not exists invoices_service_date_idx on public.invoices (service_date);

-- ── 2. Backfill legacy line items: stable id + explicit pricing:'priced'.
--     Guarded on the first element lacking an id, so re-running is a no-op.
--     New code already treats a missing `pricing` as 'priced', so this is
--     cosmetic uniformity, not a correctness requirement.
update public.invoices i
set line_items = sub.items
from (
  select i2.id,
         jsonb_agg(
           elem
             || jsonb_build_object('id',      coalesce(elem ->> 'id', gen_random_uuid()::text))
             || jsonb_build_object('pricing', coalesce(elem ->> 'pricing', 'priced'))
           order by ord
         ) as items
  from public.invoices i2,
       lateral jsonb_array_elements(i2.line_items) with ordinality as t(elem, ord)
  group by i2.id
) sub
where i.id = sub.id
  and jsonb_array_length(i.line_items) > 0
  and not (i.line_items -> 0 ? 'id');

-- ── 3. Replace the total_cents CHECK.
--     Old: check (total_cents > 0) -> auto-named invoices_total_cents_check.
--     The new floor of 50 also encodes "at least one PRICED item", because
--     total_cents sums priced + waived items only (a sum over nothing is 0).
alter table public.invoices drop constraint if exists invoices_total_cents_check;

-- Defensive: drop any other surviving check that encodes `total_cents > 0`.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%total_cents > 0%'
  loop
    execute format('alter table public.invoices drop constraint %I', c.conname);
  end loop;
end $$;

-- ── 4. Add the new / restated constraints, each guarded by name. ───────────
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'invoices_total_floor'
                   and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices add constraint invoices_total_floor
      check (total_cents >= 50 and total_cents <= 100000000);
  end if;

  -- Repricing may never strand an overpayment. Holds on existing data:
  -- the webhook caps at total_cents and mark-paid sets paid = total.
  if not exists (select 1 from pg_constraint
                 where conname = 'invoices_total_covers_paid'
                   and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices add constraint invoices_total_covers_paid
      check (total_cents >= amount_paid_cents);
  end if;

  -- An invoice with TBD items and no deposit offers the customer NO payment
  -- at all (see allowedPaymentTypes) — refuse to create a dead invoice page.
  if not exists (select 1 from pg_constraint
                 where conname = 'invoices_tbd_requires_deposit'
                   and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices add constraint invoices_tbd_requires_deposit
      check (not (line_items @> '[{"pricing": "tbd"}]'::jsonb)
             or deposit_cents is not null);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'invoices_service_time_len'
                   and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices add constraint invoices_service_time_len
      check (service_time is null or char_length(service_time) <= 40);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'invoices_notes_len'
                   and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices add constraint invoices_notes_len
      check (notes is null or char_length(notes) <= 2000);
  end if;
end $$;

-- The existing deposit CHECK (deposit_cents > 0 and deposit_cents < total_cents)
-- is UNCHANGED and still correct: pricing a TBD item only ever raises the
-- total, and the price-item route never touches an item priced at creation.

-- ── 5. Terms acceptance log. One row per checkout attempt.
--     This is the primary dispute artifact: it proves WHAT text was on
--     screen, WHEN, from WHERE, for WHICH amount, on WHICH line items.
create table if not exists public.terms_acceptances (
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
  -- {invoice_number, currency, total_cents, deposit_cents, amount_paid_cents,
  --  charge_cents, service_date, balance_due_date, cancel_cutoff_date,
  --  line_items: [...as rendered...]}
  snapshot          jsonb not null default '{}',
  stripe_session_id text,          -- backfilled right after session creation
  created_at        timestamptz not null default now()
);

create index if not exists terms_acceptances_invoice_idx
  on public.terms_acceptances (invoice_id, accepted_at desc);

-- RLS on with zero policies, same as every other table here.
alter table public.terms_acceptances enable row level security;
