-- Lane Check pivot: core lane infrastructure tables.
-- Run in Supabase SQL Editor → New query → paste → Run.
-- Mirrors the RLS pattern from supabase/diagnostic-migration.sql: service-role only,
-- no anon access. All reads/writes happen through server-side API routes and scripts
-- using the service-role client (lib/supabase.ts → createServerClient()).

-- ---------------------------------------------------------------------------
-- lanes
-- ---------------------------------------------------------------------------
create table if not exists public.lanes (
  id                uuid        primary key default gen_random_uuid(),
  slug              text        unique not null,   -- normalized: 'mf-doom'
  display_name      text        not null,           -- 'MF DOOM'
  aliases           text[]      default '{}',
  genre_hint        text,                            -- optional disambiguation genre
  request_count     int         default 0,
  last_analyzed_at  timestamptz,
  created_at        timestamptz default now()
);

alter table public.lanes enable row level security;
create policy "lanes: service role only"
  on public.lanes
  using (false);

-- ---------------------------------------------------------------------------
-- lane_analyses
-- Never overwritten — each fresh analysis is a new row so momentum can be
-- computed against the prior row for the same lane.
-- ---------------------------------------------------------------------------
create table if not exists public.lane_analyses (
  id              uuid        primary key default gen_random_uuid(),
  lane_id         uuid        references public.lanes(id) not null,
  demand          int         not null,
  saturation      int         not null,
  winnability     int         not null,
  opportunity     int         not null,
  momentum        int,                              -- delta vs prior analysis, null first time
  raw_metrics     jsonb       not null,              -- medians, counts used for scores
  patterns        jsonb       not null,              -- pattern analysis output
  winner_videos   jsonb       not null,              -- small-channel winners list
  top_videos      jsonb       not null,              -- overall top list
  created_at      timestamptz default now()
);

create index if not exists lane_analyses_lane_idx
  on public.lane_analyses (lane_id, created_at desc);

alter table public.lane_analyses enable row level security;
create policy "lane_analyses: service role only"
  on public.lane_analyses
  using (false);

-- ---------------------------------------------------------------------------
-- lane_jobs
-- Cache-miss queue. A Vercel cron processes queued jobs every 10 minutes,
-- capped per run to protect YouTube quota. Paid requests get priority 10 and
-- run inline instead of waiting on the cron.
-- ---------------------------------------------------------------------------
create table if not exists public.lane_jobs (
  id            uuid        primary key default gen_random_uuid(),
  lane_id       uuid        references public.lanes(id) not null,
  status        text        default 'queued',        -- queued | running | done | failed
  priority      int         default 0,                -- paid requests get 10
  requested_by  uuid,                                  -- nullable user id
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

create index if not exists lane_jobs_status_idx
  on public.lane_jobs (status, priority desc, created_at);

alter table public.lane_jobs enable row level security;
create policy "lane_jobs: service role only"
  on public.lane_jobs
  using (false);

-- ---------------------------------------------------------------------------
-- lane_checks
-- One row per user-run check (the free-tier monthly limit is counted against
-- this table, per user_id OR per email for anonymous users).
-- ---------------------------------------------------------------------------
create table if not exists public.lane_checks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid,                                  -- null for anonymous free checks
  email       text,                                  -- for anonymous users (diagnostic email gate)
  lane_ids    uuid[]      not null,
  genre       text,
  channel_id  text,                                  -- optional, for personalized winnability
  created_at  timestamptz default now()
);

create index if not exists lane_checks_user_idx on public.lane_checks (user_id, created_at desc);
create index if not exists lane_checks_email_idx on public.lane_checks (email, created_at desc);

alter table public.lane_checks enable row level security;
create policy "lane_checks: service role only"
  on public.lane_checks
  using (false);

-- ---------------------------------------------------------------------------
-- channels_cache
-- Avoids re-fetching channels.list for the same channel across lane analyses.
-- ---------------------------------------------------------------------------
create table if not exists public.channels_cache (
  channel_id        text        primary key,
  title             text,
  subscriber_count  int,
  updated_at        timestamptz default now()
);

alter table public.channels_cache enable row level security;
create policy "channels_cache: service role only"
  on public.channels_cache
  using (false);
