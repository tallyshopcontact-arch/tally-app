// Lane Check pivot — the fresh lane analysis pipeline. Orchestrates the 4
// YouTube calls, deterministic scoring, and pattern analysis, then inserts a
// new lane_analyses row (never overwritten — self-building history) and
// updates lanes.last_analyzed_at.
//
// Job-queue-agnostic on purpose: callers (calibration script now, the cron
// job processor in build-order step 3) decide when to invoke this and what to
// do with lane_jobs status.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis } from "./types.ts";
import { searchVideos, getVideoDetails, getChannelSubCounts, type VideoDetails } from "./youtube.ts";
import {
  computeDemand, computeSaturation, computeWinnability, computeOpportunity,
  computeStatus, computeMomentum, SCORE_CALIBRATION, type DemandResult, type SaturationResult,
  type WinnabilityResult, type LaneStatus,
} from "./scoring.ts";
import { analyzePatterns, type PatternStats } from "./patterns.ts";

export interface GalleryVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  publishedAt: string;
}

export interface LaneAnalysisResult {
  laneId: string;
  laneSlug: string;
  query: string;
  demand: DemandResult;
  saturation: SaturationResult;
  winnability: WinnabilityResult;
  momentum: number | null;
  opportunity: number;
  status: LaneStatus;
  patterns: PatternStats;
  winnerVideos: GalleryVideo[];
  topVideos: GalleryVideo[];
  analysisRow: LaneAnalysis;
}

function toGalleryVideo(v: VideoDetails & { subscriberCount: number }): GalleryVideo {
  return {
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    channelId: v.channelId,
    channelTitle: v.channelTitle,
    subscriberCount: v.subscriberCount,
    viewCount: v.viewCount,
    publishedAt: v.publishedAt,
  };
}

export async function analyzeLane(supabase: SupabaseClient, lane: Lane): Promise<LaneAnalysisResult> {
  const query = lane.genre_hint
    ? `${lane.display_name} type beat ${lane.genre_hint}`
    : `${lane.display_name} type beat`;

  // Steps 1-2: recency scan (saturation) + top-performer scan (demand/winnability/patterns)
  const [recent, topByViews] = await Promise.all([
    searchVideos(query, { order: "date", publishedAfterDays: 30, maxResults: 50 }),
    searchVideos(query, { order: "viewCount", publishedAfterDays: 60, maxResults: 25 }),
  ]);
  // pageInfo.totalResults, NOT items.length — see computeSaturation's doc comment.
  const uploadsLast30d = recent.totalResults;

  // Step 3: videos.list for the union of both ID sets
  const allIds = [...new Set([...recent.items.map((v) => v.videoId), ...topByViews.items.map((v) => v.videoId)])];
  const details = await getVideoDetails(allIds);
  const detailsById = new Map(details.map((d) => [d.videoId, d]));

  const topPerformerDetails = topByViews.items
    .map((v) => detailsById.get(v.videoId))
    .filter((v): v is VideoDetails => !!v)
    .sort((a, b) => b.viewCount - a.viewCount);

  // Step 4: channels.list (cached) for top performers' channels only
  const channelInfo = await getChannelSubCounts(
    supabase,
    topPerformerDetails.map((v) => v.channelId)
  );
  const topPerformersWithSubs = topPerformerDetails.map((v) => ({
    ...v,
    subscriberCount: channelInfo.get(v.channelId)?.subscriberCount ?? 0,
  }));

  // Scoring
  const demand = computeDemand(topPerformersWithSubs);
  const saturation = computeSaturation(uploadsLast30d);
  const winnability = computeWinnability(topPerformersWithSubs);
  const opportunity = computeOpportunity(demand.score, winnability.score, saturation.score);
  const status = computeStatus(opportunity);

  const { data: prior } = await supabase
    .from("lane_analyses")
    .select("demand")
    .eq("lane_id", lane.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const momentum = computeMomentum(demand.score, (prior?.demand as number | undefined) ?? null);

  // Patterns — small-channel winners only, capped per channel so one prolific
  // channel can't dominate the pattern signal. topPerformersWithSubs is already
  // sorted by viewCount desc, so this keeps each channel's highest-viewed videos.
  const smallChannelCandidates = topPerformersWithSubs.filter(
    (v) => v.subscriberCount < SCORE_CALIBRATION.smallChannelSubThreshold
  );
  const perChannelCount = new Map<string, number>();
  const winnerVideosRaw = smallChannelCandidates.filter((v) => {
    const count = perChannelCount.get(v.channelId) ?? 0;
    if (count >= SCORE_CALIBRATION.maxWinnerVideosPerChannel) return false;
    perChannelCount.set(v.channelId, count + 1);
    return true;
  });
  const patterns = analyzePatterns(winnerVideosRaw, lane.display_name);

  const winnerVideos = winnerVideosRaw.map(toGalleryVideo);
  const topVideos = topPerformersWithSubs.map(toGalleryVideo);

  const rawMetrics = {
    query,
    uploadsLast30d,
    demandMedianViewsPerDay: demand.medianViewsPerDay,
    topPerformerCount: topPerformersWithSubs.length,
    smallChannelCount: winnability.smallChannelCount,
    topPerformers: topPerformersWithSubs.map((v) => ({
      videoId: v.videoId,
      channelId: v.channelId,
      subscriberCount: v.subscriberCount,
      viewCount: v.viewCount,
      publishedAt: v.publishedAt,
    })),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("lane_analyses")
    .insert({
      lane_id: lane.id,
      demand: Math.round(demand.score),
      saturation: Math.round(saturation.score),
      winnability: Math.round(winnability.score),
      opportunity: Math.round(opportunity),
      momentum,
      raw_metrics: rawMetrics,
      patterns,
      winner_videos: winnerVideos,
      top_videos: topVideos,
    })
    .select("*")
    .single();
  if (insertErr) throw new Error(`analyzeLane insert failed: ${insertErr.message}`);

  await supabase.from("lanes").update({ last_analyzed_at: new Date().toISOString() }).eq("id", lane.id);

  return {
    laneId: lane.id,
    laneSlug: lane.slug,
    query,
    demand,
    saturation,
    winnability,
    momentum,
    opportunity,
    status,
    patterns,
    winnerVideos,
    topVideos,
    analysisRow: inserted as LaneAnalysis,
  };
}
