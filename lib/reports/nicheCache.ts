// The shared niche-data cache the report builder reads from — scores,
// co-mentions, winners, saturation — so a report's real YouTube cost is just
// the target channel's own uploads (channelAnalyzer.ts's playlistItems/
// videos calls, ~15 units), not a live analysis per niche the channel
// touches. Read-through cache over lane_analyses: fresh enough → return the
// cached row; stale (or forceRefresh) → re-analyze via the existing
// lib/lanes/pipeline.ts (the same search.list-based pipeline lane-check
// already uses), overwrite, return fresh. A re-analysis that can't get
// quota falls back to the stale cached row (flagged) rather than failing
// the whole report — partial/aged data beats no report at all.
//
// Deliberately hours-based (default 168h / 7 days), not
// lib/lanes/db.ts's isLaneFresh (14 days) — that's a different product's
// cache policy (lane-check's own re-analysis cadence); the report builder
// wants its own, tighter freshness bar without touching that unrelated
// threshold. The same 168h window is reused for the month-scoped branch
// below (lane_month_analyses) for consistency.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis, LaneMonthAnalysis } from "@/lib/lanes/types";
import {
  getOrCreateLane, getLatestAnalysis, reserveQuota, ESTIMATED_UNITS_PER_ANALYSIS,
  getMonthAnalysis, upsertMonthAnalysis,
} from "@/lib/lanes/db";
import { analyzeLane, analyzeLaneForMonth } from "@/lib/lanes/pipeline";

const DEFAULT_MAX_AGE_HOURS = 168; // 7 days

export interface NicheDataResult {
  lane: Lane;
  analysis: LaneAnalysis;
  /** True when the cached row is older than maxAgeHours (or a forceRefresh
   * was requested) but a re-analysis couldn't run because quota's exhausted
   * for the day — the caller got the best available data, just not fresh. */
  stale: boolean;
  /** Set only on a month/year-scoped request that genuinely found zero
   * videos published in that window — `analysis` is an all-zero placeholder
   * in that case, never to be scored or displayed as real data. */
  noData?: boolean;
  /** True when this result came from a cached row within the freshness
   * window and cost zero YouTube quota — false whenever a real analysis
   * ran (fresh, forced, or the cache was empty/stale). Callers that need to
   * report quota spend (the /admin/scores batch scorer) key off this rather
   * than re-deriving it. */
  fromCache: boolean;
}

export interface GetNicheDataOptions {
  maxAgeHours?: number;
  /** Bypasses the freshness cache and always performs a real re-analysis. */
  forceRefresh?: boolean;
  /** Scopes the analysis to one calendar month (1-12) + year — used by
   * /admin/scores's batch scorer, which does dated, historical research
   * rather than a general "current state" read. Both must be set together
   * to take effect. When set, reads/writes a dedicated cache
   * (lane_month_analyses, via lib/lanes/db.ts's getMonthAnalysis/
   * upsertMonthAnalysis) instead of lane_analyses — a month-scoped result,
   * fresh or newly analyzed, is NEVER written to lane_analyses or
   * lanes.last_analyzed_at, so a historical month's snapshot can never
   * become "the latest state" every other caller (report builder,
   * expansion picks) reads. Respects maxAgeHours/forceRefresh exactly like
   * the normal path: unchecked "Force Fresh Data" on the scores page means
   * a month analyzed within the last 7 days is served from this cache at
   * zero quota cost. */
  month?: number;
  year?: number;
}

function ageHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
}

/** Synthesized "empty" analysis row for a month-scoped request confirmed to
 * have zero videos — callers key off `noData` and should treat this as
 * unscoreable, not as a real (if quiet) niche. */
function emptyMonthAnalysis(lane: Lane, month: number, year: number): LaneAnalysis {
  return {
    id: `empty:${lane.id}:${year}-${String(month).padStart(2, "0")}`,
    lane_id: lane.id,
    demand: 0,
    saturation: 0,
    winnability: 0,
    opportunity: 0,
    momentum: null,
    raw_metrics: { monthScoped: { month, year }, topPerformerCount: 0 },
    patterns: {},
    winner_videos: [],
    top_videos: [],
    created_at: new Date().toISOString(),
  };
}

function monthAnalysisToLaneAnalysis(row: LaneMonthAnalysis): LaneAnalysis {
  return {
    id: row.id,
    lane_id: row.lane_id,
    demand: row.demand,
    saturation: row.saturation,
    winnability: row.winnability,
    opportunity: row.opportunity,
    momentum: null, // a month snapshot has no "prior row" comparison, same as a live one
    raw_metrics: row.raw_metrics,
    patterns: row.patterns,
    winner_videos: row.winner_videos,
    top_videos: row.top_videos,
    created_at: row.created_at,
  };
}

/** Month-scoped branch of getNicheData — see GetNicheDataOptions.month's
 * doc comment for the cache/persistence contract. */
