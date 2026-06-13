import { anthropic } from "./anthropic";
import { searchNicheVideos } from "./youtube";
import type { NicheVideo } from "./keywords";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalysisVideo {
  videoId: string;
  title: string;
  views: number;
  likes: number;
  tags: string[];
  description: string;
  publishedAt: string;
  durationSecs: number;
}

export interface VideoGroupPattern {
  avgViews: number;
  avgTitleLengthChars: number;
  avgDescriptionWords: number;
  topTags: string[];
  commonUploadDays: string[];
  artistMentions: string[];
}

export interface WinnersVsLosers {
  winners: AnalysisVideo[];
  losers: AnalysisVideo[];
  winnerPattern: VideoGroupPattern;
  loserPattern: VideoGroupPattern;
  keyGap: string;
}

export interface DayIntelligence {
  day: string;
  nicheAvgViews: number;
  producerUploads: number;
}

export interface TimingIntelligence {
  byDay: DayIntelligence[];
  bestDayInNiche: string;
  bestDayMultiplier: number;
  producerMostCommonDay: string;
  producerAvgViewsOnMostCommonDay: number;
  gap: string;
  bestTimeOfDay?: string | null;
  bestTimeMultiplier?: number | null;
  uploadFrequency?: number;
  maxGapDays?: number;
  consistencyScore?: number;
  consistencyInsight?: string;
  timingPriority?: "consistency" | "time_of_day" | "day_of_week";
}

export interface MissingKeyword {
  keyword: string;
  nicheFrequency: number;
}

export interface ArtistAssociation {
  name: string;
  videoCount: number;
  avgViews: number;
  isTrending: boolean;
}

export interface TitleFormulaAnalysis {
  formula: string;
  topNicheExamples: string[];
  producerAvgTitleLength: number;
  producerScore: number;
  missingElements: string[];
}

export interface DescriptionDepth {
  producerAvgWordCount: number;
  nicheTopPerformerAvgWordCount: number;
  hasLicensingCTA: boolean;
  hasBPM: boolean;
  hasHashtags: boolean;
  hasArtistTags: boolean;
  hasDownloadLink: boolean;
  score: number;
  missingElements: string[];
}

export interface NextUploadRecommendation {
  genre: string;
  bpmRange: string;
  artistCombination: string;
  recommendedTitle: string;
  uploadDay: string;
  uploadTime: string;
  justification: string[];
}

