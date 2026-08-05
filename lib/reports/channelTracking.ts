// Channel snapshot history (Phase 1 data collector) — no UI, its value is
// history: daily snapshots so deltas have two spaced points to compare.
// Two entry points into public.tracked_channels:
//   1. Auto-enrollment — app/api/admin/report-builder/analyze/route.ts calls
//      upsertTrackedChannel after every successful analysis, so a channel
//      starts accumulating history the moment it's analyzed, no separate
//      registration step.
//   2. The daily cron (app/api/cron/track-channels) — snapshotAllChannels
//      iterates every active row and calls trackChannel on each.
//
// Reuses the same channels.list -> playlistItems.list -> videos.list
// sequence as lib/reports/channelAnalyzer.ts (never search.list — 100
// units/call vs ~1 for the playlist read) and the same lanes-table niche
// matcher (lib/lanes/nicheMatch.ts) so a video's detected_niche here never
// disagrees with how the report builder would classify the same title.
import type { SupabaseClient } from "@supabase/supabase-js";
import { viewsPerDay } from "@/lib/lanes/scoring";
import { fetchLaneMatchers, matchKnownLane } from "@/lib/lanes/nicheMatch";
import { reserveQuota } from "@/lib/lanes/db";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

// Videos published in the last 90 days, per the brief — recent enough to
// matter for growth-report deltas without paging back through a channel's
// entire upload history every single day.
const LOOKBACK_DAYS = 90;
const PLAYLIST_PAGE_SIZE = 50;
// Safety net against a pathological/misordered playlist, matching
// channelAnalyzer.ts's own paging cap — not an expected case at 90 days.
const MAX_PLAYLIST_PAGES = 20;
const MAX_VIDEOS_PER_SNAPSHOT = 200;
const VIDEOS_PER_CALL = 50; // videos.list accepts at most 50 ids per call

// channels.list + playlistItems.list (1-2 pages typically) + 1-4x
// videos.list, all ~1 unit each in practice — rounded above actual cost to
// keep snapshotAllChannels' per-channel budget reservation honest.
export const ESTIMATED_UNITS_PER_CHANNEL = 15;

interface ChannelMetaFull {
  channelName: string;
  subscriberCount: number;
  uploadsPlaylistId: string | null;
}

async function fetchChannelMeta(channelId: string): Promise<ChannelMetaFull> {
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: channelId, key: KEY });
  const res = await fetch(`${YT}/channels?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status}`);
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error(`Channel not found for ID: ${channelId}`);

  return {
    channelName: (ch.snippet?.title ?? "") as string,
    subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0"),
    uploadsPlaylistId: (ch.contentDetails?.relatedPlaylists?.uploads ?? null) as string | null,
  };
}

async function fetchUploadsVideoIdsSince(playlistId: string, since: Date): Promise<string[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: String(PLAYLIST_PAGE_SIZE),
      key: KEY,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${YT}/playlistItems?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube playlistItems.list failed: ${res.status}`);
    const data = await res.json();
    const items = (data.items ?? []) as {
      snippet?: { publishedAt?: string };
      contentDetails?: { videoId?: string };
    }[];

    let pastWindow = false;
    for (const item of items) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.snippet?.publishedAt;
      if (!videoId || !publishedAt) continue;
      const publishedDate = new Date(publishedAt);
      if (publishedDate < since) { pastWindow = true; break; } // playlist is newest-first — nothing further can match
      videoIds.push(videoId);
      if (videoIds.length >= MAX_VIDEOS_PER_SNAPSHOT) return videoIds;
    }

    if (pastWindow) break;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return videoIds;
}

interface VideoSnapshotData {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  viewsPerDay: number;
}

async function fetchVideoSnapshotData(videoIds: string[]): Promise<VideoSnapshotData[]> {
  const rows: VideoSnapshotData[] = [];
  for (let i = 0; i < videoIds.length; i += VIDEOS_PER_CALL) {
    const batch = videoIds.slice(i, i + VIDEOS_PER_CALL);
    const params = new URLSearchParams({ part: "snippet,statistics", id: batch.join(","), key: KEY });
    const res = await fetch(`${YT}/videos?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of (data.items ?? []) as any[]) {
      const viewCount = parseInt(v.statistics?.viewCount ?? "0");
      const publishedAt = (v.snippet?.publishedAt ?? "") as string;
      rows.push({
        videoId: v.id as string,
        title: (v.snippet?.title ?? "") as string,
        publishedAt,
        viewCount,
        viewsPerDay: Math.round(viewsPerDay({ viewCount, publishedAt })),
      });
    }
  }
  return rows;
}

