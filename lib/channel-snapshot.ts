import { analyzeChannel } from "./channel-analysis";
import type { DeepChannelAnalysis, ArtistAssociation } from "./channel-analysis";

export type { DeepChannelAnalysis };

// ── Legacy types (kept for backward compat with existing DB rows) ─────────────

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
  deep_analysis?: DeepChannelAnalysis;
}

// ── Derive SnapshotRawData from DeepChannelAnalysis ───────────────────────────

function deriveRawData(analysis: DeepChannelAnalysis): SnapshotRawData {
  const videos: VideoData[] = analysis.recentVideos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    views: v.views,
    publishedAt: v.publishedAt,
    tags: v.tags,
  }));

  const top3 = analysis.winnersVsLosers.winners.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    views: v.views,
    publishedAt: v.publishedAt,
    tags: v.tags,
  }));

  const bottom3 = analysis.winnersVsLosers.losers.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    views: v.views,
    publishedAt: v.publishedAt,
    tags: v.tags,
  }));

  const artistPerformance: ArtistPerformance[] = analysis.artistAssociations.map(
    (a: ArtistAssociation) => ({
      name: a.name,
      videoCount: a.videoCount,
      totalViews: a.videoCount * a.avgViews,
      avgViews: a.avgViews,
    })
  );

  const uploadsPerMonth =
    analysis.recentVideoCount > 0
      ? Math.round(analysis.recentVideoCount * (30 / 30)) // already 30-day window
      : 0;

  return {
    subscribers: analysis.subscriberCount,
    totalViews: analysis.totalViews,
    avgViews: analysis.avgViewsLast30Days,
    videoCount: analysis.recentVideoCount,
    videos,
    top3,
    bottom3,
    artistPerformance,
    avgTitleLength: analysis.titleFormula.producerAvgTitleLength,
    uploadsPerMonth,
  };
}

function deriveTextFields(analysis: DeepChannelAnalysis): {
  top_insight: string;
  positioning_gap: string;
  title_pattern: string;
  recommendation: string;
} {
  const { winnersVsLosers, titleFormula, nextUpload, timingIntelligence } = analysis;

  const top_insight =
    winnersVsLosers.keyGap ||
    `${analysis.channelName} averages ${analysis.avgViewsLast30Days.toLocaleString()} views per video with ${analysis.subscriberCount.toLocaleString()} subscribers.`;

  const bestArtist = analysis.artistAssociations[0];
  const positioning_gap = bestArtist
    ? `Strongest artist: ${bestArtist.name} (${bestArtist.avgViews.toLocaleString()} avg views). Missing niche keywords: ${analysis.missingKeywords
        .slice(0, 3)
        .map((k) => k.keyword)
        .join(", ") || "see deep analysis"}.`
    : timingIntelligence.gap;

  const title_pattern =
    titleFormula.formula
      ? `Top niche formula: ${titleFormula.formula}. Producer title score: ${titleFormula.producerScore}/100. Missing: ${titleFormula.missingElements.slice(0, 2).join(", ") || "none"}.`
      : "Insufficient data for title pattern analysis.";

  const recommendation = `${nextUpload.recommendedTitle} — upload on ${nextUpload.uploadDay} at ${nextUpload.uploadTime}. ${nextUpload.justification[0] ?? ""}`;

  return { top_insight, positioning_gap, title_pattern, recommendation };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateChannelSnapshot(
  channelId: string,
  channelName: string,
  genre: string | null
): Promise<ChannelSnapshot> {
  console.log(`[snapshot] starting for "${channelName}" (${channelId})`);

  const analysis = await analyzeChannel(
    channelId,
    channelName,
    genre ?? "hip hop",
    []
  );

  const raw_data = deriveRawData(analysis);
  const { top_insight, positioning_gap, title_pattern, recommendation } =
    deriveTextFields(analysis);

  console.log(`[snapshot] complete for "${channelName}"`);

  return {
    raw_data,
    top_insight,
    positioning_gap,
    title_pattern,
    recommendation,
    generated_at: analysis.generated_at,
    deep_analysis: analysis,
  };
}
