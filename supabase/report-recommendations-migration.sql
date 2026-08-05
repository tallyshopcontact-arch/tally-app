-- Growth-report recommendation tracking — the input side of next month's
-- (not-yet-built) grading loop. Every report generation writes one row here:
-- the auto-generated experiment (with a machine-checkable prediction, not
-- just prose), the action plan's recommended niches in priority order, and
-- a benchmark snapshot of the channel's velocity vs. its peer median at the
-- moment the report was sent. Nothing reads this table yet — it exists so
-- the record is there when the reader gets built, rather than starting a
-- month behind. Run in Supabase SQL Editor → New query → paste → Run.

create table if not exists public.growth_reports (
  id                uuid        primary key default gen_random_uuid(),
  channel_id        text        not null,
  channel_name      text,
  report_month      int         not null,
  report_year       int         not null,
  diagnosis_type    text        not null,
  recommendations   jsonb       not null,
  created_at        timestamptz default now(),
  -- One row per channel per reporting period — regenerating a report for
  -- the same month overwrites the prior record rather than duplicating it.
  unique (channel_id, report_month, report_year)
);

create index if not exists growth_reports_channel_idx
  on public.growth_reports (channel_id, report_year desc, report_month desc);

alter table public.growth_reports enable row level security;
create policy "growth_reports: service role only"
  on public.growth_reports
  using (false);
