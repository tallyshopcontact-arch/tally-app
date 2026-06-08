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

export async function searchNicheVideos(
  genre: string,
  maxResults: number
): Promise<NicheVideo[]> {
  const publishedAfter = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const q = encodeURIComponent(`${genre} type beat`);

  const searchRes = await fetch(
    `${YT}/search?part=snippet&type=video&q=${q}&order=viewCount` +
      `&publishedAfter=${publishedAfter}&maxResults=${Math.min(maxResults, 50)}&key=${KEY}`
  );
  const searchData = await searchRes.json();
  const items: { id: { videoId: string } }[] = searchData.items ?? [];
  if (!items.length) return [];

  const ids = items.map((i) => i.id.videoId).join(",");
  const videosRes = await fetch(
    `${YT}/videos?part=snippet,statistics&id=${ids}&key=${KEY}`
  );
  const videosData = await videosRes.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (videosData.items ?? []).map((v: any) => ({
    videoId: v.id,
    title: v.snippet.title,
    channelName: v.snippet.channelTitle,
    viewCount: parseInt(v.statistics.viewCount ?? "0"),
    tags: v.snippet.tags ?? [],
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl:
      v.snippet.thumbnails?.high?.url ??
      v.snippet.thumbnails?.default?.url ??
      "",
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
