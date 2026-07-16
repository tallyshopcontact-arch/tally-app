-- Phase 2: Channel Diagnostic tables
-- Run in Supabase SQL Editor → New query → paste → Run
--
-- NOTE: The existing rate_limits table (used for authenticated users) has a
-- different schema (producer_id, endpoint, count, reset_at).
-- This migration creates diagnostic_rate_limits to avoid conflicting with that table.
-- The diagnostic API routes reference diagnostic_rate_limits.

-- ---------------------------------------------------------------------------
-- diagnostics
-- ---------------------------------------------------------------------------
create table if not exists public.diagnostics (
  id               uuid        primary key default gen_random_uuid(),
  channel_id       text        not null,
  channel_title    text        not null,
  tally_score      int         not null,
  grade            text        not null,
  findings         jsonb       not null,        -- Finding[] from scoring engine
  free_finding_ids text[]      not null,
  narrative        text,                        -- Haiku summary, nullable
  created_at       timestamptz default now()
);

create index if not exists diagnostics_channel_idx
  on public.diagnostics (channel_id, created_at desc);

alter table public.diagnostics enable row level security;
-- Service-role only; no anon access
create policy "diagnostics: service role only"
  on public.diagnostics
  using (false);

-- ---------------------------------------------------------------------------
-- diagnostic_leads
-- ---------------------------------------------------------------------------
create table if not exists public.diagnostic_leads (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  channel_id    text        not null,
  diagnostic_id uuid        references public.diagnostics(id),
  verified      boolean     default false,
  verify_token  text,
  created_at    timestamptz default now(),
  unique (email, channel_id)
);

alter table public.diagnostic_leads enable row level security;
create policy "diagnostic_leads: service role only"
  on public.diagnostic_leads
  using (false);

-- ---------------------------------------------------------------------------
-- diagnostic_rate_limits
-- Separate from the existing authenticated rate_limits table.
-- Key format: 'ip:{ip}:{yyyy-mm-dd}' or 'email:{email}:{yyyy-mm}'
-- ---------------------------------------------------------------------------
create table if not exists public.diagnostic_rate_limits (
  key        text        primary key,
  count      int         default 1,
  updated_at timestamptz default now()
);

alter table public.diagnostic_rate_limits enable row level security;
create policy "diagnostic_rate_limits: service role only"
  on public.diagnostic_rate_limits
  using (false);
