// Admin batch artist scorer — /admin/scores. Paste up to 50 artist names,
// pick a calendar month, and get every one ranked by a SubK Score (how
// winnable the niche was for a sub-1,000-subscriber producer THAT month),
// computed through lib/reports/nicheCache.ts's getNicheData in its
// month-scoped mode (see that file and lib/lanes/pipeline.ts's
// analyzeLaneForMonth).
//
// Force Fresh Data (forceRefresh, default OFF): unchecked, an artist+month
// analyzed within the last 7 days is served from lane_month_analyses at
// zero YouTube quota cost — routine exploration shouldn't burn quota just
// to re-look-up something already checked recently. Checked, every artist
// gets a real re-analysis regardless of cache age — for the monthly brief
// production run that explicitly wants dead-current numbers. Previously
// this route always force-refreshed unconditionally, which burned 5,000+
// units in a single 30-artist run; that's what this flag fixes.
//
// No new-artist cap: every artist in the batch is analyzed on demand (when
// not cache-served), bounded only by the real daily YouTube quota budget
// (lib/lanes/db.ts's reserveQuota) — a large force-refreshed batch at
// ~205 units/artist can legitimately exhaust the daily budget partway
// through, which is exactly what the quotaExceeded short-circuit below
// handles.
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaneAnalysis } from "@/lib/lanes/types";
import { normalizeLaneSlug, ESTIMATED_UNITS_PER_ANALYSIS } from "@/lib/lanes/db";
import { viewsPerDay, SCORE_CALIBRATION } from "@/lib/lanes/scoring";
import { getNicheData } from "@/lib/reports/nicheCache";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// ── Request bounds ───────────────────────────────────────────────────────

const MAX_ARTISTS_PER_BATCH = 50;
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

export interface ScoredArtist {
  artistName: string;
  subKScore: number;
  smallChannelWinRate: number; // 0-100, 25% weight
  saturation: number; // raw 0-100 (higher = more uploads = more competition), 25% weight (as 100-saturation)
  demand: number; // raw 0-100, 30% weight
  velocityCeiling: number; // 0-100 normalized, 20% weight
  medianViewsPerDay: number; // raw median views/day feeding velocityCeiling
  uploadsThisMonth: number; // raw upload count feeding the saturation label
  topCoMention: string | null;
  verdict: string;
  /** True when this artist had no lane on file before this request. */
  isNewArtist: boolean;
  /** True when this result was served from the 7-day month cache at zero
   * quota cost, rather than a fresh YouTube analysis this run. */
  cached: boolean;
  /** The credibility paragraph for the expanded row. */
  summary: string;
}

export interface NoDataArtist {
  artistName: string;
  subKScore: null;
  reason: string;
}

export type ArtistScoreResult = ScoredArtist | NoDataArtist;

interface BatchResponse {
  results: ArtistScoreResult[];
  /** Names that couldn't be analyzed because daily YouTube quota genuinely
   * ran out mid-batch — try again tomorrow. Never the old artificial cap
   * (removed) — real exhaustion only. */
  quotaExceeded: string[];
  /** Real YouTube quota this run actually spent (analyzed count ×
   * ESTIMATED_UNITS_PER_ANALYSIS) — distinct from the client's pre-run
   * estimate, which assumes every artist is a miss. */
  quotaUnitsUsed: number;
  cachedCount: number;
  analyzedCount: number;
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

function buildScoreResult(artistName: string, analysis: LaneAnalysis, isNewArtist: boolean, cached: boolean): ScoredArtist {
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

  // Fix 2 rebalance — small-channel win rate down to 25% (was 40%), demand
  // up to 30% (was 20%), velocity up to 20% (was 15%), saturation unchanged
  // at 25%. Prevents an empty/dead niche (100% win rate simply because
  // nothing but small channels ever posted there, near-zero views, zero
  // search demand) from outranking a genuinely active one.
  const subKScore = Math.round(
    smallChannelWinRate * 0.25 + saturationScore * 0.25 + demand * 0.3 + velocityCeiling * 0.2
  );

  const patterns = (analysis.patterns ?? {}) as { topCoMentions?: { artist: string }[] };
  const topCoMention = patterns.topCoMentions?.[0]?.artist ? titleCase(patterns.topCoMentions[0].artist) : null;

  const rawMetrics = (analysis.raw_metrics ?? {}) as { uploadsLast30d?: number };
  const uploadsThisMonth = rawMetrics.uploadsLast30d ?? 0;

  const verdict = verdictFor(subKScore);
  const summary =
    `${smallChannelWinRate}% of top performers in this niche came from channels under 1K subs. ` +
    `Upload competition is ${competitionLabel(saturation).toLowerCase()} at ${uploadsThisMonth} videos this month, ` +
    `and search demand is ${demandLabel(demand).toLowerCase()}. ${verdict}.`;

  return {
    artistName,
    subKScore,
    smallChannelWinRate,
    saturation,
    demand,
    velocityCeiling,
    medianViewsPerDay,
    uploadsThisMonth,
    topCoMention,
    verdict,
    isNewArtist,
    cached,
    summary,
  };
}

// ── Bounded-concurrency pool ─────────────────────────────────────────────

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

