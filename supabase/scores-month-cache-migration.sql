-- /admin/scores month-scoped analysis cache. Lets a non-"Force Fresh Data"
-- Score All run reuse a specific calendar month's analysis for up to 7 days
-- instead of always spending real YouTube quota on every artist.
--
-- Deliberately a SEPARATE table from lane_analyses (not just extra columns
-- there): lane_analyses is "the current rolling-window state of this lane"
-- that report builder / expansion picks read as the latest general answer.
-- A row here is a fixed historical month's snapshot — mixing the two would
-- let an old month's data become "the latest state" for callers expecting
-- current data. See lib/reports/nicheCache.ts's month-scoped branch and
-- lib/lanes/pipeline.ts's analyzeLaneForMonth.
--
-- Run in Supabase SQL Editor → New query → paste → Run.

create table if not exists public.lane_month_analyses (
  id              uuid        primary key default gen_random_uuid(),
  lane_id         uuid        references public.lanes(id) not null,
  month           int         not null,   -- 1-12
  year            int         not null,
  -- True when this month was confirmed to have zero matching videos —
  -- demand/saturation/etc. are meaningless zeroes in that case, cached only
  -- so a repeated non-force check doesn't re-spend quota rediscovering it.
  no_data         boolean     not null default false,
  demand          int         not null,
  saturation      int         not null,
  winnability     int         not null,
  opportunity     int         not null,
  raw_metrics     jsonb       not null,
  patterns        jsonb       not null,
  winner_videos   jsonb       not null,
  top_videos      jsonb       not null,
  created_at      timestamptz default now()
);

-- One row per (lane, month, year) — a re-analysis (forceRefresh, or a
-- retry after the prior attempt hit quota) replaces it rather than
-- accumulating history the way lane_analyses does; nothing here reads
-- "the prior month-scoped row" the way lane_analyses' momentum calc does.
create unique index if not exists lane_month_analyses_lane_month_idx
  on public.lane_month_analyses (lane_id, month, year);

alter table public.lane_month_analyses enable row level security;
create policy "lane_month_analyses: service role only"
  on public.lane_month_analyses
  using (false);
