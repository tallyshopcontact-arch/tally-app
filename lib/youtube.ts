import type { NicheVideo } from "./keywords";

// Re-export so callers can import getTopNicheVideos from either lib
export { getTopNicheVideos } from "./keywords";
export type { NicheVideo } from "./keywords";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelStats {
  channelName: string;
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  description: string;
  thumbnailUrl: string;
}

export interface VideoData {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  thumbnailUrl: string;
  duration: string;
}

export interface MonthlyStats {
  videosPosted: VideoData[];
  totalMonthlyViews: number;
  bestVideo: VideoData | null;
}

// ── Channel ID resolution ─────────────────────────────────────────────────────

export async function extractChannelId(url: string): Promise<string> {
  // Direct channel ID: youtube.com/channel/UCxxxxxxx
  const directMatch = url.match(/youtube\.com\/channel\/(UC[\w-]{20,})/);
  if (directMatch) return directMatch[1];

  // Handle: youtube.com/@handle
  const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/);
  if (handleMatch) {
    const res = await fetch(
      `${YT}/channels?part=id&forHandle=%40${handleMatch[1]}&key=${KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]?.id) return data.items[0].id;
    throw new Error(`YouTube handle @${handleMatch[1]} not found`);
  }

  // Vanity or username: youtube.com/c/name or youtube.com/user/name
  const nameMatch = url.match(/youtube\.com\/(?:c\/|user\/)([\w.-]+)/);
  if (nameMatch) {
    const res = await fetch(
      `${YT}/channels?part=id&forUsername=${nameMatch[1]}&key=${KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]?.id) return data.items[0].id;

    // forUsername missed — try search as last resort
    const searchRes = await fetch(
      `${YT}/search?part=snippet&type=channel&q=${encodeURIComponent(
        nameMatch[1]
      )}&maxResults=1&key=${KEY}`
    );
    const searchData = await searchRes.json();
    const id = searchData.items?.[0]?.id?.channelId;
    if (id) return id;
  }

  throw new Error(`Cannot resolve channel ID from URL: ${url}`);
}

// ── Channel stats ─────────────────────────────────────────────────────────────

export async function getChannelStats(channelId: string): Promise<ChannelStats> {
  const res = await fetch(
    `${YT}/channels?part=statistics,snippet&id=${channelId}&key=${KEY}`
  );
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error(`Channel not found: ${channelId}`);

  return {
    channelName: ch.snippet.title,
    subscriberCount: parseInt(ch.statistics.subscriberCount ?? "0"),
    totalViews: parseInt(ch.statistics.viewCount ?? "0"),
    videoCount: parseInt(ch.statistics.videoCount ?? "0"),
    description: ch.snippet.description ?? "",
    thumbnailUrl:
      ch.snippet.thumbnails?.high?.url ??
      ch.snippet.thumbnails?.default?.url ??
      "",
  };
}

// ── Recent videos ─────────────────────────────────────────────────────────────

export async function getRecentVideos(
  channelId: string,
  maxResults: number
): Promise<VideoData[]> {
  const searchRes = await fetch(
    `${YT}/search?part=id&channelId=${channelId}&type=video&order=date` +
      `&maxResults=${Math.min(maxResults, 50)}&key=${KEY}`
  );
  const searchData = await searchRes.json();
  const ids: string[] = (searchData.items ?? []).map(
    (item: { id: { videoId: string } }) => item.id.videoId
  );
  if (!ids.length) return [];
  return fetchVideoDetails(ids);
}

// ── Monthly stats ─────────────────────────────────────────────────────────────

export async function getMonthlyStats(
  channelId: string,
  year: number,
  month: number
): Promise<MonthlyStats> {
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 0, 23, 59, 59).toISOString();

  const searchRes = await fetch(
    `${YT}/search?part=id&channelId=${channelId}&type=video` +
      `&publishedAfter=${from}&publishedBefore=${to}&maxResults=50&key=${KEY}`
  );
  const searchData = await searchRes.json();
  const ids: string[] = (searchData.items ?? []).map(
    (item: { id: { videoId: string } }) => item.id.videoId
  );

  if (!ids.length) {
    return { videosPosted: [], totalMonthlyViews: 0, bestVideo: null };
  }

  const videos = await fetchVideoDetails(ids);
  const totalMonthlyViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const bestVideo = videos.reduce<VideoData | null>(
    (best, v) => (!best || v.viewCount > best.viewCount ? v : best),
    null
  );

  return { videosPosted: videos, totalMonthlyViews, bestVideo };
}

