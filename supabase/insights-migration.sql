-- Insights expansion: channel creation date for the winner_channel_age insight.
-- Run in Supabase SQL Editor → New query → paste → Run.
--
-- No new YouTube quota: channels.list is already called with part=snippet,statistics
-- (see lib/lanes/youtube.ts getChannelSubCounts) — snippet.publishedAt (channel
-- creation date) is already present in that response, just not captured until now.
-- Only lanes analyzed AFTER this ships will have it; existing channels_cache rows
-- backfill lazily the next time each channel is looked up.
alter table public.channels_cache add column if not exists channel_published_at timestamptz;
