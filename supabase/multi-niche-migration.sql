-- Multi-artist niche detection fix: a title can co-mention several known
-- artists ("Boldy James x Larry June x Roc Marciano Type Beat"), so a video
-- snapshot needs to record every matched niche, not just one. Replaces
-- tracked_channel_videos.detected_niche (text) with detected_niches
-- (text[]), populated by lib/reports/channelTracking.ts's trackChannel via
-- lib/lanes/nicheMatch.ts's matchAllKnownLanes.
-- Run in Supabase SQL Editor → New query → paste → Run.

alter table public.tracked_channel_videos add column if not exists detected_niches text[];
alter table public.tracked_channel_videos drop column if exists detected_niche;
