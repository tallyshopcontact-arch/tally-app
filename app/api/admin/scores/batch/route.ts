// Admin batch artist scorer — /admin/scores. Replaces /admin/insights for
// brief production: instead of hand-picking one lane at a time, paste up to
// 50 artist names and get every one ranked by a SubK Score (see below), all
// through the exact same shared niche cache (lib/reports/nicheCache.ts) every
// other report/insight tool reads from. Already-cached lanes cost zero
// YouTube quota; a brand-new lane costs a real analyzeLane pass.
//
// New-artist budget mirrors lib/reports/channelAnalyzer.ts's
// scoreManualArtists exactly (same "only a lane with no existing row counts
// against the cap" rule, same reason: bounding one request's worst-case
// YouTube spend) rather than importing it, since that cap
// (MAX_NEW_ARTIST_ANALYSES_PER_REPORT) isn't exported — it's a report-
// specific constant, and this route's cap is conceptually the same number
// for the same reason, not a shared dependency.
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaneAnalysis } from "@/lib/lanes/types";
import { normalizeLaneSlug } from "@/lib/lanes/db";
import { viewsPerDay, SCORE_CALIBRATION } from "@/lib/lanes/scoring";
import { getNicheData } from "@/lib/reports/nicheCache";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// ── Request bounds ───────────────────────────────────────────────────────

const MAX_ARTISTS_PER_BATCH = 50;
// Same value and same justification as channelAnalyzer.ts's
// MAX_NEW_ARTIST_ANALYSES_PER_REPORT: each brand-new lane costs a real
// ~200-unit analyzeLane pass that a single request can't spend unbounded on.
const MAX_NEW_ARTISTS_PER_BATCH = 3;
const CONCURRENCY_LIMIT = 5;

// Deliberately tighter than lib/lanes/scoring.ts's
// SCORE_CALIBRATION.smallChannelSubThreshold (3,000) — the SubK Score's
// whole premise is producers under 1,000 subscribers specifically, a
// narrower and more literal tier than the general "small channel"
// winnability threshold the rest of the app uses.
const SUBK_CHANNEL_THRESHOLD = 1_000;

// ── Types ─────────────────────────────────────────────────────────────────

interface TopVideoRow {
  subscriberCount?: number;
  viewCount?: number;
  publishedAt?: string;
}

export interface ArtistScoreResult {
  artistName: string;
  subKScore: number;
  smallChannelWinRate: number; // 0-100, 40% weight
  saturation: number; // raw 0-100 (higher = more uploads = more competition)
  demand: number; // raw 0-100, 20% weight
  velocityCeiling: number; // 0-100 normalized, 15% weight
  medianViewsPerDay: number; // raw median views/day feeding velocityCeiling
  uploadsLast30d: number; // raw upload count feeding the saturation label
  topCoMention: string | null;
  verdict: string;
  /** True when this artist already had a lane on file before this request —
   * i.e. this result cost zero new-artist quota. */
  cached: boolean;
  /** The credibility paragraph for the expanded row. */
  summary: string;
}

interface BatchResponse {
  results: ArtistScoreResult[];
  /** Names that had no existing lane AND arrived after the request's
   * MAX_NEW_ARTISTS_PER_BATCH new-lane budget was already spent — never
   * attempted this request; re-submit them on their own. */
  pending: string[];
  /** Names that couldn't be scored because daily YouTube quota ran out
   * mid-batch (and had no cached data to fall back to) — try again tomorrow. */
  quotaExceeded: string[];
}

// ── Scoring ───────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Same log10 curve as lib/lanes/scoring.ts's computeDemand — raw views/day
 * for a niche's winners clusters low, so a linear 0-100 scale pegs nearly
 * everything near 0. Reuses SCORE_CALIBRATION.demandLogBase so "100" means
 * the same thing here as it does for the Demand score. */