/** Upsert-only, no YouTube calls of its own — the metadata is already in
 * hand from the caller (either a fresh channels.list read in trackChannel,
 * or an already-completed report-builder analysis). Used both by
 * trackChannel below and by the report-builder analyze route's
 * auto-enrollment, which has no reason to spend extra quota re-fetching
 * what analyzeChannel already returned. */
export async function upsertTrackedChannel(
  supabase: SupabaseClient,
  fields: { channelId: string; channelName: string; subscriberCount: number }
): Promise<string> {
  const { data, error } = await supabase
    .from("tracked_channels")
    .upsert(
      {
        channel_id: fields.channelId,
        channel_name: fields.channelName,
        subscriber_count: fields.subscriberCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertTrackedChannel failed: ${error.message}`);
  return data.id as string;
}

export interface TrackChannelResult {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  videosSnapshotted: number;
}

/** Refreshes tracked_channels' name/sub count, then snapshots every video
 * published in the last 90 days: view count, views/day, and detected niche.
 * Safe to call multiple times per day — the (tracked_channel_id, video_id,
 * snapshot_date) unique constraint makes a same-day re-run a no-op upsert
 * rather than a duplicate row. */
export async function trackChannel(supabase: SupabaseClient, channelId: string): Promise<TrackChannelResult> {
  const meta = await fetchChannelMeta(channelId);
  const trackedChannelId = await upsertTrackedChannel(supabase, {
    channelId,
    channelName: meta.channelName,
    subscriberCount: meta.subscriberCount,
  });

  if (!meta.uploadsPlaylistId) {
    return { channelId, channelName: meta.channelName, subscriberCount: meta.subscriberCount, videosSnapshotted: 0 };
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const videoIds = await fetchUploadsVideoIdsSince(meta.uploadsPlaylistId, since);
  const videos = await fetchVideoSnapshotData(videoIds);

  const matchers = await fetchLaneMatchers(supabase);
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const rows = videos.map((v) => {
    const match = matchKnownLane(v.title, matchers);
    return {
      tracked_channel_id: trackedChannelId,
      video_id: v.videoId,
      title: v.title,
      published_at: v.publishedAt,
      view_count: v.viewCount,
      views_per_day: v.viewsPerDay,
      detected_niche: match?.displayName ?? null,
      snapshot_date: snapshotDate,
    };
  });

  if (rows.length) {
    const { error } = await supabase
      .from("tracked_channel_videos")
      .upsert(rows, { onConflict: "tracked_channel_id,video_id,snapshot_date" });
    if (error) throw new Error(`trackChannel video snapshot upsert failed: ${error.message}`);
  }

  return {
    channelId,
    channelName: meta.channelName,
    subscriberCount: meta.subscriberCount,
    videosSnapshotted: rows.length,
  };
}

export interface SnapshotAllChannelsResult {
  processed: number;
  succeeded: number;
  failed: number;
  quotaExhausted: boolean;
}

/** Iterates every active tracked_channels row, reserving ~15 quota units per
 * channel (see lib/lanes/db.ts reserveQuota / supabase/upload-kit-migration.sql)
 * before each call so a long tracked-channel list can't blow the daily YouTube
 * budget. One channel failing (deleted/private channel, transient API error)
 * is logged and does not stop the run — same per-item isolation pattern as
 * lib/lanes/insights.ts's safeCompute. */
export async function snapshotAllChannels(supabase: SupabaseClient): Promise<SnapshotAllChannelsResult> {
  const { data: channels, error } = await supabase
    .from("tracked_channels")
    .select("id, channel_id")
    .eq("active", true);
  if (error) throw new Error(`snapshotAllChannels query failed: ${error.message}`);

  let succeeded = 0;
  let failed = 0;
  let quotaExhausted = false;

  for (const channel of (channels ?? []) as { id: string; channel_id: string }[]) {
    const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_CHANNEL);
    if (!allowed) {
      console.error(`[channelTracking] quota budget reached — stopping run before channel ${channel.channel_id}`);
      quotaExhausted = true;
      break;
    }

    try {
      await trackChannel(supabase, channel.channel_id);
      succeeded++;
    } catch (err) {
      console.error(`[channelTracking] snapshot failed for channel ${channel.channel_id}:`, err);
      failed++;
    }
  }

  return { processed: succeeded + failed, succeeded, failed, quotaExhausted };
}
