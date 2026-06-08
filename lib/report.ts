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
  growth: string;
  why: string;
}

export interface AvoidPattern {
  pattern: string;
  explanation: string;
  fix: string;
}

export interface ActionItem {
  action: string;
  priority: "High" | "Medium" | "Low";
  why: string;
}

export interface UploadKit {
  title: string;
  description: string;
  tags: string[];
  thumbnail_brief: string;
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

// ── Core helpers ──────────────────────────────────────────────────────────────

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

// Strip markdown code fences that Claude sometimes wraps around JSON responses.
function stripJson(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
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

  // Include all channels (even with 1 video) — requiring >= 2 filtered out
  // most results since niche videos come from many different channels.
  const channels = [...channelMap.entries()]
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

Channel data (last 30 days):
${summary}

Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation. Just the raw JSON array.
Schema (2-3 items):
[{"name":"Channel Name","growth":"e.g. 2 videos, 45K avg views","why":"2 sentences on why they are rising and what specifically is working"}]`,
    600
  );

  console.log("[TALLY:report] generateRisingArtists raw:", raw.slice(0, 400));

  const clean = stripJson(raw);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error("empty array");
  } catch {
    console.error("[TALLY:report] generateRisingArtists parse failed. raw:", raw);
    return [
      {
        name: channels[0]?.name ?? "Unknown",
        growth: `${channels[0]?.videoCount ?? 1} video(s), ${(channels[0]?.avgViews ?? 0).toLocaleString()} avg views`,
        why: "This channel is the top performer in your niche this period based on average view count.",
      },
    ];
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

Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation. Just the raw JSON array.
Schema (exactly 3 items):
[{"pattern":"Short pattern name (3-6 words)","explanation":"1 sentence on why this hurts performance","fix":"1-2 sentence specific fix the producer should apply"}]`,
    600
  );

  console.log("[TALLY:report] generateWhatToAvoid raw:", raw.slice(0, 400));

