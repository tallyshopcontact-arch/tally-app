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
import { analyzeLane } from "@/lib/lanes/pipeline";

const DEFAULT_MAX_AGE_HOURS = 168; // 7 days

export interface NicheDataResult {
  lane: Lane;
  analysis: LaneAnalysis;
  /** True when the cached row is older than maxAgeHours (or a forceRefresh
   * was requested) but a re-analysis couldn't run because quota's exhausted
   * for the day — the caller got the best available data, just not fresh. */
  stale: boolean;
}

export interface GetNicheDataOptions {
  maxAgeHours?: number;
  /** Demand dead-current data for this specific niche regardless of the
   * cached row's age — still degrades to the stale cached row if quota's
   * exhausted, same as a normal expiry would. */
  forceRefresh?: boolean;
}

function ageHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
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
