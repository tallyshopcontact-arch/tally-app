// Lane Check pivot — the fresh lane analysis pipeline. Orchestrates the 4
// YouTube calls, deterministic scoring, and pattern analysis.
//
// Two entry points share one core (runCorePipeline):
//   - analyzeLane — the normal rolling-window (last 30/60 days) analysis,
//     PERSISTED as a new lane_analyses row (never overwritten — self-
//     building history) with lanes.last_analyzed_at bumped. Every caller
//     except the scores batch scorer uses this.
//   - analyzeLaneForMonth — a specific-calendar-month analysis for
//     /admin/scores (see app/api/admin/scores/batch/route.ts). Deliberately
//     NEVER persisted: a historical month's data becoming "the latest
//     lane_analyses row" would corrupt what every other caller (report
//     builder, expansion picks) reads as this lane's current state. This is
//     always a live, request-time read — there is no meaningful "cache" for
//     one specific past month in a single-row-per-lane cache.
//
// Job-queue-agnostic on purpose: callers (calibration script now, the cron
// job processor in build-order step 3) decide when to invoke analyzeLane and
// what to do with lane_jobs status.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis } from "./types.ts";
import { searchVideos, getVideoDetails, getChannelSubCounts, type VideoDetails } from "./youtube.ts";
import {
  computeDemand, computeSaturation, computeWinnability, computeOpportunity,
  computeStatus, computeMomentum, viewsPerDay, SCORE_CALIBRATION, type DemandResult, type SaturationResult,
  type WinnabilityResult, type LaneStatus,
} from "./scoring.ts";
import { analyzePatterns, type PatternStats } from "./patterns.ts";
import { monthBounds } from "./dateRange.ts";

export interface GalleryVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  publishedAt: string;
  /** Raw YouTube Studio tags — source data for the gallery-based title/tag
   * generator in lib/lanes/titles.ts. */
  tags: string[];
  /** Channel creation date, for insights.ts's winner_channel_age — null when
   * unavailable (see getChannelSubCounts). */
  channelPublishedAt: string | null;
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

function toGalleryVideo(v: VideoDetails & { subscriberCount: number; channelPublishedAt: string | null }): GalleryVideo {
  return {
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    channelId: v.channelId,
    channelTitle: v.channelTitle,
    subscriberCount: v.subscriberCount,
    viewCount: v.viewCount,
    publishedAt: v.publishedAt,
    tags: v.tags,
    channelPublishedAt: v.channelPublishedAt,
  };
}

interface SearchWindow {
  items: { videoId: string; channelId: string; publishedAt: string }[];
  totalResults: number;
}

interface PipelineCore {
  demand: DemandResult;
  saturation: SaturationResult;
  winnability: WinnabilityResult;
  opportunity: number;
  status: LaneStatus;
  patterns: PatternStats;
  winnerVideos: GalleryVideo[];
  topVideos: GalleryVideo[];
  rawMetrics: Record<string, unknown>;
}

/** The scoring/pattern half of a lane analysis, shared by analyzeLane and
 * analyzeLaneForMonth — everything after "we have a recency scan and a
 * top-performer scan" is identical regardless of which window produced
 * them. Returns null when the union of both scans has zero videos (nothing
 * to score) or zero survive the top-performer re-rank — the "no data"
 * case both callers need to handle (differently: analyzeLane's caller has
 * never seen this happen since its rolling window is always "now," but
 * analyzeLaneForMonth's callers hit it routinely for quiet/older months). */