// ── Niche search ──────────────────────────────────────────────────────────────

// Titles containing any of these are immediately disqualified.
const BLOCKLIST = [
  "reaction", "review", "tutorial", "how to", "vlog", "podcast",
  "interview", "freestyle", "cypher", "cipher", "official video",
  "music video", " mv ", "lyrics", "lyric video", "challenge",
  "documentary", "behind the scenes", "studio session",
];

// Titles must contain at least one of these to qualify.
const ALLOWLIST = [
  "type beat", "type-beat", "instrumental", "beat for", "prod by",
  "free beat", "trap beat", "boom bap beat", "drill beat", "lo-fi beat",
];

// Single beats are roughly 1–20 minutes; outside that range is a short clip
// or a long compilation.
const MIN_SECS = 60;
const MAX_SECS = 1200;

function parseDurationSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] ?? "0") * 3600 +
    parseInt(m[2] ?? "0") * 60 +
    parseInt(m[3] ?? "0")
  );
}

export async function searchNicheVideos(
  genre: string,
  artists: string[]
): Promise<NicheVideo[]> {
  // 90-day window gives enough volume to filter down to 20 quality results.
  const publishedAfter = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  // One search per term: genre + up to 3 artists (cap at 4 to protect quota).
  const terms = [genre, ...artists.filter(Boolean)].slice(0, 4);

  // Run all searches in parallel. part=id only to minimize per-item payload;
  // full details are fetched below via videos.list.
  const idLists = await Promise.all(
    terms.map(async (term) => {
      const q = encodeURIComponent(`${term} type beat`);
      const res = await fetch(
        `${YT}/search?part=id&type=video&q=${q}&order=viewCount` +
          `&publishedAfter=${publishedAfter}&maxResults=50&key=${KEY}`
      );
      const data = await res.json();
      return (data.items ?? []).map(
        (i: { id: { videoId: string } }) => i.id.videoId
      ) as string[];
    })
  );

  // Deduplicate across all search results.
  const uniqueIds = [...new Set(idLists.flat())];
  if (!uniqueIds.length) return [];

  // Fetch snippet (tags), statistics, and contentDetails (duration) in chunks of 50.
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    chunks.push(uniqueIds.slice(i, i + 50));
  }

  const rawItems = (
    await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch(
          `${YT}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${KEY}`
        );
        const data = await res.json();
        return data.items ?? [];
      })
    )
  ).flat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (rawItems as any[]).map((v) => ({
    videoId: v.id as string,
    title: v.snippet.title as string,
    channelName: v.snippet.channelTitle as string,
    viewCount: parseInt(v.statistics?.viewCount ?? "0"),
    tags: (v.snippet.tags ?? []) as string[],
    publishedAt: v.snippet.publishedAt as string,
    thumbnailUrl: (v.snippet.thumbnails?.high?.url ??
      v.snippet.thumbnails?.default?.url ??
      "") as string,
    durationSecs: parseDurationSecs(v.contentDetails?.duration ?? ""),
  }));

  const isBeatContent = (title: string) => {
    const t = title.toLowerCase();
    return (
      ALLOWLIST.some((kw) => t.includes(kw)) &&
      !BLOCKLIST.some((kw) => t.includes(kw))
    );
  };

  const inDurationRange = (secs: number) => secs >= MIN_SECS && secs <= MAX_SECS;

  const toNicheVideo = (v: typeof mapped[number]): NicheVideo => ({
    videoId: v.videoId,
    title: v.title,
    channelName: v.channelName,
    viewCount: v.viewCount,
    tags: v.tags,
    publishedAt: v.publishedAt,
    thumbnailUrl: v.thumbnailUrl,
  });

  // Primary filter: beat content + duration range + 1k views.
  let results = mapped.filter(
    (v) => isBeatContent(v.title) && inDurationRange(v.durationSecs) && v.viewCount >= 1000
  );

  // Fallback: relax view floor to 500 if fewer than 3 survive primary filter.
  if (results.length < 3) {
    results = mapped.filter(
      (v) => isBeatContent(v.title) && inDurationRange(v.durationSecs) && v.viewCount >= 500
    );
  }

  return results
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 50)
    .map(toNicheVideo);
}

