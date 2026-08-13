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
// threshold.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis } from "@/lib/lanes/types";
import { getOrCreateLane, getLatestAnalysis, reserveQuota, ESTIMATED_UNITS_PER_ANALYSIS } from "@/lib/lanes/db";
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
}

export interface GetNicheDataOptions {
  maxAgeHours?: number;
  /** Demand dead-current data for this specific niche regardless of the
   * cached row's age — still degrades to the stale cached row if quota's
   * exhausted, same as a normal expiry would. Ignored (always effectively
   * true) when month/year are set — see below. */
  forceRefresh?: boolean;
  /** Scopes the analysis to one calendar month (1-12) + year — used by
   * /admin/scores's batch scorer, which is explicitly for fresh, dated
   * research, never a general "current state" read. Both must be set
   * together to take effect. When set, this bypasses the freshness cache
   * entirely (there's no meaningful "cached row" for one specific past
   * month in a cache that stores one row per lane) and always performs a
   * live, UNPERSISTED analysis bounded to that month via
   * lib/lanes/pipeline.ts's analyzeLaneForMonth — nothing is written to
   * lane_analyses or lanes.last_analyzed_at, so a month-scoped research run
   * can never overwrite the shared cache every other caller (report
   * builder, expansion picks) reads from. */
  month?: number;
  year?: number;
}

function ageHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
}

/** Synthesized, never-persisted "empty" analysis row for a month-scoped
 * request that genuinely found zero videos — callers key off `noData` and
 * should treat this as unscoreable, not as a real (if quiet) niche. */
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
  const { lane } = await getOrCreateLane(supabase, artist, genre);

  if (opts.month && opts.year) {
    // Month-scoped requests always spend a real reservation — the YouTube
    // calls have to actually run to find out whether there's data for that
    // window at all, same as any other cache miss.
    const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_ANALYSIS);
    if (!allowed) return null; // quota exhausted — genuinely nothing to return
    try {
      const result = await analyzeLaneForMonth(supabase, lane, opts.month, opts.year);
      if (!result) {
        return { lane, analysis: emptyMonthAnalysis(lane, opts.month, opts.year), stale: false, noData: true };
      }
      return { lane, analysis: result.analysisRow, stale: false };
    } catch (err) {
      console.error(`[nicheCache] analyzeLaneForMonth failed for "${artist}" (${opts.month}/${opts.year}):`, err);
      return null; // no persisted fallback makes sense for a specific month
    }
  }

  const maxAgeHours = opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const cached = await getLatestAnalysis(supabase, lane.id);
  const isFresh = cached ? ageHours(cached.created_at) < maxAgeHours : false;

  if (cached && isFresh && !opts.forceRefresh) {
    return { lane, analysis: cached, stale: false };
  }

  // Needs a refresh (missing, stale, or forced) — spend quota for a real
  // analyzeLane pass, same reserve-then-check budget guard every other
  // inline YouTube spend in this codebase uses.
  const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_ANALYSIS);
  if (!allowed) {
    if (cached) return { lane, analysis: cached, stale: true };
    return null; // never analyzed AND quota's gone — genuinely nothing to return
  }

  try {
    const result = await analyzeLane(supabase, lane);
    return { lane, analysis: result.analysisRow, stale: false };
  } catch (err) {
    console.error(`[nicheCache] analyzeLane failed for "${artist}", falling back to cache:`, err);
    if (cached) return { lane, analysis: cached, stale: true };
    return null;
  }
}