async function runCorePipeline(
  supabase: SupabaseClient,
  lane: Lane,
  query: string,
  recent: SearchWindow,
  topByViews: SearchWindow,
  uploadsCount: number,
  extraRawMetrics: Record<string, unknown>
): Promise<PipelineCore | null> {
  const allIds = [...new Set([...recent.items.map((v) => v.videoId), ...topByViews.items.map((v) => v.videoId)])];
  if (!allIds.length) return null;

  const details = await getVideoDetails(allIds);
  const detailsById = new Map(details.map((d) => [d.videoId, d]));

  // Ranked by views-per-day, not lifetime viewCount — a video winning right
  // now should outrank an older video that's merely accumulated more total
  // views. YouTube's own order=viewCount search just supplies the candidate
  // pool; this re-rank is what "top performer" actually means here.
  const topPerformerDetails = topByViews.items
    .map((v) => detailsById.get(v.videoId))
    .filter((v): v is VideoDetails => !!v)
    .sort((a, b) => viewsPerDay(b) - viewsPerDay(a));
  if (!topPerformerDetails.length) return null;

  const channelInfo = await getChannelSubCounts(
    supabase,
    topPerformerDetails.map((v) => v.channelId)
  );
  const topPerformersWithSubs = topPerformerDetails.map((v) => ({
    ...v,
    subscriberCount: channelInfo.get(v.channelId)?.subscriberCount ?? 0,
    channelPublishedAt: channelInfo.get(v.channelId)?.channelPublishedAt ?? null,
  }));

  const demand = computeDemand(topPerformersWithSubs);
  const saturation = computeSaturation(uploadsCount);
  const winnability = computeWinnability(topPerformersWithSubs);
  const opportunity = computeOpportunity(demand.score, winnability.score, saturation.score);
  const status = computeStatus(opportunity);

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
    uploadsLast30d: uploadsCount,
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
    ...extraRawMetrics,
  };

  return { demand, saturation, winnability, opportunity, status, patterns, winnerVideos, topVideos, rawMetrics };
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

  const { data: prior } = await supabase
    .from("lane_analyses")
    .select("demand")
    .eq("lane_id", lane.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The normal rolling-window scan always has SOME result for an active
  // lane (it's querying "the last 60 days," not a fixed historical slice),
  // so a null core here would be a genuinely dead/nonexistent niche — treat
  // that as an insert of an all-zero(ish) row rather than a special case,
  // same as this function's pre-refactor behavior (which never early-
  // returned on an empty topPerformerDetails, just let computeDemand([])
  // etc. naturally produce zeroes). saturation/opportunity/status are
  // still derived from the real uploadsLast30d rather than hardcoded, since
  // the recency scan can find upload volume even when the top-performer
  // scan comes back empty.
  const emptySaturation = computeSaturation(uploadsLast30d);
  const emptyOpportunity = computeOpportunity(0, 0, emptySaturation.score);
  const core = (await runCorePipeline(supabase, lane, query, recent, topByViews, uploadsLast30d, {})) ?? {
    demand: { score: 0, medianViewsPerDay: 0, sampleSize: 0 },
    saturation: emptySaturation,
    winnability: { score: 0, smallChannelCount: 0, sampleSize: 0 },
    opportunity: emptyOpportunity,
    status: computeStatus(emptyOpportunity),
    patterns: analyzePatterns([], lane.display_name),
    winnerVideos: [],
    topVideos: [],
    rawMetrics: { query, uploadsLast30d, demandMedianViewsPerDay: 0, topPerformerCount: 0, smallChannelCount: 0, topPerformers: [] },
  };

  const momentum = computeMomentum(core.demand.score, (prior?.demand as number | undefined) ?? null);

  const { data: inserted, error: insertErr } = await supabase
    .from("lane_analyses")
    .insert({
      lane_id: lane.id,
      demand: Math.round(core.demand.score),
      saturation: Math.round(core.saturation.score),
      winnability: Math.round(core.winnability.score),
      opportunity: Math.round(core.opportunity),
      momentum,
      raw_metrics: core.rawMetrics,
      patterns: core.patterns,
      winner_videos: core.winnerVideos,
      top_videos: core.topVideos,
    })
    .select("*")
    .single();
  if (insertErr) throw new Error(`analyzeLane insert failed: ${insertErr.message}`);

  await supabase.from("lanes").update({ last_analyzed_at: new Date().toISOString() }).eq("id", lane.id);

  return {
    laneId: lane.id,
    laneSlug: lane.slug,
    query,
    demand: core.demand,
    saturation: core.saturation,
    winnability: core.winnability,
    momentum,
    opportunity: core.opportunity,
    status: core.status,
    patterns: core.patterns,
    winnerVideos: core.winnerVideos,
    topVideos: core.topVideos,
    analysisRow: inserted as LaneAnalysis,
  };
}

