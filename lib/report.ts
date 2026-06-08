import { anthropic } from "./anthropic";
import type { NicheVideo } from "./keywords";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are TALLY's AI analyst, specializing in YouTube growth strategy for independent beat producers. You provide specific, data-driven insights based on real channel metrics and niche performance data. Be direct, concrete, and avoid generic advice. Always reference specific numbers and patterns from the data provided. Output only the requested content — no preambles, no meta-commentary.`;

// ── Input types ───────────────────────────────────────────────────────────────

export interface ChannelDataInput {
  channel_name: string;
  subscriber_count: number;
  total_views: number;
  video_count: number;
  monthly_views: number;
  monthly_subscribers: number;
  monthly_videos: number;
  monthly_likes: number;
  best_video_title: string | null;
  best_video_views: number | null;
}

export interface ProducerProfile {
  name: string | null;
  genre: string | null;
  youtube_channel_url: string | null;
  top_artist_1: string | null;
  top_artist_2: string | null;
  top_artist_3: string | null;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface TrendingBreakdown {
  videoId: string;
  breakdown: string;
}

export interface RisingArtist {
  name: string;
  channel: string;
  explanation: string;
}

export interface AvoidPattern {
  pattern: string;
  impact: string;
  fix: string;
}

export interface ActionItem {
  action: string;
  priority: "High" | "Medium" | "Low";
  detail: string;
}

export interface UploadKit {
  title: string;
  description: string;
  tags: string[];
  thumbnail: string;
}

export interface ScoreCategory {
  category: string;
  score: number;
  max: number;
}

export interface TallyScoreResult {
  total: number;
  breakdown: ScoreCategory[];
  tip: string;
}

// ── Core helper ───────────────────────────────────────────────────────────────

async function ask(prompt: string, maxTokens = 1000): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

// ── Report functions ──────────────────────────────────────────────────────────

export async function generateChannelSummary(
  channelData: ChannelDataInput,
  nicheData: NicheVideo[],
  profile: ProducerProfile
): Promise<string> {
  const nicheAvg =
    nicheData.length > 0
      ? Math.round(nicheData.reduce((s, v) => s + v.viewCount, 0) / nicheData.length)
      : 0;
  const producerAvg =
    channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : 0;
  const vsNiche = producerAvg >= nicheAvg ? "above" : "below";
  const artists = [profile.top_artist_1, profile.top_artist_2, profile.top_artist_3]
    .filter(Boolean)
    .join(", ") || "various artists";

  return ask(
    `Write a 3-4 sentence personalized monthly summary for ${profile.name ?? "this producer"} who runs the YouTube channel "${channelData.channel_name}" making ${profile.genre ?? "hip hop"} beats. Top target artists: ${artists}.

This month:
- Videos uploaded: ${channelData.monthly_videos}
- Total views: ${channelData.monthly_views.toLocaleString()}
- Avg views/video: ${producerAvg.toLocaleString()} (niche avg: ${nicheAvg.toLocaleString()} — producer is ${vsNiche} average)
- Likes: ${channelData.monthly_likes.toLocaleString()}
- Best video: "${channelData.best_video_title ?? "N/A"}" with ${(channelData.best_video_views ?? 0).toLocaleString()} views

Reference their real channel name, genre, how their month compared to the niche, and one key opportunity. Be warm but specific.`
  );
}

export async function generateBenchmarkInsights(
  channelData: ChannelDataInput,
  nicheData: NicheVideo[]
): Promise<string> {
  const sorted = [...nicheData].sort((a, b) => b.viewCount - a.viewCount);
  const top10 = sorted.slice(0, 10);
  const top10Avg =
    top10.length > 0
      ? Math.round(top10.reduce((s, v) => s + v.viewCount, 0) / top10.length)
      : 0;
  const nicheAvg =
    sorted.length > 0
      ? Math.round(sorted.reduce((s, v) => s + v.viewCount, 0) / sorted.length)
      : 0;
  const producerAvg =
    channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : 0;
  const topTitles = top10
    .slice(0, 5)
    .map((v) => `"${v.title}" — ${v.viewCount.toLocaleString()} views`)
    .join("\n");

  return ask(
    `Analyze how ${channelData.channel_name} compares to top performers in their niche.

Producer avg views/video: ${producerAvg.toLocaleString()}
Niche average (${sorted.length} videos): ${nicheAvg.toLocaleString()} views
Top 10 performer average: ${top10Avg.toLocaleString()} views

Top performing titles in the niche:
${topTitles}

Write 2-3 sentences: identify the producer's strongest metric and the biggest gap vs top performers. Be specific about what the top performers are doing that this producer isn't.`,
    600
  );
}

export async function generateTrendingBreakdowns(
  topVideos: (NicheVideo & { videoUrl?: string })[]
): Promise<TrendingBreakdown[]> {
  return Promise.all(
    topVideos.slice(0, 3).map(async (video) => {
      const breakdown = await ask(
        `Analyze why this beat producer video performed well:

Title: "${video.title}"
Channel: ${video.channelName}
Views: ${video.viewCount.toLocaleString()}
Tags: ${video.tags.slice(0, 8).join(", ") || "none listed"}
Published: ${new Date(video.publishedAt).toLocaleDateString()}

Write 2-3 sentences explaining specifically why this video got strong views. Cover: title structure and keyword placement, what it signals to the YouTube algorithm, and what other producers can replicate. Be specific.`,
        400
      );
      return { videoId: video.videoId, breakdown };
    })
  );
}

export async function generateRisingArtists(
  nicheData: NicheVideo[]
): Promise<RisingArtist[]> {
  const channelMap = new Map<string, number[]>();
  for (const v of nicheData) {
    const arr = channelMap.get(v.channelName) ?? [];
    arr.push(v.viewCount);
    channelMap.set(v.channelName, arr);
  }

  const channels = [...channelMap.entries()]
    .filter(([, views]) => views.length >= 2)
    .map(([name, views]) => ({
      name,
      avgViews: Math.round(views.reduce((a, b) => a + b, 0) / views.length),
      videoCount: views.length,
      maxViews: Math.max(...views),
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 5);

  if (!channels.length) return [];

  const summary = channels
    .map(
      (c) =>
        `${c.name}: ${c.videoCount} videos this period, avg ${c.avgViews.toLocaleString()} views, top video ${c.maxViews.toLocaleString()} views`
    )
    .join("\n");

  const raw = await ask(
    `Based on recent niche performance, identify 2-3 beat producers who are rising. For each, explain what they are doing well.

Channel data (last 90 days):
${summary}

Return a JSON array (2-3 items):
[{"name":"Channel Name","channel":"@handle","explanation":"2 sentences on why they are rising and what specifically is working"}]
Return only valid JSON.`,
    600
  );

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateWhatToAvoid(
  nicheData: NicheVideo[]
): Promise<AvoidPattern[]> {
  const sorted = [...nicheData].sort((a, b) => a.viewCount - b.viewCount);
  const bottom = sorted.slice(0, Math.min(20, sorted.length));
  const lowTitles = bottom
    .map((v) => `"${v.title}" (${v.viewCount.toLocaleString()} views)`)
    .join("\n");

  const raw = await ask(
    `Analyze the lowest-performing videos in this niche and identify 3 patterns hurting their view counts.

Lowest-performing videos:
${lowTitles}

Return a JSON array (exactly 3 items):
[{"pattern":"Short pattern name","impact":"Metric phrase e.g. -40% CTR","fix":"1-2 sentence specific fix"}]
Return only valid JSON.`,
    600
  );

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateActionPlan(
  channelData: ChannelDataInput,
  nicheData: NicheVideo[],
  profile: ProducerProfile
): Promise<ActionItem[]> {
  const nicheAvg =
    nicheData.length > 0
      ? Math.round(nicheData.reduce((s, v) => s + v.viewCount, 0) / nicheData.length)
      : 0;
  const producerAvg =
    channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : 0;
  const topVideo = [...nicheData].sort((a, b) => b.viewCount - a.viewCount)[0];
  const artists = [profile.top_artist_1, profile.top_artist_2, profile.top_artist_3]
    .filter(Boolean)
    .join(", ") || "not specified";

  const raw = await ask(
    `Generate 7 specific prioritized actions for ${profile.name ?? "this producer"} to take next month.

Data:
- Channel: ${channelData.channel_name} (${profile.genre ?? "hip hop"} beats)
- Monthly videos: ${channelData.monthly_videos}, views: ${channelData.monthly_views.toLocaleString()}
- Producer avg views/video: ${producerAvg.toLocaleString()} vs niche avg: ${nicheAvg.toLocaleString()}
- Best video this month: "${channelData.best_video_title ?? "N/A"}"
- Top niche video: "${topVideo?.title ?? "N/A"}" (${(topVideo?.viewCount ?? 0).toLocaleString()} views)
- Target artists: ${artists}

Return a JSON array (exactly 7 items), High-priority items first:
[{"action":"5-12 word specific action","priority":"High","detail":"1-2 sentences — what to do exactly and why, tied to their specific numbers"}]
Return only valid JSON.`,
    800
  );

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateUploadKit(
  profile: ProducerProfile,
  nicheData: NicheVideo[]
): Promise<UploadKit[]> {
  const tagFreq = new Map<string, number>();
  for (const v of nicheData) {
    for (const tag of v.tags ?? []) {
      tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([t]) => t)
    .join(", ");

  const topTitles = [...nicheData]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v) => v.title)
    .join("\n- ");

  const artists = [profile.top_artist_1, profile.top_artist_2, profile.top_artist_3]
    .filter(Boolean)
    .join(", ") || "various artists";

  const raw = await ask(
    `Generate 3 ready-to-use upload kits for a ${profile.genre ?? "hip hop"} beat producer whose top artists are ${artists}.

Top performing titles in their niche:
- ${topTitles}

Most-used tags in top niche videos: ${topTags}

Each kit needs:
- Title: 9-12 words, beat name in quotes, artist pairing, year 2026
- Description: full 180-word description with licensing info, download link placeholder, and top keywords
- Tags: 8-10 SEO-optimized tags
- Thumbnail: brief visual concept (1 sentence)

Return a JSON array (exactly 3 items):
[{"title":"...","description":"...","tags":["tag1","tag2"],"thumbnail":"..."}]
Return only valid JSON.`,
    1000
  );

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateTALLYScore(
  channelData: ChannelDataInput,
  nicheData: NicheVideo[]
): Promise<TallyScoreResult> {
  const nicheAvg =
    nicheData.length > 0
      ? Math.round(nicheData.reduce((s, v) => s + v.viewCount, 0) / nicheData.length)
      : 0;
  const producerAvg =
    channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : 0;
  const avgNicheTags =
    nicheData.length > 0
      ? Math.round(
          nicheData.reduce((s, v) => s + (v.tags?.length ?? 0), 0) / nicheData.length
        )
      : 8;

  const raw = await ask(
    `Calculate the TALLY score for ${channelData.channel_name} out of 100 across 5 categories.

Producer data:
- Monthly videos: ${channelData.monthly_videos}
- Monthly avg views/video: ${producerAvg.toLocaleString()}
- Niche average views/video: ${nicheAvg.toLocaleString()}
- Best video title: "${channelData.best_video_title ?? "N/A"}"
- Average tags per niche video: ${avgNicheTags}

Scoring (apply precisely):
1. Avg Views vs Niche (30pts): Full 30 if producer >= niche avg. Otherwise: round((producerAvg/nicheAvg)*30).
2. Title Structure (20pts): Analyze best_video_title — beat name in quotes (5pts), artist name present (5pts), year present (5pts), 8-12 words (5pts).
3. Description Quality (20pts): Estimate for this genre (10–20pts based on typical patterns).
4. Tags per Video (15pts): avgNicheTags >= 8 = 15pts. Scale: round((avgNicheTags/8)*15), max 15.
5. Upload Frequency (15pts): 4+ videos/month = 15, 2-3 = 10, 1 = 5, 0 = 0.

Return JSON only:
{"total":<sum>,"breakdown":[{"category":"Avg Views vs Niche","score":<0-30>,"max":30},{"category":"Title Structure","score":<0-20>,"max":20},{"category":"Description Quality","score":<0-20>,"max":20},{"category":"Tags per Video","score":<0-15>,"max":15},{"category":"Upload Frequency","score":<0-15>,"max":15}],"tip":"One sentence on the single biggest score improvement opportunity"}`,
    600
  );

  try {
    const parsed = JSON.parse(raw);
    // Recompute total from breakdown in case Claude drifts
    const total = Math.min(
      100,
      (parsed.breakdown as ScoreCategory[]).reduce((s, c) => s + c.score, 0)
    );
    return { ...parsed, total };
  } catch {
    return {
      total: 50,
      breakdown: [
        { category: "Avg Views vs Niche", score: 15, max: 30 },
        { category: "Title Structure", score: 12, max: 20 },
        { category: "Description Quality", score: 10, max: 20 },
        { category: "Tags per Video", score: 8, max: 15 },
        { category: "Upload Frequency", score: 5, max: 15 },
      ],
      tip: "Focus on closing the gap between your average views per video and the niche average.",
    };
  }
}
