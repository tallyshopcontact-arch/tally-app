-- Lane Check pivot — email-gate table for the magic-link unlock flow.
-- Run in Supabase SQL Editor → New query → paste → Run.
--
-- Not in the original LANE-CHECK-BRIEF.md schema block, which specified
-- lane_checks.email for "reuse diagnostic email gate" but no token/lead table
-- to go with it. Mirrors diagnostic_leads exactly (supabase/diagnostic-migration.sql)
-- since /api/lane-check/unlock needs somewhere to put a verify_token.

create table if not exists public.lane_check_leads (
  id             uuid        primary key default gen_random_uuid(),
  email          text        not null,
  lane_check_id  uuid        references public.lane_checks(id) not null,
  verified       boolean     default false,
  verify_token   text,
  created_at     timestamptz default now(),
  unique (email, lane_check_id)
);

alter table public.lane_check_leads enable row level security;
create policy "lane_check_leads: service role only"
  on public.lane_check_leads
  using (false);
