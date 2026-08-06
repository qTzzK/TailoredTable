-- Run this in the Supabase SQL Editor to create the inquiries table.

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

-- RLS on with no policies: nothing is readable/writable with the public anon
-- key. The serverless function uses the service_role key, which bypasses RLS.
alter table public.inquiries enable row level security;
