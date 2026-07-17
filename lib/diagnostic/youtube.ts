// YouTube adapter for the diagnostic engine.
// Uses playlistItems.list instead of search.list to keep quota cost at ~3 units
// (channels.list + playlistItems.list + videos.list) instead of 100+ units.

import type { ChannelInput, VideoInput } from "./scoring";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

// ── Channel ID resolution ─────────────────────────────────────────────────────

export async function resolveChannelId(input: string): Promise<string> {
  const s = input.trim();

  // Raw channel ID: UCxxxxxxx (22+ chars)
  if (/^UC[\w-]{20,}$/.test(s)) return s;

  // youtube.com/channel/UCxxxxxxx
  const directMatch = s.match(/youtube\.com\/channel\/(UC[\w-]{20,})/);
  if (directMatch) return directMatch[1];

  // @handle (in URL or bare)
  const handleMatch = s.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (handleMatch) {
    const res = await fetch(
      `${YT}/channels?part=id&forHandle=%40${handleMatch[1]}&key=${KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]?.id) return data.items[0].id;
    throw new Error(`YouTube handle @${handleMatch[1]} not found`);
  }

  // youtube.com/c/name or youtube.com/user/name
  const nameMatch = s.match(/youtube\.com\/(?:c\/|user\/)([\w.-]+)/);
  if (nameMatch) {
    const res = await fetch(
      `${YT}/channels?part=id&forUsername=${nameMatch[1]}&key=${KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]?.id) return data.items[0].id;
  }

  throw new Error(
    `Cannot resolve channel ID from: "${s}". Use a YouTube channel URL, @handle, or channel ID.`
  );
}

// ── YouTube fetch (~3 quota units) ───────────────────────────────────────────

export async function fetchChannelDiagnosticData(channelId: string): Promise<{
  channel: ChannelInput;
  videos: VideoInput[];
}> {
  // 1. channels.list — statistics + snippet + contentDetails (1 unit)
  const chanRes = await fetch(
    `${YT}/channels?part=statistics,snippet,contentDetails&id=${channelId}&key=${KEY}`
  );
  if (!chanRes.ok) throw new Error(`YouTube channels.list failed: ${chanRes.status}`);

  const chanData = await chanRes.json();
  const ch = chanData.items?.[0];
  if (!ch) throw new Error(`Channel not found: ${channelId}`);

  const channel: ChannelInput = {
    channelId,
    title: ch.snippet?.title ?? "Unknown Channel",
    subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0"),
    totalViews: parseInt(ch.statistics?.viewCount ?? "0"),
    videoCount: parseInt(ch.statistics?.videoCount ?? "0"),
    publishedAt: ch.snippet?.publishedAt ?? "",
  };

  const uploadsPlaylistId: string | undefined =
    ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { channel, videos: [] };

  // 2. playlistItems.list — 50 most recent video IDs (1 unit)
  // Using playlistItems instead of search.list saves ~97 quota units.
  const plRes = await fetch(
    `${YT}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${KEY}`
  );
  if (!plRes.ok) throw new Error(`YouTube playlistItems.list failed: ${plRes.status}`);

  const plData = await plRes.json();
  const videoIds: string[] = (plData.items ?? []).map(
    (item: { contentDetails: { videoId: string } }) => item.contentDetails.videoId
  );
  if (!videoIds.length) return { channel, videos: [] };

  // 3. videos.list — full details, batched at 50/request (1 unit per batch)
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const rawItems = (
    await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch(
          `${YT}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${KEY}`
        );
        if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
        const data = await res.json();
        return data.items ?? [];
      })
    )
  ).flat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos: VideoInput[] = (rawItems as any[]).map((v) => ({
    videoId: v.id as string,
    title: (v.snippet?.title ?? "") as string,
    description: (v.snippet?.description ?? "") as string,
    tags: (v.snippet?.tags ?? []) as string[],
    viewCount: parseInt(v.statistics?.viewCount ?? "0"),
    likeCount: parseInt(v.statistics?.likeCount ?? "0"),
    commentCount: parseInt(v.statistics?.commentCount ?? "0"),
    publishedAt: (v.snippet?.publishedAt ?? "") as string,
    durationSeconds: parseDurationSecs(v.contentDetails?.duration ?? ""),
  }));

  return { channel, videos };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDurationSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] ?? "0") * 3600 +
    parseInt(m[2] ?? "0") * 60 +
    parseInt(m[3] ?? "0")
  );
}
