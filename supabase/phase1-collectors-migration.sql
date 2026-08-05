-- Phase 1 data collectors: channel snapshot history + streaming momentum
-- engine. Both are pure collectors (no UI) — their value is history, so
-- both start accumulating snapshots the moment this migration + the crons
-- in vercel.json are live. RLS mirrors every other table in this codebase:
-- service-role only, no anon/user access (see supabase/lane-check-migration.sql).
-- Run in Supabase SQL Editor → New query → paste → Run.

-- =============================================================================
-- PART A — Channel snapshot history
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tracked_channels
-- One row per YouTube channel under active history tracking. Populated two
-- ways: auto-enrollment from a successful report-builder analysis (see
-- app/api/admin/report-builder/analyze/route.ts), or (later, out of scope for
-- this migration) linked to an outreach_prospects row via prospect_id.
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_channels (
  id                uuid        primary key default gen_random_uuid(),
  channel_id        text        unique not null,
  channel_name      text,
  subscriber_count  int,
  prospect_id       uuid        references public.outreach_prospects(id),
  user_id           uuid,
  active            boolean     not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.tracked_channels enable row level security;
create policy "tracked_channels: service role only"
  on public.tracked_channels
  using (false);

-- ---------------------------------------------------------------------------
-- tracked_channel_videos
-- One row per (channel, video, snapshot day) — never overwritten, so daily
-- snapshots accumulate into real history instead of clobbering the prior
-- day's numbers. The unique constraint is what makes the cron idempotent:
-- a re-run on the same day just no-ops (upsert) instead of duplicating rows.
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_channel_videos (
  id                   uuid        primary key default gen_random_uuid(),
  tracked_channel_id   uuid        references public.tracked_channels(id) not null,
  video_id             text        not null,
  title                text,
  published_at         timestamptz,
  view_count           bigint,
  views_per_day        numeric,
  detected_niche       text,
  snapshot_date        date        not null,
  created_at           timestamptz default now(),
  unique (tracked_channel_id, video_id, snapshot_date)
);

create index if not exists tracked_channel_videos_channel_idx
  on public.tracked_channel_videos (tracked_channel_id, snapshot_date desc);

alter table public.tracked_channel_videos enable row level security;
create policy "tracked_channel_videos: service role only"
  on public.tracked_channel_videos
  using (false);

-- =============================================================================
-- PART B — Streaming momentum engine
-- =============================================================================

-- ---------------------------------------------------------------------------
-- watchlist_artists
-- Seeded via scripts/seed-watchlist.ts. spotify_artist_id is resolved once at
-- seed time (via searchArtist) so the weekly snapshot cron never calls
-- Spotify's search endpoint — only the batched getSeveralArtists lookup.
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist_artists (
  id                      uuid        primary key default gen_random_uuid(),
  artist_name             text        not null,
  artist_name_normalized  text        unique not null,
  spotify_artist_id       text,
  lastfm_name             text,
  genre                   text,
  lane_id                 uuid        references public.lanes(id),
  active                  boolean     not null default true,
  created_at              timestamptz default now()
);

alter table public.watchlist_artists enable row level security;
create policy "watchlist_artists: service role only"
  on public.watchlist_artists
  using (false);

-- ---------------------------------------------------------------------------
-- artist_momentum_snapshots
-- One row per (artist, snapshot day) — never overwritten, same
-- accumulate-don't-clobber shape as tracked_channel_videos above.
-- Nullable stats columns: a source failing for one artist (Spotify miss,
-- Last.fm rate limit, etc.) still writes a row with the other source's
-- fields populated — see lib/momentum/snapshot.ts's per-artist isolation.
-- ---------------------------------------------------------------------------
create table if not exists public.artist_momentum_snapshots (
  id                   uuid        primary key default gen_random_uuid(),
  watchlist_artist_id  uuid        references public.watchlist_artists(id) not null,
  spotify_followers    bigint,
  spotify_popularity   int,
  lastfm_listeners     bigint,
  lastfm_playcount     bigint,
  snapshot_date        date        not null,
  created_at           timestamptz default now(),
  unique (watchlist_artist_id, snapshot_date)
);

create index if not exists artist_momentum_snapshots_artist_idx
  on public.artist_momentum_snapshots (watchlist_artist_id, snapshot_date desc);

alter table public.artist_momentum_snapshots enable row level security;
create policy "artist_momentum_snapshots: service role only"
  on public.artist_momentum_snapshots
  using (false);