// Artist-first thumbnail search: per-artist "type beat" searches first,
// then genre+vibe fill-in to reach 5 results.
export async function searchArtistFirstThumbnails(
  artists: string[],
  genre: string,
  vibes: string[]
): Promise<NicheVideo[]> {
  const publishedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const validArtists = artists.filter(Boolean).slice(0, 3);
  const collected = new Map<string, boolean>(); // videoId → seen

  // Step 1: per-artist search — top 2 results per artist
  if (validArtists.length > 0) {
    const artistIdGroups = await Promise.all(
      validArtists.map(async (artist) => {
        const q = encodeURIComponent(`${artist} type beat`);
        const res = await fetch(
          `${YT}/search?part=id&type=video&q=${q}&order=viewCount` +
            `&publishedAfter=${publishedAfter}&maxResults=5&key=${KEY}`
        );
        const data = await res.json();
        return ((data.items ?? []) as { id: { videoId: string } }[])
          .slice(0, 2)
          .map((i) => i.id.videoId);
      })
    );
    for (const ids of artistIdGroups) {
      for (const id of ids) collected.set(id, true);
    }
  }

  // Step 2: genre + vibe fill-in if fewer than 5
  if (collected.size < 5) {
    const vibeStr = vibes.filter(Boolean).slice(0, 2).join(" ");
    const q = encodeURIComponent(`${vibeStr ? vibeStr + " " : ""}${genre} type beat`.trim());
    const res = await fetch(
      `${YT}/search?part=id&type=video&q=${q}&order=viewCount` +
        `&publishedAfter=${publishedAfter}&maxResults=15&key=${KEY}`
    );
    const data = await res.json();
    for (const item of (data.items ?? []) as { id: { videoId: string } }[]) {
      if (!collected.has(item.id.videoId)) collected.set(item.id.videoId, true);
    }
  }

  const allIds = [...collected.keys()];
  if (!allIds.length) return [];

  // Fetch full details in chunks of 50
  const chunks: string[][] = [];
  for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));

  const rawItems = (
    await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch(
          `${YT}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${KEY}`
        );
        const data = await res.json();
        return data.items ?? [];
      })
    )
  ).flat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (rawItems as any[]).map((v) => ({
    videoId: v.id as string,
    title: v.snippet.title as string,
    channelName: v.snippet.channelTitle as string,
    viewCount: parseInt(v.statistics?.viewCount ?? "0"),
    tags: (v.snippet.tags ?? []) as string[],
    publishedAt: v.snippet.publishedAt as string,
    thumbnailUrl: (v.snippet.thumbnails?.high?.url ??
      v.snippet.thumbnails?.default?.url ?? "") as string,
    durationSecs: parseDurationSecs(v.contentDetails?.duration ?? ""),
  }));

  const isBeatContent = (title: string) => {
    const t = title.toLowerCase();
    return ALLOWLIST.some((kw) => t.includes(kw)) && !BLOCKLIST.some((kw) => t.includes(kw));
  };

  let results = mapped.filter(
    (v) => isBeatContent(v.title) && v.durationSecs >= MIN_SECS && v.durationSecs <= MAX_SECS && v.viewCount >= 1000
  );
  if (results.length < 3) {
    results = mapped.filter(
      (v) => isBeatContent(v.title) && v.durationSecs >= MIN_SECS && v.durationSecs <= MAX_SECS && v.viewCount >= 500
    );
  }

  return results
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v): NicheVideo => ({
      videoId: v.videoId,
      title: v.title,
      channelName: v.channelName,
      viewCount: v.viewCount,
      tags: v.tags,
      publishedAt: v.publishedAt,
      thumbnailUrl: v.thumbnailUrl,
    }));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchVideoDetails(ids: string[]): Promise<VideoData[]> {
  const res = await fetch(
    `${YT}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${KEY}`
  );
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items ?? []).map((v: any) => ({
    videoId: v.id,
    title: v.snippet.title,
    description: v.snippet.description ?? "",
    tags: v.snippet.tags ?? [],
    viewCount: parseInt(v.statistics.viewCount ?? "0"),
    likeCount: parseInt(v.statistics.likeCount ?? "0"),
    commentCount: parseInt(v.statistics.commentCount ?? "0"),
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl:
      v.snippet.thumbnails?.high?.url ??
      v.snippet.thumbnails?.default?.url ??
      "",
    duration: v.contentDetails.duration,
  }));
}