  const clean = stripJson(raw);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error("empty array");
  } catch {
    console.error("[TALLY:report] generateWhatToAvoid parse failed. raw:", raw);
    return [
      {
        pattern: "Generic beat titles",
        explanation: "Titles without artist names or beat type get lower search visibility.",
        fix: "Include the target artist name and beat type in every title, e.g. '\"Midnight\" | Travis Scott Type Beat 2026'.",
      },
      {
        pattern: "Missing description keywords",
        explanation: "Videos without keyword-rich descriptions are harder for YouTube to categorize.",
        fix: "Add at least 150 words of description with genre, artist names, and licensing info.",
      },
      {
        pattern: "Low upload frequency",
        explanation: "Channels uploading less than once per week see slower subscriber growth.",
        fix: "Aim for 2-4 uploads per week to stay active in YouTube's recommendation feed.",
      },
    ];
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

Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation. Just the raw JSON array.
Schema (exactly 7 items, High-priority items first):
[{"action":"5-12 word specific action","priority":"High","why":"1-2 sentences on what to do exactly and why, tied to their specific numbers"}]
priority must be exactly "High", "Medium", or "Low".`,
    800
  );

  console.log("[TALLY:report] generateActionPlan raw:", raw.slice(0, 400));

  const clean = stripJson(raw);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error("empty array");
  } catch {
    console.error("[TALLY:report] generateActionPlan parse failed. raw:", raw);
    return [
      {
        action: "Study the top 3 niche videos this month",
        priority: "High" as const,
        why: "Understanding exactly what made those videos succeed gives you a direct blueprint to replicate their title structure, tags, and thumbnail style.",
      },
      {
        action: "Upload at least 2 videos this week",
        priority: "High" as const,
        why: "Consistent upload frequency signals to YouTube's algorithm that your channel is active, which improves recommendation reach.",
      },
      {
        action: "Add target artist name to every title",
        priority: "High" as const,
        why: "Titles with artist names rank higher in search for type beat queries and drive more qualified traffic.",
      },
      {
        action: "Write a 150-word keyword-rich description",
        priority: "Medium" as const,
        why: "Detailed descriptions help YouTube understand your content and surface it to buyers searching for your genre.",
      },
      {
        action: "Use 8-10 tags per video",
        priority: "Medium" as const,
        why: "Videos with more relevant tags appear in more related video sidebars, increasing passive discovery.",
      },
      {
        action: "Improve thumbnail contrast and readability",
        priority: "Medium" as const,
        why: "A clear, high-contrast thumbnail with the beat name improves click-through rate in mobile feeds.",
      },
      {
        action: "Comment on 5 niche competitor videos",
        priority: "Low" as const,
        why: "Genuine engagement in your niche builds community visibility and can drive traffic back to your channel.",
      },
    ];
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
- title: 9-12 words, beat name in quotes, artist pairing, year 2026
- description: full 180-word description with licensing info, download link placeholder, and top keywords
- tags: array of 8-10 SEO-optimized strings
- thumbnail_brief: one sentence visual concept for the thumbnail

Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation. Just the raw JSON array.
Schema (exactly 3 items):
[{"title":"...","description":"...","tags":["tag1","tag2"],"thumbnail_brief":"..."}]`,
    1200
  );

  console.log("[TALLY:report] generateUploadKit raw:", raw.slice(0, 400));

  const clean = stripJson(raw);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error("empty array");
  } catch {
    console.error("[TALLY:report] generateUploadKit parse failed. raw:", raw);
    const genre = profile.genre ?? "hip hop";
    const artist = profile.top_artist_1 ?? "Drake";
    return [
      {
        title: `"Ghost Walk" | ${artist} Type Beat 2026 | ${genre}`,
        description: `"Ghost Walk" is a hard-hitting ${genre} type beat produced for artists in the style of ${artist}. This instrumental features melodic hooks, punchy 808s, and a cinematic vibe perfect for mixtapes and commercial releases.\n\n🎵 Free for non-profit use with credit. For commercial use, visit the link below.\n📥 Download / Purchase License: [YOUR LINK HERE]\n\nKeywords: ${genre} type beat, ${artist} type beat 2026, free type beat, instrumental, trap beat, melodic type beat, ${genre} instrumental 2026\n\n© All rights reserved. Unauthorized monetization prohibited.`,
        tags: [`${genre} type beat`, `${artist} type beat`, "type beat 2026", "free type beat", `${genre} instrumental`, "trap beat", "melodic type beat", "beat producer"],
        thumbnail_brief: `Dark gradient background with the beat name in bold white text and a glowing waveform graphic centered below it.`,
      },
      {
        title: `"Neon Keys" | ${artist} Type Beat 2026 | Melodic ${genre}`,
        description: `"Neon Keys" blends smooth piano melodies with hard-hitting trap drums — a versatile ${genre} type beat for artists inspired by ${artist}. Ideal for singles, albums, and content creators.\n\n🎵 Free for non-profit use with credit. Commercial licenses available.\n📥 Download / Purchase License: [YOUR LINK HERE]\n\nKeywords: melodic ${genre} type beat, ${artist} type beat 2026, piano type beat, trap instrumental, free melodic beat, ${genre} beats 2026\n\n© All rights reserved.`,
        tags: [`melodic ${genre} beat`, `${artist} type beat 2026`, "piano type beat", "trap instrumental", "free beat", "melodic trap", `${genre} beat 2026`, "type beat"],
        thumbnail_brief: `Neon blue and purple tones with a piano keys graphic and the beat title overlaid in clean sans-serif font.`,
      },
      {
        title: `"Dark Matter" | ${artist} Type Beat 2026 | Hard ${genre}`,
        description: `"Dark Matter" is an aggressive, atmospheric ${genre} instrumental built for hard-hitting verses. Inspired by the sound of ${artist}, this beat features layered synths, deep bass, and snapping hi-hats.\n\n🎵 Free for non-profit with credit. Exclusive and non-exclusive licenses available.\n📥 Download / Purchase License: [YOUR LINK HERE]\n\nKeywords: hard ${genre} type beat, ${artist} type beat, dark type beat 2026, aggressive trap beat, ${genre} instrumental, exclusive type beat\n\n© All rights reserved.`,
        tags: [`hard ${genre} type beat`, `${artist} type beat`, "dark type beat", "aggressive trap beat", `${genre} instrumental 2026`, "exclusive type beat", "trap beat", "dark instrumental"],
        thumbnail_brief: `Black background with deep red and smoke visual effects, beat title in large bold white letters with a subtle glow.`,
      },
    ];
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
