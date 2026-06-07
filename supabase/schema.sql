-- Run this in your Supabase project: SQL Editor > New query > paste > Run

create table public.waitlist (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  email        text        not null unique,
  genre        text        not null,
  youtube_channel text     not null,
  created_at   timestamptz not null default now()
);

-- Enable RLS (rows are only accessible via the service role key used by our API)
alter table public.waitlist enable row level security;
