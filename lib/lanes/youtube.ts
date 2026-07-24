// Lane Check pivot — YouTube adapter for the lane analysis pipeline.
// No "@/..." aliases (see lib/lanes/types.ts) so this loads from both Next.js
// (bundler resolves aliases) and plain `node scripts/*.ts` (which doesn't).
//
// Quota budget per lane (see LANE-CHECK-BRIEF.md):
//   search.list x2 (100 units each) + videos.list (~2 units) + channels.list (~2 units)
//   = ~204 units/lane.

import type { SupabaseClient } from "@supabase/supabase-js";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

export interface SearchResultVideo {
  videoId: string;
  channelId: string;
  publishedAt: string;
}

export interface VideoDetails {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  thumbnailUrl: string;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function parseDurationSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] ?? "0") * 3600 + parseInt(m[2] ?? "0") * 60 + parseInt(m[3] ?? "0");
}

export interface SearchResult {
  items: SearchResultVideo[];
  /** YouTube's approximate total match count (pageInfo.totalResults) — unlike
   * items.length, this isn't capped at maxResults, so it's the real saturation signal. */
  totalResults: number;
}

/** search.list, type=video. Used for both the recency scan (order=date, ~saturation)
 * and the top-performer scan (order=viewCount, ~demand/winnability/patterns source). */
export async function searchVideos(
  query: string,
  opts: { order: "date" | "viewCount"; publishedAfterDays: number; maxResults: number }
): Promise<SearchResult> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: opts.order,
    q: query,
    publishedAfter: isoDaysAgo(opts.publishedAfterDays),
    maxResults: String(opts.maxResults),
    key: KEY,
  });
  const res = await fetch(`${YT}/search?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube search.list failed (order=${opts.order}): ${res.status}`);
  const data = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data.items ?? []) as any[]).map((item) => ({
    videoId: item.id.videoId as string,
    channelId: item.snippet.channelId as string,
    publishedAt: item.snippet.publishedAt as string,
  }));

  return { items, totalResults: data.pageInfo?.totalResults ?? items.length };
}

/** videos.list (snippet, statistics, contentDetails), batched at 50/request. */
export async function getVideoDetails(videoIds: string[]): Promise<VideoDetails[]> {
  if (!videoIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));

  const rawItems = (
    await Promise.all(
      chunks.map(async (chunk) => {
        const params = new URLSearchParams({
          part: "snippet,statistics,contentDetails",
          id: chunk.join(","),
          key: KEY,
        });
        const res = await fetch(`${YT}/videos?${params.toString()}`);
        if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
        const data = await res.json();
        return data.items ?? [];
      })
    )
  ).flat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rawItems as any[]).map((v) => ({
    videoId: v.id as string,
    title: (v.snippet?.title ?? "") as string,
    description: (v.snippet?.description ?? "") as string,
    tags: (v.snippet?.tags ?? []) as string[],
    channelId: (v.snippet?.channelId ?? "") as string,
    channelTitle: (v.snippet?.channelTitle ?? "") as string,
    publishedAt: (v.snippet?.publishedAt ?? "") as string,
    durationSeconds: parseDurationSecs(v.contentDetails?.duration ?? ""),
    viewCount: parseInt(v.statistics?.viewCount ?? "0"),
    thumbnailUrl: (v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? "") as string,
  }));
}

export interface ChannelInfo {
  title: string;
  subscriberCount: number;
  /** Channel creation date, for the winner_channel_age insight — null for
   * rows cached before this field existed, until next looked up (see
   * supabase/insights-migration.sql). */
  channelPublishedAt: string | null;
}

/** channels.list (snippet, statistics), batched, with a channels_cache read-through
 * so the same channel is never refetched across lane analyses. */
export async function getChannelSubCounts(
  supabase: SupabaseClient,
  channelIds: string[]
): Promise<Map<string, ChannelInfo>> {
  const distinct = [...new Set(channelIds.filter(Boolean))];
  const result = new Map<string, ChannelInfo>();
  if (!distinct.length) return result;

  const { data: cached } = await supabase
    .from("channels_cache")
    .select("channel_id, title, subscriber_count, channel_published_at")
    .in("channel_id", distinct);

  // A row cached before channel_published_at existed is treated as missing
  // so it gets backfilled on this pass rather than permanently stuck at null
  // — channels.list already returns the field for free (see comment below),
  // so there's no extra quota cost to re-fetching it once.
  const cachedIds = new Set(
    (cached ?? []).filter((c) => c.channel_published_at != null).map((c) => c.channel_id as string)
  );
  for (const c of cached ?? []) {
    if (c.channel_published_at == null) continue;
    result.set(c.channel_id as string, {
      title: (c.title as string) ?? "",
      subscriberCount: (c.subscriber_count as number) ?? 0,
      channelPublishedAt: c.channel_published_at as string,
    });
  }

  const missing = distinct.filter((id) => !cachedIds.has(id));
  if (!missing.length) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));

  const toUpsert: {
    channel_id: string;
    title: string;
    subscriber_count: number;
    channel_published_at: string | null;
    updated_at: string;
  }[] = [];
  for (const chunk of chunks) {
    // part is unchanged (snippet,statistics) — snippet.publishedAt (channel
    // creation date) is already in this response, just wasn't captured
    // before; this costs zero additional quota.
    const params = new URLSearchParams({ part: "snippet,statistics", id: chunk.join(","), key: KEY });
    const res = await fetch(`${YT}/channels?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status}`);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (data.items ?? []) as any[]) {
      const entry: ChannelInfo = {
        title: (c.snippet?.title ?? "") as string,
        subscriberCount: parseInt(c.statistics?.subscriberCount ?? "0"),
        channelPublishedAt: (c.snippet?.publishedAt as string) ?? null,
      };
      result.set(c.id as string, entry);
      toUpsert.push({
        channel_id: c.id,
        title: entry.title,
        subscriber_count: entry.subscriberCount,
        channel_published_at: entry.channelPublishedAt,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (toUpsert.length) {
    await supabase.from("channels_cache").upsert(toUpsert, { onConflict: "channel_id" });
  }

  return result;
}