async function getMonthScopedNicheData(
  supabase: SupabaseClient,
  artist: string,
  lane: Lane,
  month: number,
  year: number,
  maxAgeHours: number,
  forceRefresh: boolean
): Promise<NicheDataResult | null> {
  const cachedMonth = await getMonthAnalysis(supabase, lane.id, month, year);
  const isFresh = cachedMonth ? ageHours(cachedMonth.created_at) < maxAgeHours : false;

  if (cachedMonth && isFresh && !forceRefresh) {
    if (cachedMonth.no_data) {
      return { lane, analysis: emptyMonthAnalysis(lane, month, year), stale: false, noData: true, fromCache: true };
    }
    return { lane, analysis: monthAnalysisToLaneAnalysis(cachedMonth), stale: false, fromCache: true };
  }

  // Needs a refresh (missing, stale, or forced) — the YouTube calls have to
  // actually run, same reserve-then-check budget guard every other inline
  // YouTube spend in this codebase uses.
  const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_ANALYSIS);
  if (!allowed) {
    if (cachedMonth) {
      if (cachedMonth.no_data) {
        return { lane, analysis: emptyMonthAnalysis(lane, month, year), stale: true, noData: true, fromCache: false };
      }
      return { lane, analysis: monthAnalysisToLaneAnalysis(cachedMonth), stale: true, fromCache: false };
    }
    return null; // never analyzed AND quota's gone — genuinely nothing to return
  }

  try {
    const result = await analyzeLaneForMonth(supabase, lane, month, year);
    if (!result) {
      await upsertMonthAnalysis(supabase, {
        lane_id: lane.id, month, year, no_data: true,
        demand: 0, saturation: 0, winnability: 0, opportunity: 0,
        raw_metrics: { monthScoped: { month, year }, topPerformerCount: 0 },
        patterns: {}, winner_videos: [], top_videos: [],
      });
      return { lane, analysis: emptyMonthAnalysis(lane, month, year), stale: false, noData: true, fromCache: false };
    }
    const saved = await upsertMonthAnalysis(supabase, {
      lane_id: lane.id,
      month,
      year,
      no_data: false,
      demand: result.analysisRow.demand,
      saturation: result.analysisRow.saturation,
      winnability: result.analysisRow.winnability,
      opportunity: result.analysisRow.opportunity,
      raw_metrics: result.analysisRow.raw_metrics,
      patterns: result.analysisRow.patterns,
      winner_videos: result.analysisRow.winner_videos,
      top_videos: result.analysisRow.top_videos,
    });
    return { lane, analysis: monthAnalysisToLaneAnalysis(saved), stale: false, fromCache: false };
  } catch (err) {
    console.error(`[nicheCache] analyzeLaneForMonth failed for "${artist}" (${month}/${year}):`, err);
    if (cachedMonth) {
      if (cachedMonth.no_data) {
        return { lane, analysis: emptyMonthAnalysis(lane, month, year), stale: true, noData: true, fromCache: false };
      }
      return { lane, analysis: monthAnalysisToLaneAnalysis(cachedMonth), stale: true, fromCache: false };
    }
    return null;
  }
}

/** Read-through cache for one niche's analysis, keyed by artist name (+
 * optional genre for disambiguation on first creation) rather than a laneId
 * the caller might not have yet — mirrors getOrCreateLane's own contract,
 * and is what lets a niche the channel operates in but TALLY has never seen
 * before get created and analyzed live on first report, then be cached for
 * every report after. Returns null only when there's truly nothing to
 * return: no cached row AND a fresh analysis couldn't run (quota exhausted
 * or the pipeline itself failed). */
export async function getNicheData(
  supabase: SupabaseClient,
  artist: string,
  genre: string | null,
  opts: GetNicheDataOptions = {}
): Promise<NicheDataResult | null> {
  const maxAgeHours = opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const { lane } = await getOrCreateLane(supabase, artist, genre);

  if (opts.month && opts.year) {
    return getMonthScopedNicheData(supabase, artist, lane, opts.month, opts.year, maxAgeHours, !!opts.forceRefresh);
  }

  const cached = await getLatestAnalysis(supabase, lane.id);
  const isFresh = cached ? ageHours(cached.created_at) < maxAgeHours : false;

  if (cached && isFresh && !opts.forceRefresh) {
    return { lane, analysis: cached, stale: false, fromCache: true };
  }

  // Needs a refresh (missing, stale, or forced) — spend quota for a real
  // analyzeLane pass, same reserve-then-check budget guard every other
  // inline YouTube spend in this codebase uses.
  const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_ANALYSIS);
  if (!allowed) {
    if (cached) return { lane, analysis: cached, stale: true, fromCache: false };
    return null; // never analyzed AND quota's gone — genuinely nothing to return
  }

  try {
    const result = await analyzeLane(supabase, lane);
    return { lane, analysis: result.analysisRow, stale: false, fromCache: false };
  } catch (err) {
    console.error(`[nicheCache] analyzeLane failed for "${artist}", falling back to cache:`, err);
    if (cached) return { lane, analysis: cached, stale: true, fromCache: false };
    return null;
  }
}