/** Live, request-time-only analysis strictly bounded to one calendar month —
 * /admin/scores's batch scorer (see nicheCache.ts's getNicheData month/year
 * branch). Both search scans are bounded by the month's own [start, end]
 * ISO instants (not a relative "last N days" window), so
 * pageInfo.totalResults is a real monthly upload count, not "everything
 * since some day through today" — and the resulting topVideos are strictly
 * re-filtered to the window as a belt-and-suspenders check on top of that.
 *
 * Returns null when zero videos published in the window matched this
 * lane's query at all — the caller (nicheCache.ts) turns that into a
 * `noData` result rather than a scorable (all-zero, misleadingly "locked by
 * incumbents") analysis. NEVER inserts into lane_analyses or touches
 * lanes.last_analyzed_at — see this file's header comment for why. */
export async function analyzeLaneForMonth(
  supabase: SupabaseClient,
  lane: Lane,
  month: number,
  year: number
): Promise<LaneAnalysisResult | null> {
  const { start, end } = monthBounds(month, year);
  const query = lane.genre_hint
    ? `${lane.display_name} type beat ${lane.genre_hint}`
    : `${lane.display_name} type beat`;

  const [recent, topByViews] = await Promise.all([
    searchVideos(query, { order: "date", publishedAfter: start.toISOString(), publishedBefore: end.toISOString(), maxResults: 50 }),
    // maxResults 50, not analyzeLane's 25 — a month-bounded query has a
    // smaller natural pool than a 60-day rolling one, so a wider candidate
    // pool before the views-per-day re-rank costs nothing extra (search.list
    // bills per call, not per maxResults) and improves the odds of finding
    // this month's real top performer.
    searchVideos(query, { order: "viewCount", publishedAfter: start.toISOString(), publishedBefore: end.toISOString(), maxResults: 50 }),
  ]);
  const uploadsInMonth = recent.totalResults;

  const core = await runCorePipeline(supabase, lane, query, recent, topByViews, uploadsInMonth, {
    monthScoped: { month, year },
  });
  if (!core) return null;

  // Belt-and-suspenders — the search itself is already bounded to
  // [start, end] via publishedAfter/publishedBefore, but the brief asks for
  // an explicit strict re-check before anything is computed from this data,
  // and it guards against any edge-case YouTube result landing just outside
  // the requested window.
  const inWindow = (publishedAt: string) => {
    const t = new Date(publishedAt).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };
  const topVideos = core.topVideos.filter((v) => inWindow(v.publishedAt));
  const winnerVideos = core.winnerVideos.filter((v) => inWindow(v.publishedAt));
  if (!topVideos.length) return null;

  // Ephemeral row shape — matches LaneAnalysis's interface for downstream
  // compatibility (buildScoreResult etc. read analysis.top_videos/.patterns/
  // .saturation/.demand the same way regardless of source), but this is
  // never inserted — id/lane_id are synthetic, not real primary keys.
  const analysisRow: LaneAnalysis = {
    id: `live:${lane.id}:${year}-${String(month).padStart(2, "0")}`,
    lane_id: lane.id,
    demand: Math.round(core.demand.score),
    saturation: Math.round(core.saturation.score),
    winnability: Math.round(core.winnability.score),
    opportunity: Math.round(core.opportunity),
    // No momentum — that's a persisted-history comparison (this row vs. the
    // last STORED one), which doesn't apply to an unpersisted one-off read.
    momentum: null,
    raw_metrics: core.rawMetrics,
    patterns: core.patterns as unknown as Record<string, unknown>,
    winner_videos: winnerVideos,
    top_videos: topVideos,
    created_at: new Date().toISOString(),
  };

  return {
    laneId: lane.id,
    laneSlug: lane.slug,
    query,
    demand: core.demand,
    saturation: core.saturation,
    winnability: core.winnability,
    momentum: null,
    opportunity: core.opportunity,
    status: core.status,
    patterns: core.patterns,
    winnerVideos,
    topVideos,
    analysisRow,
  };
}