  const body = (await req.json().catch(() => null)) as
    | { artistNames?: string[]; genre?: string | null; month?: number; year?: number; forceRefresh?: boolean }
    | null;
  if (!body?.artistNames) {
    return NextResponse.json({ error: "Missing artistNames" }, { status: 400 });
  }

  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Provide a valid month (1-12) and year." }, { status: 400 });
  }

  // Dedupe case-insensitively, preserving first-seen casing and order.
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
  const forceRefresh = body.forceRefresh === true;

  try {
    const supabase: SupabaseClient = createServerClient();

    // One batched lookup for every name's slug — only used to decide
    // whether a brand-new lane gets the genre hint as its starting
    // classification (same rule as scoreManualArtists / Step 10 niche
    // candidates in channelAnalyzer.ts) and to flag "New" in the UI. No
    // longer gates how many get analyzed — Fix 1 removed that cap.
    const bySlug = new Map<string, string>();
    for (const name of artistNames) {
      const slug = normalizeLaneSlug(name);
      if (slug) bySlug.set(slug, name);
    }
    const slugs = [...bySlug.keys()];
    const { data: existingLanes, error: laneLookupErr } = slugs.length
      ? await supabase.from("lanes").select("slug").in("slug", slugs)
      : { data: [] as { slug: string }[], error: null };
    if (laneLookupErr) throw new Error(`lane slug lookup failed: ${laneLookupErr.message}`);
    const existingSlugSet = new Set((existingLanes ?? []).map((r) => r.slug as string));

    // Once quota genuinely runs out (getNicheData returns null — nothing
    // cacheable to fall back to for this specific month), stop attempting
    // further analyses for the rest of this batch instead of burning a
    // reserveQuota round-trip on each remaining name just to get the same
    // "no" back.
    let quotaExhausted = false;
    const quotaExceeded: string[] = [];
    let analyzedCount = 0;
    let cachedCount = 0;
    let noDataCount = 0;

    const items = artistNames.map((artistName) => {
      const slug = normalizeLaneSlug(artistName);
      const isNewArtist = !slug || !existingSlugSet.has(slug);
      return { artistName, isNewArtist };
    });

    const outcomes = await mapWithConcurrency(items, CONCURRENCY_LIMIT, async ({ artistName, isNewArtist }) => {
      if (quotaExhausted) {
        quotaExceeded.push(artistName);
        return null;
      }
      const nicheResult = await getNicheData(supabase, artistName, isNewArtist ? genre : null, {
        forceRefresh,
        month,
        year,
      });
      if (!nicheResult) {
        quotaExhausted = true;
        quotaExceeded.push(artistName);
        return null;
      }
      if (nicheResult.fromCache) cachedCount += 1;
      else analyzedCount += 1;
      if (nicheResult.noData) {
        noDataCount += 1;
        const noDataResult: NoDataArtist = { artistName, subKScore: null, reason: "No data for this period" };
        return noDataResult;
      }
      return buildScoreResult(artistName, nicheResult.analysis, isNewArtist, nicheResult.fromCache);
    });

    const results = outcomes
      .filter((r): r is ArtistScoreResult => r !== null)
      .sort((a, b) => {
        // No-data rows always sort to the bottom, regardless of score.
        if (a.subKScore === null && b.subKScore === null) return 0;
        if (a.subKScore === null) return 1;
        if (b.subKScore === null) return -1;
        return b.subKScore - a.subKScore;
      });

    const quotaUnitsUsed = analyzedCount * ESTIMATED_UNITS_PER_ANALYSIS;
    console.log(
      `[admin/scores/batch] scored ${results.length}/${artistNames.length} artist(s) for ${month}/${year} ` +
      `(forceRefresh=${forceRefresh}) — ${analyzedCount} analyzed (${quotaUnitsUsed} units), ` +
      `${cachedCount} cached (zero quota), ${noDataCount} no-data, ${quotaExceeded.length} quota-blocked`
    );

    const response: BatchResponse = { results, quotaExceeded, quotaUnitsUsed, cachedCount, analyzedCount };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[admin/scores/batch] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Scoring failed: ${message}` }, { status: 500 });
  }
}
