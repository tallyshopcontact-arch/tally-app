// Lane Check pivot — shared lane/job data-access helpers.
// Takes a SupabaseClient as a parameter rather than constructing its own, so this
// module works identically from Next.js API routes (lib/supabase.ts client) and
// from plain `node scripts/*.ts` (no "@/..." aliases — see lib/lanes/types.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis, LaneJob } from "./types";

const LANE_FRESHNESS_DAYS = 14;

/** "MF DOOM" -> "mf-doom" */
export function normalizeLaneSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getOrCreateLane(
  supabase: SupabaseClient,
  displayName: string,
  genreHint?: string | null
): Promise<{ lane: Lane; created: boolean }> {
  const slug = normalizeLaneSlug(displayName);
  if (!slug) throw new Error(`Cannot derive a lane slug from "${displayName}"`);

  const { data: existing, error: findErr } = await supabase
    .from("lanes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (findErr) throw new Error(`getOrCreateLane lookup failed: ${findErr.message}`);
  if (existing) {
    const existingLane = existing as Lane;
    // A caller-supplied hint always wins over a previously-unset one, so a lane
    // seeded without disambiguation (e.g. step 1's placeholder seed) picks it up
    // the first time a caller actually specifies it.
    if (genreHint && existingLane.genre_hint !== genreHint) {
      const { data: updated, error: updateErr } = await supabase
        .from("lanes")
        .update({ genre_hint: genreHint })
        .eq("id", existingLane.id)
        .select("*")
        .single();
      if (updateErr) throw new Error(`getOrCreateLane genre_hint update failed: ${updateErr.message}`);
      return { lane: updated as Lane, created: false };
    }
    return { lane: existingLane, created: false };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("lanes")
    .insert({ slug, display_name: displayName.trim(), genre_hint: genreHint ?? null })
    .select("*")
    .single();
  if (insertErr) throw new Error(`getOrCreateLane insert failed: ${insertErr.message}`);
  return { lane: inserted as Lane, created: true };
}

/** 14-day cache freshness check against lanes.last_analyzed_at. */
export function isLaneFresh(lastAnalyzedAt: string | null): boolean {
  if (!lastAnalyzedAt) return false;
  const ageMs = Date.now() - new Date(lastAnalyzedAt).getTime();
  return ageMs < LANE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

/** Most recent lane_analyses row for a lane, or null if never analyzed. */
export async function getLatestAnalysis(
  supabase: SupabaseClient,
  laneId: string
): Promise<LaneAnalysis | null> {
  const { data, error } = await supabase
    .from("lane_analyses")
    .select("*")
    .eq("lane_id", laneId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestAnalysis query failed: ${error.message}`);
  return (data as LaneAnalysis) ?? null;
}

/** Second-most-recent lane_analyses row for a lane (the "prior period" the
 * latest one should be compared against), or null if there isn't one yet.
 * Used by insights.ts's lane_trend_direction — same table getLatestAnalysis
 * reads, just offset by one row instead of always taking the newest. */
export async function getPriorAnalysis(
  supabase: SupabaseClient,
  laneId: string
): Promise<LaneAnalysis | null> {
  const { data, error } = await supabase
    .from("lane_analyses")
    .select("*")
    .eq("lane_id", laneId)
    .order("created_at", { ascending: false })
    .range(1, 1);
  if (error) throw new Error(`getPriorAnalysis query failed: ${error.message}`);
  return ((data as LaneAnalysis[] | null) ?? [])[0] ?? null;
}

export async function hasPendingJob(supabase: SupabaseClient, laneId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("lane_jobs")
    .select("id")
    .eq("lane_id", laneId)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`hasPendingJob query failed: ${error.message}`);
  return !!data;
}

export async function enqueueLaneJob(
  supabase: SupabaseClient,
  laneId: string,
  opts: { priority?: number; requestedBy?: string | null; notifyEmail?: string | null } = {}
): Promise<LaneJob> {
  const { data, error } = await supabase
    .from("lane_jobs")
    .insert({
      lane_id: laneId,
      priority: opts.priority ?? 0,
      requested_by: opts.requestedBy ?? null,
      notify_email: opts.notifyEmail ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`enqueueLaneJob insert failed: ${error.message}`);
  return data as LaneJob;
}

// ── YouTube quota budget (Upload Kit reframe) ───────────────────────────────
// Bounds INLINE (request-time) analysis spend only — see
// supabase/upload-kit-migration.sql for why the cron drain doesn't share this.

const DEFAULT_DAILY_UNIT_BUDGET = 8000;
/** Conservative estimate: 2x search.list (100 each) + videos.list + channels.list. */
export const ESTIMATED_UNITS_PER_ANALYSIS = 205;

export function getDailyQuotaBudget(): number {
  const raw = process.env.YOUTUBE_DAILY_UNIT_BUDGET;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_UNIT_BUDGET;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Atomically adds `units` (negative to roll back) to today's usage row,
 * returning the new total. */
async function adjustQuotaUsage(supabase: SupabaseClient, units: number): Promise<number> {
  const { data, error } = await supabase.rpc("increment_quota_usage", {
    p_day: todayIso(),
    p_units: units,
  });
  if (error) throw new Error(`adjustQuotaUsage failed: ${error.message}`);
  return data as number;
}

/** Reserve-then-check: atomically adds the estimate, and if that pushes the
 * day's total over budget, immediately rolls the reservation back. Returns
 * whether the reservation held (i.e. whether the caller may proceed). */
export async function reserveQuota(
  supabase: SupabaseClient,
  units: number = ESTIMATED_UNITS_PER_ANALYSIS
): Promise<boolean> {
  const budget = getDailyQuotaBudget();
  const newTotal = await adjustQuotaUsage(supabase, units);
  if (newTotal > budget) {
    await adjustQuotaUsage(supabase, -units);
    return false;
  }
  return true;
}
