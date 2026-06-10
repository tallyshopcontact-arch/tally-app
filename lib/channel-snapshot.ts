import { anthropic } from "./anthropic";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

export interface VideoData {
  videoId: string;
  title: string;
  views: number;
  publishedAt: string;
  tags: string[];
}

export interface ArtistPerformance {
  name: string;
  videoCount: number;
  totalViews: number;
  avgViews: number;
}

export interface SnapshotRawData {
  subscribers: number;
  totalViews: number;
  avgViews: number;
  videoCount: number;
  videos: VideoData[];
  top3: VideoData[];
  bottom3: VideoData[];
  artistPerformance: ArtistPerformance[];
  avgTitleLength: number;
  uploadsPerMonth: number;
}

export interface ChannelSnapshot {
  raw_data: SnapshotRawData;
  top_insight: string;
  positioning_gap: string;
  title_pattern: string;
  recommendation: string;
  generated_at: string;
}

function extractArtist(title: string): string | null {
  // Matches "[Artist] type beat", "[Artist] instrumental", "[Artist] x [Artist] type beat"
  const patterns = [
    /^(.+?)\s+type\s+beat/i,
    /^(.+?)\s+instrumental/i,
    /^(.+?)\s+x\s+.+\s+type\s+beat/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      // Strip year suffixes like "2025", "2026" and trailing junk
      return m[1].replace(/\s*\d{4}$/, "").replace(/[\[\(].*/, "").trim();
    }
  }
  return null;
}

export async function generateChannelSnapshot(
  channelId: string,
  channelName: string,
  genre: string | null
): Promise<ChannelSnapshot> {
  console.log(`[snapshot] starting for "${channelName}" (${channelId})`);

  // 1. Channel stats
  const chanRes = await fetch(
    `${YT}/channels?part=statistics&id=${channelId}&key=${KEY}`
  );
  const chanData = await chanRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chanStats = (chanData.items?.[0] as any)?.statistics ?? {};
  const subscribers = parseInt(chanStats.subscriberCount ?? "0");
  const totalViews = parseInt(chanStats.viewCount ?? "0");

  // 2. Last 10 videos via uploads playlist
  const uploadsId = `UU${channelId.slice(2)}`;
  const plRes = await fetch(
    `${YT}/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=10&key=${KEY}`
  );
  const plData = await plRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = plData.items ?? [];

  const videoIds: string[] = items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => i.snippet?.resourceId?.videoId as string)
    .filter(Boolean);

  console.log(`[snapshot] found ${videoIds.length} video IDs for "${channelName}"`);

  if (videoIds.length === 0) {
    return buildEmptySnapshot(subscribers, totalViews, channelName, genre);
  }

  // 3. Video statistics + snippet
  const vRes = await fetch(
    `${YT}/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${KEY}`
  );
  const vData = await vRes.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos: VideoData[] = (vData.items ?? []).map((v: any) => ({
    videoId: v.id as string,
    title: (v.snippet?.title ?? "") as string,
    views: parseInt(v.statistics?.viewCount ?? "0"),
    publishedAt: (v.snippet?.publishedAt ?? "") as string,
    tags: (v.snippet?.tags ?? []) as string[],
  }));

  // 4. Sort by views
  const sorted = [...videos].sort((a, b) => b.views - a.views);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-Math.min(3, sorted.length)).reverse();

  // 5. Artist associations
  const artistMap = new Map<string, { count: number; views: number }>();
  for (const v of videos) {
    const artist = extractArtist(v.title);
    if (artist && artist.length >= 2) {
      const key = artist.toLowerCase();
      const prev = artistMap.get(key) ?? { count: 0, views: 0 };
      artistMap.set(key, { count: prev.count + 1, views: prev.views + v.views });
    }
  }
  const artistPerformance: ArtistPerformance[] = [...artistMap.entries()]
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      videoCount: data.count,
      totalViews: data.views,
      avgViews: data.count > 0 ? Math.round(data.views / data.count) : 0,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  // 6. Metrics
  const avgViews =
    videos.length > 0
      ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length)
      : 0;

  const avgTitleLength =
    videos.length > 0
      ? Math.round(videos.reduce((s, v) => s + v.title.length, 0) / videos.length)
      : 0;

  let uploadsPerMonth = 0;
  if (videos.length >= 2) {
    const dates = videos
      .map((v) => new Date(v.publishedAt).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a);
    if (dates.length >= 2) {
      const spanDays = (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24);
      const spanMonths = Math.max(spanDays / 30, 0.1);
      uploadsPerMonth = Math.round(videos.length / spanMonths);
    }
  }

  const raw_data: SnapshotRawData = {
    subscribers,
    totalViews,
    avgViews,
    videoCount: videos.length,
    videos,
    top3,
    bottom3,
    artistPerformance,
    avgTitleLength,
    uploadsPerMonth,
  };

  // 7. Claude analysis
  const contextLines: string[] = [
    `Channel: ${channelName}`,
    `Genre: ${genre ?? "type beats"}`,
    `Subscribers: ${subscribers.toLocaleString()}`,
    `Avg views per video: ${avgViews.toLocaleString()}`,
    `Videos analyzed: ${videos.length}`,
    `Uploads per month: ~${uploadsPerMonth}`,
    `Avg title length: ${avgTitleLength} characters`,
    ``,
    `Top 3 videos by views:`,
    ...top3.map((v, i) => `  ${i + 1}. "${v.title}" — ${v.views.toLocaleString()} views`),
    ``,
    `Bottom 3 videos by views:`,
    ...bottom3.map((v, i) => `  ${i + 1}. "${v.title}" — ${v.views.toLocaleString()} views`),
  ];

  if (artistPerformance.length > 0) {
    contextLines.push("", "Artist associations (by avg views):");
    for (const a of artistPerformance.slice(0, 5)) {
      contextLines.push(
        `  ${a.name}: ${a.videoCount} video${a.videoCount === 1 ? "" : "s"}, ${a.avgViews.toLocaleString()} avg views`
      );
    }
  }

  const prompt = `Analyze this YouTube beat producer channel and provide a data-driven analysis.

${contextLines.join("\n")}

Provide exactly 4 items. Use specific numbers from the data above.

TOP_INSIGHT: [The single most compelling data point — e.g. a specific view gap between artist associations, or title length correlation with views. Max 2 sentences. Must include actual numbers.]

POSITIONING_GAP: [What they're doing vs what's working — e.g. if they upload more J Cole beats but Nas beats get 3x more views, that's the gap. Max 2 sentences. Be specific.]

TITLE_PATTERN: [What their best-performing titles have in common — structure, length, words. Max 2 sentences.]

RECOMMENDATION: [One specific actionable change starting with a verb. E.g. "Upload 2 Nas type beats per week for the next month and track whether avg views cross 1,000." Max 2 sentences.]

Return only these 4 lines in exact format.`;

  console.log(`[snapshot] calling Claude for "${channelName}"`);
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  console.log(`[snapshot] Claude response (${text.length} chars) for "${channelName}"`);

  const extract = (label: string): string => {
    const m = text.match(new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, "s"));
    return m ? m[1].trim() : "";
  };

  return {
    raw_data,
    top_insight: extract("TOP_INSIGHT") || `${channelName} averages ${avgViews.toLocaleString()} views per video with ${subscribers.toLocaleString()} subscribers.`,
    positioning_gap: extract("POSITIONING_GAP") || "Not enough data to identify a clear positioning gap.",
    title_pattern: extract("TITLE_PATTERN") || "Insufficient data for title pattern analysis.",
    recommendation: extract("RECOMMENDATION") || "Upload more consistently and focus on your highest-performing artist associations.",
    generated_at: new Date().toISOString(),
  };
}

function buildEmptySnapshot(
  subscribers: number,
  totalViews: number,
  channelName: string,
  genre: string | null
): ChannelSnapshot {
  const raw_data: SnapshotRawData = {
    subscribers,
    totalViews,
    avgViews: 0,
    videoCount: 0,
    videos: [],
    top3: [],
    bottom3: [],
    artistPerformance: [],
    avgTitleLength: 0,
    uploadsPerMonth: 0,
  };
  return {
    raw_data,
    top_insight: `${channelName} has ${subscribers.toLocaleString()} subscribers but no recent videos were found to analyze.`,
    positioning_gap: "No recent video data available.",
    title_pattern: "No recent video data available.",
    recommendation: `Start uploading ${genre ?? "type beat"} videos consistently to build an analyzable pattern.`,
    generated_at: new Date().toISOString(),
  };
}