function normalizeVelocity(medianVpd: number): number {
  return clamp(Math.round((Math.log10(medianVpd + 1) / Math.log10(SCORE_CALIBRATION.demandLogBase)) * 100));
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function verdictFor(subKScore: number): string {
  if (subKScore >= 70) return "Strong window for sub-1K producers";
  if (subKScore >= 50) return "Moderate — competitive but winnable";
  if (subKScore >= 30) return "Tough — large channels dominating";
  return "Avoid — locked by incumbents";
}

function competitionLabel(saturation: number): "Low" | "Moderate" | "High" {
  if (saturation < 34) return "Low";
  if (saturation < 67) return "Moderate";
  return "High";
}

function demandLabel(demand: number): "Low" | "Moderate" | "High" {
  if (demand < 34) return "Low";
  if (demand < 67) return "Moderate";
  return "High";
}

function buildScoreResult(artistName: string, analysis: LaneAnalysis, cached: boolean): ArtistScoreResult {
  const topVideos = (analysis.top_videos ?? []) as TopVideoRow[];
  const smallChannelVideos = topVideos.filter(
    (v) => typeof v.subscriberCount === "number" && v.subscriberCount < SUBK_CHANNEL_THRESHOLD
  );
  const smallChannelWinRate = topVideos.length
    ? Math.round((smallChannelVideos.length / topVideos.length) * 100)
    : 0;

  const smallChannelVpd = smallChannelVideos
    .filter((v) => typeof v.viewCount === "number" && typeof v.publishedAt === "string")
    .map((v) => viewsPerDay({ viewCount: v.viewCount as number, publishedAt: v.publishedAt as string }));
  const medianViewsPerDay = Math.round(median(smallChannelVpd));
  const velocityCeiling = normalizeVelocity(medianViewsPerDay);

  const saturation = analysis.saturation;
  const demand = analysis.demand;
  const saturationScore = 100 - saturation;

  const subKScore = Math.round(
    smallChannelWinRate * 0.4 + saturationScore * 0.25 + demand * 0.2 + velocityCeiling * 0.15
  );

  const patterns = (analysis.patterns ?? {}) as { topCoMentions?: { artist: string }[] };
  const topCoMention = patterns.topCoMentions?.[0]?.artist ? titleCase(patterns.topCoMentions[0].artist) : null;

  const rawMetrics = (analysis.raw_metrics ?? {}) as { uploadsLast30d?: number };
  const uploadsLast30d = rawMetrics.uploadsLast30d ?? 0;

  const verdict = verdictFor(subKScore);
  const summary =
    `${smallChannelWinRate}% of top performers in this niche came from channels under 1K subs. ` +
    `Upload competition is ${competitionLabel(saturation).toLowerCase()} at ${uploadsLast30d} videos this month, ` +
    `and search demand is ${demandLabel(demand).toLowerCase()}. ${verdict}.`;

  return {
    artistName,
    subKScore,
    smallChannelWinRate,
    saturation,
    demand,
    velocityCeiling,
    medianViewsPerDay,
    uploadsLast30d,
    topCoMention,
    verdict,
    cached,
    summary,
  };
}

// ── Bounded-concurrency pool ─────────────────────────────────────────────
// Simple worker-pool Promise.all — no external dependency needed for a
// concurrency cap of 5.

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Route ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { artistNames?: string[]; genre?: string | null } | null;
  if (!body?.artistNames) {
    return NextResponse.json({ error: "Missing artistNames" }, { status: 400 });
  }

  // Dedupe case-insensitively, preserving first-seen casing and order — the
  // order IS the priority signal for the new-artist budget below, same
  // convention as scoreManualArtists.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of body.artistNames) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  const artistNames = names.slice(0, MAX_ARTISTS_PER_BATCH);
  if (!artistNames.length) {
    return NextResponse.json({ error: `Provide at least one artist name (up to ${MAX_ARTISTS_PER_BATCH}).` }, { status: 400 });
  }

  const genre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : null;

  try {
    const supabase: SupabaseClient = createServerClient();

    // One batched lookup for every name's slug rather than N sequential
    // ones — cheap read, and this pre-check is what lets us know which
    // names are "new" (no lane row at all — spends a new-artist budget
    // slot) before calling getNicheData at all.
    const bySlug = new Map<string, string>(); // slug -> artistName
    for (const name of artistNames) {
      const slug = normalizeLaneSlug(name);
      if (slug) bySlug.set(slug, name);
    }
    const slugs = [...bySlug.keys()];
    const { data: existingLanes, error: laneLookupErr } = slugs.length
      ? await supabase.from("lanes").select("id, slug").in("slug", slugs)
      : { data: [] as { id: string; slug: string }[], error: null };
    if (laneLookupErr) throw new Error(`lane slug lookup failed: ${laneLookupErr.message}`);
    const laneIdBySlug = new Map((existingLanes ?? []).map((r) => [r.slug as string, r.id as string]));

    // A lane existing isn't the same as a lane being CACHE-FRESH — an
    // existing-but-stale lane still triggers a real (quota-costing)
    // analyzeLane pass inside getNicheData, same as a brand-new one. The
    // "cached" indicator this route reports per-artist needs to reflect
    // "this call is expected to cost zero quota," so it has to be based on
    // the same freshness window getNicheData itself uses
    // (lib/reports/nicheCache.ts's DEFAULT_MAX_AGE_HOURS = 168h / 7 days,
    // not exported, mirrored here), not just "a lane row exists."
    const CACHE_FRESHNESS_HOURS = 168;
    const laneIds = [...laneIdBySlug.values()];
    const freshBySlug = new Set<string>();
    if (laneIds.length) {
      const { data: analyses, error: analysesErr } = await supabase
        .from("lane_analyses")
        .select("lane_id, created_at")
        .in("lane_id", laneIds)
        .order("created_at", { ascending: false });
      if (analysesErr) throw new Error(`lane_analyses freshness lookup failed: ${analysesErr.message}`);
      const latestCreatedAtByLaneId = new Map<string, string>();
      for (const row of analyses ?? []) {
        const laneId = row.lane_id as string;
        if (!latestCreatedAtByLaneId.has(laneId)) latestCreatedAtByLaneId.set(laneId, row.created_at as string);
      }
      for (const [slug, laneId] of laneIdBySlug) {
        const createdAt = latestCreatedAtByLaneId.get(laneId);
        const ageHours = createdAt ? (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000) : Infinity;
        if (ageHours < CACHE_FRESHNESS_HOURS) freshBySlug.add(slug);
      }
    }

    // Assign the new-artist budget in input order, exactly like
    // scoreManualArtists: already-tracked names never compete for it.
    let budgetRemaining = MAX_NEW_ARTISTS_PER_BATCH;
    const pending: string[] = [];
    const toProcess: { artistName: string; isNewArtist: boolean; expectCacheHit: boolean }[] = [];
    for (const name of artistNames) {
      const slug = normalizeLaneSlug(name);
      const isNewArtist = !slug || !laneIdBySlug.has(slug);
      if (isNewArtist) {
        if (budgetRemaining <= 0) {
          pending.push(name);
          continue;
        }
        budgetRemaining -= 1;
      }
      toProcess.push({ artistName: name, isNewArtist, expectCacheHit: !isNewArtist && freshBySlug.has(slug) });
    }

    // Once a genuinely new (never-analyzed, no cache to fall back to) lane
    // hits exhausted quota, the day's budget is gone — stop attempting
    // further new-lane analyses for the rest of this batch instead of
    // burning a reserveQuota round-trip on each one just to get the same
    // "no" back. Cached lookups are unaffected and keep running.
    let quotaExhausted = false;
    const quotaExceeded: string[] = [];
    let newlyAnalyzedCount = 0;

    const outcomes = await mapWithConcurrency(toProcess, CONCURRENCY_LIMIT, async ({ artistName, isNewArtist, expectCacheHit }) => {
      if (isNewArtist && quotaExhausted) {
        quotaExceeded.push(artistName);
        return null;
      }
      // Only a brand-new lane gets the genre hint as its starting
      // classification — an already-tracked lane keeps whatever it was
      // actually classified with (same rule as scoreManualArtists / Step 10
      // niche candidates in channelAnalyzer.ts).
      const nicheResult = await getNicheData(supabase, artistName, isNewArtist ? genre : null, {});
      if (!nicheResult) {
        if (isNewArtist) quotaExhausted = true;
        quotaExceeded.push(artistName);
        return null;
      }
      if (!expectCacheHit) newlyAnalyzedCount += 1;
      return buildScoreResult(artistName, nicheResult.analysis, expectCacheHit);
    });

    const results = outcomes
      .filter((r): r is ArtistScoreResult => r !== null)
      .sort((a, b) => b.subKScore - a.subKScore);

    console.log(
      `[admin/scores/batch] scored ${results.length}/${artistNames.length} artist(s) — ` +
      `${newlyAnalyzedCount} newly analyzed, ${results.length - newlyAnalyzedCount} cache-warm, ` +
      `${quotaExceeded.length} quota-blocked, ${pending.length} pending (new-artist cap reached)`
    );

    const response: BatchResponse = { results, pending, quotaExceeded };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[admin/scores/batch] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Scoring failed: ${message}` }, { status: 500 });
  }
}
