-- Upload Kit reframe: beat name capture, decoupled kit generation, YouTube
-- quota budgeting, and queued-lane notification email.
-- Run in Supabase SQL Editor → New query → paste → Run.

-- ---------------------------------------------------------------------------
-- lane_checks.beat_name — captured on the input form, passed straight into
-- title generation with no separate title-generator input step.
-- ---------------------------------------------------------------------------
alter table public.lane_checks add column if not exists beat_name text;

-- ---------------------------------------------------------------------------
-- api_quota_usage — one row per day, tracks estimated YouTube search units
-- spent by INLINE (request-time) analysis only. Bounds cache-miss spend so a
-- burst of cold lanes can't blow the daily YouTube quota; the nightly cron
-- drain (app/api/cron/lane-jobs) keeps its own independent per-run job cap
-- and does not read this table — YOUTUBE_DAILY_UNIT_BUDGET is deliberately
-- set below the real daily quota to leave it headroom.
-- ---------------------------------------------------------------------------
create table if not exists public.api_quota_usage (
  day         date        primary key,
  units_used  int         not null default 0,
  updated_at  timestamptz default now()
);

alter table public.api_quota_usage enable row level security;
create policy "api_quota_usage: service role only"
  on public.api_quota_usage
  using (false);

-- Atomic reserve/rollback: called with a negative p_units to roll back a
-- reservation that turned out to exceed budget. Avoids a read-then-write
-- race between concurrent requests reserving quota for the same day.
create or replace function public.increment_quota_usage(p_day date, p_units int)
returns int
language sql
as $$
  insert into public.api_quota_usage (day, units_used, updated_at)
  values (p_day, p_units, now())
  on conflict (day) do update
    set units_used = public.api_quota_usage.units_used + excluded.units_used,
        updated_at = now()
  returning units_used;
$$;

-- ---------------------------------------------------------------------------
-- lane_jobs.notify_email — best-effort capture of who to notify when a
-- queued (budget-exhausted or failed) lane finishes analyzing via the
-- cron drain. Populated from the requester's account email when known, or
-- backfilled once an anonymous user unlocks their check via email.
-- ---------------------------------------------------------------------------
alter table public.lane_jobs add column if not exists notify_email text;