export interface DeepChannelAnalysis {
  channelId: string;
  channelName: string;
  genre: string;
  topArtists: string[];
  subscriberCount: number;
  totalViews: number;
  recentVideoCount: number;
  avgViewsLast30Days: number;
  topVideoViewsLast30Days: number;
  recentVideos: AnalysisVideo[];
  nicheVideos: NicheVideo[];
  winnersVsLosers: WinnersVsLosers;
  timingIntelligence: TimingIntelligence;
  missingKeywords: MissingKeyword[];
  artistAssociations: ArtistAssociation[];
  titleFormula: TitleFormulaAnalysis;
  descriptionDepth: DescriptionDepth;
  nextUpload: NextUploadRecommendation;
  generated_at: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseDurationSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] ?? "0") * 3600 + parseInt(m[2] ?? "0") * 60 + parseInt(m[3] ?? "0");
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function extractArtistFromTitle(title: string): string | null {
  const patterns = [
    /^[""“”](.+?)[""“”]\s*\|\s*(.+?)\s+[Tt]ype\s+[Bb]eat/,
    /^(.+?)\s+x\s+.+?\s+[Tt]ype\s+[Bb]eat/i,
    /^(.+?)\s+[Tt]ype\s+[Bb]eat/i,
    /^(.+?)\s+[Ii]nstrumental/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = title.match(patterns[i]);
    if (m) {
      const raw = i === 0 ? m[2] : m[1];
      const cleaned = raw
        .replace(/\s*\d{4}$/, "")
        .replace(/[\[\(].*/, "")
        .replace(/\s*\|\s*.*/, "")
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 40) return cleaned;
    }
  }
  return null;
}

function computeGroupPattern(videos: AnalysisVideo[]): VideoGroupPattern {
  if (videos.length === 0) {
    return {
      avgViews: 0,
      avgTitleLengthChars: 0,
      avgDescriptionWords: 0,
      topTags: [],
      commonUploadDays: [],
      artistMentions: [],
    };
  }

  const avgViews = Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length);
  const avgTitleLengthChars = Math.round(
    videos.reduce((s, v) => s + v.title.length, 0) / videos.length
  );
  const avgDescriptionWords = Math.round(
    videos.reduce((s, v) => s + v.description.split(/\s+/).filter(Boolean).length, 0) /
      videos.length
  );

  const tagFreq = new Map<string, number>();
  for (const v of videos) {
    for (const t of v.tags) {
      const tag = t.toLowerCase().trim();
      if (tag.length >= 3) tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const dayCounts = new Map<string, number>();
  for (const v of videos) {
    const day = DAYS[new Date(v.publishedAt).getDay()];
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const commonUploadDays = [...dayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => d);

  const artistMentions = videos
    .map((v) => extractArtistFromTitle(v.title))
    .filter((a): a is string => a !== null);

  return { avgViews, avgTitleLengthChars, avgDescriptionWords, topTags, commonUploadDays, artistMentions };
}

function buildKeyGap(
  winnerPattern: VideoGroupPattern,
  loserPattern: VideoGroupPattern
): string {
  if (winnerPattern.avgViews === 0 && loserPattern.avgViews === 0) {
    return "Not enough video data to identify a clear pattern yet.";
  }

  const multiplier =
    loserPattern.avgViews > 0
      ? (winnerPattern.avgViews / loserPattern.avgViews).toFixed(1)
      : "∞";

  const winnerArtist = winnerPattern.artistMentions[0];
  const loserArtist = loserPattern.artistMentions[0];

  if (winnerArtist && winnerArtist !== loserArtist) {
    return `Your "${winnerArtist}" type beats average ${winnerPattern.avgViews.toLocaleString()} views — ${multiplier}x more than your other uploads (${loserPattern.avgViews.toLocaleString()} avg). Focus more on ${winnerArtist} beats.`;
  }

  const titleGap = winnerPattern.avgTitleLengthChars - loserPattern.avgTitleLengthChars;
  if (Math.abs(titleGap) > 8) {
    const direction = titleGap > 0 ? "longer" : "shorter";
    return `Your top videos have ${direction} titles (${winnerPattern.avgTitleLengthChars} chars avg vs ${loserPattern.avgTitleLengthChars}) and earn ${multiplier}x more views. Match that title length in every upload.`;
  }

  const winDay = winnerPattern.commonUploadDays[0];
  const loserDay = loserPattern.commonUploadDays[0];
  if (winDay && winDay !== loserDay) {
    return `Videos uploaded on ${winDay} average ${winnerPattern.avgViews.toLocaleString()} views — ${multiplier}x more than your ${loserDay ?? "other"} uploads. ${winDay} may be a factor, though consistency matters more than day choice.`;
  }

  return `Your top 3 videos average ${winnerPattern.avgViews.toLocaleString()} views vs ${loserPattern.avgViews.toLocaleString()} for your bottom 3 — a ${multiplier}x gap. The winners use more specific artist targeting in their titles.`;
}

async function fetchRecentChannelVideos(channelId: string): Promise<AnalysisVideo[]> {
  const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const searchRes = await fetch(
    `${YT}/search?part=id&channelId=${channelId}&type=video&order=date` +
      `&publishedAfter=${publishedAfter}&maxResults=50&key=${KEY}`
  );
  const searchData = await searchRes.json();
  const ids: string[] = (searchData.items ?? []).map(
    (i: { id: { videoId: string } }) => i.id.videoId
  );
  if (!ids.length) return [];

  const vRes = await fetch(
    `${YT}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${KEY}`
  );
  const vData = await vRes.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (vData.items ?? []).map((v: any): AnalysisVideo => ({
    videoId: v.id,
    title: v.snippet?.title ?? "",
    views: parseInt(v.statistics?.viewCount ?? "0"),
    likes: parseInt(v.statistics?.likeCount ?? "0"),
    tags: v.snippet?.tags ?? [],
    description: v.snippet?.description ?? "",
    publishedAt: v.snippet?.publishedAt ?? "",
    durationSecs: parseDurationSecs(v.contentDetails?.duration ?? ""),
  }));
}

function computeTimingIntelligence(
  recentVideos: AnalysisVideo[],
  nicheVideos: NicheVideo[]
): TimingIntelligence {
  // ── Day-of-week analysis ──────────────────────────────────────────────
  const nicheDayMap = new Map<string, number[]>();
  for (const v of nicheVideos) {
    if (!v.publishedAt) continue;
    const day = DAYS[new Date(v.publishedAt).getDay()];
    const arr = nicheDayMap.get(day) ?? [];
    arr.push(v.viewCount);
    nicheDayMap.set(day, arr);
  }

  const nicheOverallAvg =
    nicheVideos.length > 0
      ? Math.round(nicheVideos.reduce((s, v) => s + v.viewCount, 0) / nicheVideos.length)
      : 1;

  const byDay: DayIntelligence[] = DAYS.map((day) => {
    const views = nicheDayMap.get(day) ?? [];
    const nicheAvgViews =
      views.length > 0 ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0;
    const producerUploads = recentVideos.filter(
      (v) => v.publishedAt && DAYS[new Date(v.publishedAt).getDay()] === day
    ).length;
    return { day, nicheAvgViews, producerUploads };
  });

  const bestDay = byDay.reduce(
    (best, d) => (d.nicheAvgViews > best.nicheAvgViews ? d : best),
    byDay[0]
  );
  const bestDayMultiplier =
    Math.round((bestDay.nicheAvgViews / nicheOverallAvg) * 10) / 10 || 1;

  const producerDayCounts = new Map<string, { count: number; totalViews: number }>();
  for (const v of recentVideos) {
    if (!v.publishedAt) continue;
    const day = DAYS[new Date(v.publishedAt).getDay()];
    const prev = producerDayCounts.get(day) ?? { count: 0, totalViews: 0 };
    producerDayCounts.set(day, { count: prev.count + 1, totalViews: prev.totalViews + v.views });
  }

  let producerMostCommonDay = bestDay.day;
  let producerAvgViewsOnMostCommonDay = 0;
  let maxCount = 0;
  for (const [day, data] of producerDayCounts.entries()) {
    if (data.count > maxCount) {
      maxCount = data.count;
      producerMostCommonDay = day;
      producerAvgViewsOnMostCommonDay =
        data.count > 0 ? Math.round(data.totalViews / data.count) : 0;
    }
  }

  // ── Time-of-day analysis from niche top performers ────────────────────
  const TIME_BUCKETS = ["overnight", "morning", "afternoon", "evening"] as const;
  const toBucket = (publishedAt: string): string => {
    const h = new Date(publishedAt).getUTCHours();
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "afternoon";
    if (h >= 17 && h < 23) return "evening";
    return "overnight";
  };

  let bestTimeOfDay: string | null = null;
  let bestTimeMultiplier: number | null = null;

  const nicheWithDate = nicheVideos.filter(v => v.publishedAt);
  if (nicheWithDate.length >= 10) {
    const sortedByViews = [...nicheWithDate].sort((a, b) => b.viewCount - a.viewCount);
    const topSlice = sortedByViews.slice(0, Math.max(5, Math.floor(sortedByViews.length * 0.25)));
    const topCounts = new Map<string, number>();
    const allCounts = new Map<string, number>();
    for (const b of TIME_BUCKETS) { topCounts.set(b, 0); allCounts.set(b, 0); }
    for (const v of topSlice) {
      const b = toBucket(v.publishedAt);
      topCounts.set(b, (topCounts.get(b) ?? 0) + 1);
    }
    for (const v of nicheWithDate) {
      const b = toBucket(v.publishedAt);
      allCounts.set(b, (allCounts.get(b) ?? 0) + 1);
    }
    const totalTop = topSlice.length;
    const totalAll = nicheWithDate.length;
    let maxRatio = 1.3;
    for (const b of TIME_BUCKETS) {
      const topShare = (topCounts.get(b) ?? 0) / totalTop;
      const allShare = (allCounts.get(b) ?? 0) / totalAll;
      const ratio = allShare > 0.05 ? topShare / allShare : 0;
      if (ratio > maxRatio && topShare >= 0.15) {
        maxRatio = ratio;
        bestTimeOfDay = b;
        bestTimeMultiplier = Math.round(ratio * 10) / 10;
      }
    }
  }

  // ── Consistency analysis from producer's upload schedule ──────────────
  const sortedTimes = recentVideos
    .filter(v => v.publishedAt)
    .map(v => new Date(v.publishedAt).getTime())
    .sort((a, b) => a - b);

  let uploadFrequency = 0;
  let maxGapDays = 0;
  let consistencyScore = 0;
  let consistencyInsight = "";

  if (sortedTimes.length === 0) {
    consistencyInsight = "No uploads in the last 30 days.";
  } else if (sortedTimes.length === 1) {
    uploadFrequency = 0.25;
    maxGapDays = 30;
    consistencyScore = 5;
    consistencyInsight = "Only 1 upload in the last 30 days — no schedule pattern yet.";
  } else {
    const gaps: number[] = [];
    for (let i = 1; i < sortedTimes.length; i++) {
      gaps.push(Math.round((sortedTimes[i] - sortedTimes[i - 1]) / (1000 * 60 * 60 * 24)));
    }
    maxGapDays = Math.max(...gaps);
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    uploadFrequency = Math.round((sortedTimes.length / 30) * 7 * 10) / 10;
    const freqScore = Math.min(40, Math.round((Math.min(uploadFrequency, 3) / 3) * 40));
    const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
    const stddev = Math.sqrt(variance);
    const regularityScore = Math.min(60, Math.round(Math.max(0, 60 - stddev * 5)));
    consistencyScore = freqScore + regularityScore;
    const uniqueDays = new Set(sortedTimes.map(d => new Date(d).getDay())).size;
    if (maxGapDays >= 14) {
      consistencyInsight = `${sortedTimes.length} uploads across ${uniqueDays} different days with gaps up to ${maxGapDays} days between uploads — schedule is irregular.`;
    } else if (maxGapDays >= 7) {
      consistencyInsight = `${sortedTimes.length} uploads in 30 days with a ${maxGapDays}-day gap — some inconsistency in the schedule.`;
    } else {
      consistencyInsight = `${sortedTimes.length} uploads in 30 days with consistent spacing (max ${maxGapDays}-day gap) — solid schedule.`;
    }
  }

  // ── Timing priority: what to recommend first ──────────────────────────
  let timingPriority: "consistency" | "time_of_day" | "day_of_week";
  if (uploadFrequency < 1 || maxGapDays > 14 || sortedTimes.length < 4) {
    timingPriority = "consistency";
  } else if (bestTimeOfDay !== null) {
    timingPriority = "time_of_day";
  } else {
    timingPriority = "day_of_week";
  }

  const dayPct = Math.round((bestDayMultiplier - 1) * 100);
  const gap =
    timingPriority === "consistency"
      ? `${consistencyInsight} Consistency — picking 2 fixed days and sticking to them — matters more than which day you choose.`
      : producerMostCommonDay !== bestDay.day
        ? `When you post on ${bestDay.day}, performance trends ${dayPct > 0 ? `+${dayPct}%` : "slightly"} higher — but consistency matters more than any single 'best day'.`
        : `You already upload on ${bestDay.day}, the strongest day in your niche. Keep the consistent schedule.`;

  return {
    byDay,
    bestDayInNiche: bestDay.day,
    bestDayMultiplier,
    producerMostCommonDay,
    producerAvgViewsOnMostCommonDay,
    gap,
    bestTimeOfDay,
    bestTimeMultiplier,
    uploadFrequency,
    maxGapDays,
    consistencyScore,
    consistencyInsight,
    timingPriority,
  };
}

function computeMissingKeywords(
  recentVideos: AnalysisVideo[],
  nicheVideos: NicheVideo[]
): MissingKeyword[] {
  const nicheFreq = new Map<string, number>();
  for (const v of nicheVideos) {
    const seen = new Set<string>();
    for (const tag of v.tags) {
      const kw = tag.toLowerCase().trim();
      if (kw.length < 3) continue;
      if (!seen.has(kw)) {
        seen.add(kw);
        nicheFreq.set(kw, (nicheFreq.get(kw) ?? 0) + 1);
      }
    }
  }

  const threshold = Math.max(2, Math.floor(nicheVideos.length * 0.1));
  const nicheTop = [...nicheFreq.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  const producerTokens = new Set<string>();
  for (const v of recentVideos) {
    for (const tag of v.tags) producerTokens.add(tag.toLowerCase().trim());
    for (const word of v.title.toLowerCase().split(/[\s|""“”\-]+/))
      producerTokens.add(word.trim());
  }

  return nicheTop
    .filter(([kw]) => !producerTokens.has(kw))
    .slice(0, 10)
    .map(([keyword, nicheFrequency]) => ({ keyword, nicheFrequency }));
}

function computeArtistAssociations(
  recentVideos: AnalysisVideo[],
  nicheVideos: NicheVideo[]
): ArtistAssociation[] {
  const trendingArtists = new Set<string>();
  for (const v of nicheVideos) {
    const a = extractArtistFromTitle(v.title);
    if (a) trendingArtists.add(a.toLowerCase());
  }

  const artistMap = new Map<string, { count: number; totalViews: number }>();
  for (const v of recentVideos) {
    const artist = extractArtistFromTitle(v.title);
    if (artist && artist.length >= 2) {
      const key = artist.toLowerCase();
      const prev = artistMap.get(key) ?? { count: 0, totalViews: 0 };
      artistMap.set(key, { count: prev.count + 1, totalViews: prev.totalViews + v.views });
    }
  }

  return [...artistMap.entries()]
    .map(([key, data]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      videoCount: data.count,
      avgViews: data.count > 0 ? Math.round(data.totalViews / data.count) : 0,
      isTrending: trendingArtists.has(key),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

function computeDescriptionDepth(recentVideos: AnalysisVideo[]): DescriptionDepth {
  const descs = recentVideos.map((v) => v.description);
  const producerAvgWordCount =
    descs.length > 0
      ? Math.round(
          descs.reduce((s, d) => s + d.split(/\s+/).filter(Boolean).length, 0) / descs.length
        )
      : 0;

  const nicheTopPerformerAvgWordCount = 180;
  const threshold = Math.max(1, Math.floor(recentVideos.length * 0.4));

  const hasLicensingCTA =
    descs.filter((d) => /licens|lease|purchase|buy\s+beat|exclusive/i.test(d)).length >= threshold;
  const hasBPM = descs.filter((d) => /\d+\s*bpm|bpm\s*[:=]\s*\d+/i.test(d)).length >= threshold;
  const hasHashtags = descs.filter((d) => /#\w+/.test(d)).length >= threshold;
  const hasArtistTags = descs.filter((d) => /@\w+/.test(d)).length >= threshold;
  const hasDownloadLink =
    descs.filter((d) => /free\s*download|dl\s|download\s+link|bit\.ly|linktr|distrokid/i.test(d))
      .length >= threshold;

  const elements = [hasLicensingCTA, hasBPM, hasHashtags, hasArtistTags, hasDownloadLink];
  const score = Math.min(
    100,
    Math.round(
      (elements.filter(Boolean).length / elements.length) * 60 +
        Math.min(40, (producerAvgWordCount / nicheTopPerformerAvgWordCount) * 40)
    )
  );

  const missingElements: string[] = [];
  if (!hasLicensingCTA) missingElements.push("Licensing CTA (lease/buy link)");
  if (!hasBPM) missingElements.push("BPM mention");
  if (!hasHashtags) missingElements.push("Hashtags (#typebeat)");
  if (!hasArtistTags) missingElements.push("Artist @tags");
  if (!hasDownloadLink) missingElements.push("Free download / purchase link");

  return {
    producerAvgWordCount,
    nicheTopPerformerAvgWordCount,
    hasLicensingCTA,
    hasBPM,
    hasHashtags,
    hasArtistTags,
    hasDownloadLink,
    score,
    missingElements,
  };
}

async function generateTitleFormula(
  recentVideos: AnalysisVideo[],
  nicheVideos: NicheVideo[]
): Promise<TitleFormulaAnalysis> {
  const top10 = [...nicheVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
  const topTitlesList = top10
    .map((v) => `"${v.title}" (${v.viewCount.toLocaleString()} views)`)
    .join("\n");
  const producerSample = recentVideos
    .slice(0, 5)
    .map((v) => `"${v.title}"`)
    .join(", ");
  const producerAvgTitleLength =
    recentVideos.length > 0
      ? Math.round(recentVideos.reduce((s, v) => s + v.title.length, 0) / recentVideos.length)
      : 0;

  const raw = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Analyze the title formula used by top-performing beat videos.

Top 10 niche videos by views:
${topTitlesList}

Producer's recent titles (for comparison): ${producerSample || "none yet"}
Producer avg title length: ${producerAvgTitleLength} characters

Respond with ONLY valid JSON — no markdown, no explanation:
{"formula":"The pattern template string, e.g. '\"[Beat Name]\" | [Artist] Type Beat [Year] | [Vibe]'","topNicheExamples":["title1","title2","title3"],"producerScore":0,"missingElements":["element1","element2"]}

producerScore 0-100: how well the producer follows this formula
missingElements: 2-3 specific formula elements the producer is NOT using (or all if producerSample is empty)`,
      },
    ],
  });

  const text = raw.content[0].type === "text" ? raw.content[0].text : "{}";
  try {
    const parsed = JSON.parse(stripJson(text));
    return {
      formula: parsed.formula ?? `"[Beat Name]" | [Artist] Type Beat [Year]`,
      topNicheExamples: Array.isArray(parsed.topNicheExamples)
        ? parsed.topNicheExamples
        : top10.slice(0, 3).map((v) => v.title),
      producerAvgTitleLength,
      producerScore: typeof parsed.producerScore === "number" ? parsed.producerScore : 50,
      missingElements: Array.isArray(parsed.missingElements) ? parsed.missingElements : [],
    };
  } catch {
    return {
      formula: `"[Beat Name]" | [Artist] Type Beat [Year]`,
      topNicheExamples: top10.slice(0, 3).map((v) => v.title),
      producerAvgTitleLength,
      producerScore: 50,
      missingElements: ["Beat name in quotes", "Year at end"],
    };
  }
}

async function generateNextUpload(
  genre: string,
  topArtists: string[],
  winnersVsLosers: WinnersVsLosers,
  timingIntelligence: TimingIntelligence,
  missingKeywords: MissingKeyword[],
  artistAssociations: ArtistAssociation[],
  titleFormula: TitleFormulaAnalysis
): Promise<NextUploadRecommendation> {
  const prompt = `Generate a precise next-upload recommendation for a ${genre} beat producer based on their channel data.

Winner pattern: ${winnersVsLosers.winnerPattern.artistMentions.slice(0, 3).join(", ")} titles — avg ${winnersVsLosers.winnerPattern.avgViews.toLocaleString()} views
Loser pattern: avg ${winnersVsLosers.loserPattern.avgViews.toLocaleString()} views
Key gap: ${winnersVsLosers.keyGap}

Upload timing context:
- Consistency: ${timingIntelligence.consistencyInsight ?? `${timingIntelligence.producerMostCommonDay} is most common upload day`}
- Timing priority: ${timingIntelligence.timingPriority ?? "day_of_week"}
- Best time of day in niche: ${timingIntelligence.bestTimeOfDay ?? "no clear pattern"}${timingIntelligence.bestTimeMultiplier ? ` (${timingIntelligence.bestTimeMultiplier}x)` : ""}
- Best day in niche (tiebreaker only): ${timingIntelligence.bestDayInNiche} (${timingIntelligence.bestDayMultiplier}x niche avg)
${(timingIntelligence.timingPriority ?? "day_of_week") === "consistency" ? `→ PRIORITY: Recommend establishing a consistent schedule first. The uploadDay field should say "2 consistent days/week" or similar — do NOT name a single best day as the headline.` : (timingIntelligence.timingPriority ?? "day_of_week") === "time_of_day" ? `→ Schedule is consistent. LEAD with time-of-day: post in the ${timingIntelligence.bestTimeOfDay} window. Mention ${timingIntelligence.bestDayInNiche} only as a tiebreaker.` : `→ Schedule is consistent. Mention ${timingIntelligence.bestDayInNiche} as a tiebreaker if choosing between days.`}

Missing niche keywords they should add: ${missingKeywords.slice(0, 5).map((k) => k.keyword).join(", ") || "none identified"}

Their artist associations (name, avg views, trending in niche):
${artistAssociations.slice(0, 4).map((a) => `${a.name}: ${a.avgViews.toLocaleString()} avg views, trending: ${a.isTrending}`).join("\n") || "none yet"}

Target artists from profile: ${topArtists.join(", ") || "not specified"}

Title formula used by top niche videos: ${titleFormula.formula}
Formula elements they're missing: ${titleFormula.missingElements.join(", ") || "none"}

Respond with ONLY valid JSON — no markdown:
{"genre":"specific sub-genre or vibe","bpmRange":"e.g. 140-148","artistCombination":"Artist 1 x Artist 2","recommendedTitle":"complete ready-to-use title following the formula","uploadDay":"day of week","uploadTime":"e.g. 2:00 PM EST","justification":["specific data point 1","specific data point 2","specific data point 3"]}`;

  const raw = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = raw.content[0].type === "text" ? raw.content[0].text : "{}";
  const primaryArtist = topArtists[0] ?? artistAssociations[0]?.name ?? "Artist";
  const secondArtist = topArtists[1] ?? artistAssociations[1]?.name ?? "Drake";

  try {
    const parsed = JSON.parse(stripJson(text));
    return {
      genre: parsed.genre ?? genre,
      bpmRange: parsed.bpmRange ?? "140-150",
      artistCombination: parsed.artistCombination ?? `${primaryArtist} x ${secondArtist}`,
      recommendedTitle:
        parsed.recommendedTitle ?? `"Untitled" | ${primaryArtist} Type Beat 2026`,
      uploadDay: parsed.uploadDay ?? timingIntelligence.bestDayInNiche,
      uploadTime: parsed.uploadTime ?? "2:00 PM EST",
      justification: Array.isArray(parsed.justification)
        ? parsed.justification
        : ["Based on your channel analysis"],
    };
  } catch {
    return {
      genre,
      bpmRange: "140-150",
      artistCombination: `${primaryArtist} x ${secondArtist}`,
      recommendedTitle: `"Rise Up" | ${primaryArtist} Type Beat 2026`,
      uploadDay: timingIntelligence.bestDayInNiche,
      uploadTime: "2:00 PM EST",
      justification: [
        `${timingIntelligence.bestDayInNiche} is the strongest upload day in your niche`,
        `Your winner videos average ${winnersVsLosers.winnerPattern.avgViews.toLocaleString()} views`,
        `Missing keywords: ${missingKeywords
          .slice(0, 2)
          .map((k) => k.keyword)
          .join(", ") || "add niche-specific tags"}`,
      ],
    };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface AnalyzeChannelOptions {
  preloadedNicheVideos?: NicheVideo[];
}

export async function analyzeChannel(
  channelId: string,
  channelName: string,
  genre: string,
  topArtists: string[],
  options: AnalyzeChannelOptions = {}
): Promise<DeepChannelAnalysis> {
  console.log(`[analyzeChannel] starting for "${channelName}" (${channelId})`);

  const nichePromise = options.preloadedNicheVideos
    ? Promise.resolve(options.preloadedNicheVideos)
    : searchNicheVideos(genre, topArtists);

  const [chanJson, recentVideos, nicheVideos] = await Promise.all([
    fetch(`${YT}/channels?part=statistics&id=${channelId}&key=${KEY}`).then((r) => r.json()),
    fetchRecentChannelVideos(channelId),
    nichePromise,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chanStats = (chanJson.items?.[0] as any)?.statistics ?? {};
  const subscriberCount = parseInt(chanStats.subscriberCount ?? "0");
  const totalViews = parseInt(chanStats.viewCount ?? "0");

  const avgViewsLast30Days =
    recentVideos.length > 0
      ? Math.round(recentVideos.reduce((s, v) => s + v.views, 0) / recentVideos.length)
      : 0;
  const topVideoViewsLast30Days =
    recentVideos.length > 0 ? Math.max(...recentVideos.map((v) => v.views)) : 0;

  // Winners vs Losers
  const sorted = [...recentVideos].sort((a, b) => b.views - a.views);
  const winners = sorted.slice(0, Math.min(3, sorted.length));
  const losers = sorted.slice(-Math.min(3, sorted.length)).reverse();
  const winnerPattern = computeGroupPattern(winners);
  const loserPattern = computeGroupPattern(losers);
  const keyGap = buildKeyGap(winnerPattern, loserPattern);
  const winnersVsLosers: WinnersVsLosers = { winners, losers, winnerPattern, loserPattern, keyGap };

  // Computed insights (no Claude)
  const timingIntelligence = computeTimingIntelligence(recentVideos, nicheVideos);
  const missingKeywords = computeMissingKeywords(recentVideos, nicheVideos);
  const artistAssociations = computeArtistAssociations(recentVideos, nicheVideos);
  const descriptionDepth = computeDescriptionDepth(recentVideos);

  // Claude calls in parallel
  const [titleFormula, nextUpload] = await Promise.all([
    generateTitleFormula(recentVideos, nicheVideos),
    // Pass empty titleFormula placeholder — nextUpload doesn't need it to be accurate
    generateNextUpload(genre, topArtists, winnersVsLosers, timingIntelligence, missingKeywords, artistAssociations, {
      formula: "",
      topNicheExamples: [],
      producerAvgTitleLength: 0,
      producerScore: 0,
      missingElements: [],
    }),
  ]);

  console.log(`[analyzeChannel] complete for "${channelName}"`);

  return {
    channelId,
    channelName,
    genre,
    topArtists,
    subscriberCount,
    totalViews,
    recentVideoCount: recentVideos.length,
    avgViewsLast30Days,
    topVideoViewsLast30Days,
    recentVideos,
    nicheVideos,
    winnersVsLosers,
    timingIntelligence,
    missingKeywords,
    artistAssociations,
    titleFormula,
    descriptionDepth,
    nextUpload,
    generated_at: new Date().toISOString(),
  };
}

// ── TALLY score from deep analysis (no Claude needed) ─────────────────────────

export interface TallyScoreFromAnalysis {
  total: number;
  breakdown: { category: string; score: number; max: number }[];
  tip: string;
}

export function computeTallyScoreFromAnalysis(
  analysis: DeepChannelAnalysis
): TallyScoreFromAnalysis {
  const nicheAvg =
    analysis.nicheVideos.length > 0
      ? Math.round(
          analysis.nicheVideos.reduce((s, v) => s + v.viewCount, 0) / analysis.nicheVideos.length
        )
      : 1;

  // 1. Avg Views vs Niche (30 pts)
  const viewScore =
    nicheAvg > 0
      ? Math.min(30, Math.round((analysis.avgViewsLast30Days / nicheAvg) * 30))
      : 15;

  // 2. Title Strength (20 pts) — from titleFormula.producerScore scaled to 20
  const titleScore = Math.round((analysis.titleFormula.producerScore / 100) * 20);

  // 3. Description Depth (20 pts) — from descriptionDepth.score scaled to 20
  const descScore = Math.round((analysis.descriptionDepth.score / 100) * 20);

  // 4. Tag Usage (15 pts) — fewer missing keywords = higher score
  const maxMissing = 10;
  const tagScore = Math.round(
    ((maxMissing - Math.min(maxMissing, analysis.missingKeywords.length)) / maxMissing) * 15
  );

  // 5. Upload Consistency (15 pts)
  const consistency =
    analysis.recentVideoCount >= 12
      ? 15
      : analysis.recentVideoCount >= 8
      ? 12
      : analysis.recentVideoCount >= 4
      ? 8
      : analysis.recentVideoCount >= 2
      ? 5
      : analysis.recentVideoCount >= 1
      ? 3
      : 0;

  const total = Math.min(100, viewScore + titleScore + descScore + tagScore + consistency);

  const lowestCat = [
    { category: "Avg Views vs Niche", score: viewScore, max: 30 },
    { category: "Title Strength", score: titleScore, max: 20 },
    { category: "Description Depth", score: descScore, max: 20 },
    { category: "Tag Usage", score: tagScore, max: 15 },
    { category: "Upload Consistency", score: consistency, max: 15 },
  ].sort((a, b) => a.score / a.max - b.score / b.max)[0];

  const tipMap: Record<string, string> = {
    "Avg Views vs Niche": `Your avg views are below the niche average — add missing niche keywords and maintain a consistent upload schedule to close the gap.`,
    "Title Strength": `Adopt the formula "${analysis.titleFormula.formula}" — ${analysis.titleFormula.missingElements.slice(0, 2).join(" and ")} are missing from most of your titles.`,
    "Description Depth": `Add ${analysis.descriptionDepth.missingElements.slice(0, 2).join(" and ")} to every video description to reach niche top-performer standards.`,
    "Tag Usage": `Add these missing niche keywords to your tags: ${analysis.missingKeywords.slice(0, 3).map((k) => k.keyword).join(", ")}.`,
    "Upload Consistency": analysis.timingIntelligence.consistencyInsight
      ? `${analysis.timingIntelligence.consistencyInsight} Aim for 2+ uploads per week to build algorithmic momentum.`
      : `You uploaded ${analysis.recentVideoCount} videos in the last 30 days — aim for at least 8 to maximize algorithmic reach.`,
  };

  return {
    total,
    breakdown: [
      { category: "Avg Views vs Niche", score: viewScore, max: 30 },
      { category: "Title Strength", score: titleScore, max: 20 },
      { category: "Description Depth", score: descScore, max: 20 },
      { category: "Tag Usage", score: tagScore, max: 15 },
      { category: "Upload Consistency", score: consistency, max: 15 },
    ],
    tip: tipMap[lowestCat.category] ?? "Focus on consistency and niche keyword coverage.",
  };
}
