-- ===========================================================================
-- Tailored Taste — log of admin-composed emails (contracts, follow-ups).
-- Additive. Idempotent: safe to run more than once.
-- Run this in the Supabase SQL Editor.
-- ===========================================================================

-- Attachment bytes are deliberately NOT stored: Resend keeps them and they
-- are downloadable from its dashboard. This row records who was emailed
-- what, from which address, and when — customer-communication evidence for
-- a Stripe dispute, and a sanity check that a contract actually went out.
create table if not exists public.sent_emails (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid references public.invoices(id) on delete set null,
  from_address  text not null,
  to_addresses  text[] not null,
  cc_addresses  text[] not null default '{}',
  reply_to      text,
  subject       text not null,
  body_text     text not null,
  attachments   jsonb not null default '[]',   -- [{filename, size, content_type}]
  status        text not null check (status in ('sending','sent','failed')),
  resend_id     text,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists sent_emails_invoice_idx on public.sent_emails (invoice_id, created_at desc);
create index if not exists sent_emails_created_idx on public.sent_emails (created_at desc);

alter table public.sent_emails enable row level security;
