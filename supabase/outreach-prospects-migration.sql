-- Outreach Prospects — lane-based Producer Finder (see /admin/prospects).
-- Deliberately separate from the older `prospects` table (the genre/artist-
-- based "Producer Finder" tab in /admin, lib/producer-finder.ts): this is a
-- fresh, simpler, lane-driven pipeline. The older table/tab is a candidate
-- for retirement once this one is validated in real use — not removed yet.
-- Run in Supabase SQL Editor → New query → paste → Run.

create table if not exists public.outreach_prospects (
  id                  uuid        primary key default gen_random_uuid(),
  channel_id          text        not null unique,
  channel_name        text        not null,
  subscriber_count    integer     not null default 0,
  recent_video_title  text,
  lane_id             uuid        references public.lanes(id),
  artist_name         text        not null,
  status              text        not null default 'pending',
  created_at          timestamptz default now()
);

alter table public.outreach_prospects enable row level security;
create policy "outreach_prospects: service role only"
  on public.outreach_prospects
  using (false);
