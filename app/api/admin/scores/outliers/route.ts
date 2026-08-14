// Admin outlier video extractor — Fix 5/6 of the /admin/scores brief. For up
// to 5 selected artists, finds the single highest-performing (by total view
// count) video that both (a) published within the selected calendar month
// and (b) came from a channel under 1,000 subscribers — the real proof-point
// the brief's title-framework section is built from, full tags array
// included.
//
// Candidate pool per artist, all merged together before picking one winner:
//   1. lane_analyses.top_videos already on file (zero quota) — only useful
//      when the selected month happens to fall inside whatever window that
//      row's own rolling-window analysis covered.
//   2. lane_month_analyses (zero quota) — the exact month's cache from the
//      batch scorer, read directly (not via getNicheData, which would
//      trigger its own ~205-unit live re-analysis on a miss — out of scope
//      here, see point 3).
//   3. A dedicated, ALWAYS-run live search: order=viewCount, bounded to the
//      selected month, query "{artist} type beat" — one search.list call
//      per selected artist, reserveQuota'd. This exists because the cached
//      pools above are capped in size and (for the scoring pipeline's pool
//      specifically) ranked by velocity rather than raw views, so either
//      can miss the video that's genuinely the highest-viewed qualifying
//      one in the window. Runs regardless of whether the cache already
//      found something, so the picked winner is verified against real
//      current data, not just whatever happened to be cached.
// Filters 1-3 (isTypeBeatTitle, titleContainsArtist, strict sub-1K) apply
// identically to every candidate regardless of which pool it came from.
import { NextRequest, NextResponse } from "next/server";
import { normalizeLaneSlug, getLatestAnalysis, getMonthAnalysis, reserveQuota } from "@/lib/lanes/db";
import { monthBounds } from "@/lib/lanes/dateRange";
import { isTypeBeatTitle, titleContainsArtist } from "@/lib/lanes/patterns";
import { searchVideos, getVideoDetails, getChannelSubCounts } from "@/lib/lanes/youtube";
import { createServerClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const MAX_OUTLIER_ARTISTS = 5;
// Same tier as the batch scorer's SUBK_CHANNEL_THRESHOLD — strictly
// enforced per the brief ("Channel subscriber count < 1,000").
const SUBK_CHANNEL_THRESHOLD = 1_000;
// One search.list call (100 units) — NOT the full ~205-unit
// ESTIMATED_UNITS_PER_ANALYSIS (two searches + videos.list + channels.list)
// lib/lanes/db.ts uses for a full lane analysis. This path only ever issues
// one search.list; the videos.list/channels.list follow-ups are ~1-2 units
// each and channels.list is often free via channels_cache.
const OUTLIER_LIVE_SEARCH_UNITS = 100;

type OutlierSource = "stored" | "month-cache" | "live";

interface TopVideoRow {
  videoId?: string;
  title?: string;
  tags?: string[];
  viewCount?: number;
  subscriberCount?: number;
  publishedAt?: string;
}

interface TaggedVideo extends TopVideoRow {
  _source: OutlierSource;
}

export interface OutlierVideo {
  title: string;
  tags: string[];
  viewCount: number;
  subscriberCount: number;
  videoUrl: string;
}

export interface OutlierResult {
  artistName: string;
  outlier: OutlierVideo | null;
  reason: string | null;
  source: OutlierSource | null;
}

// Filter 1 (isTypeBeatTitle) and Filter 2 (titleContainsArtist) live in
// lib/lanes/patterns.ts — shared with lib/lanes/pipeline.ts's
// analyzeLaneForMonth, which applies the exact same checks to the videos it
// scores from, rather than reimplementing them here.

/** Filters to (1) a real type-beat title, (2) the target artist's own name
 * present in that title, (3) a sub-1K-subscriber channel — strictly,
 * before any ranking happens — published within [start, end], THEN picks
 * the single highest-total-view survivor across every candidate pool
 * combined. "Highest-performing" read as the biggest real breakout hit
 * (the strongest proof point for a title framework), not merely the
 * fastest-currently-climbing one. */
function pickOutlier(candidates: TaggedVideo[], artistName: string, start: Date, end: Date): TaggedVideo | null {
  const qualifying = candidates.filter((v) => {
    // Filter 3 first, strictly — a video from a 1,200-sub channel is
    // rejected before its view count or title are even considered.
    if (typeof v.subscriberCount !== "number" || v.subscriberCount >= SUBK_CHANNEL_THRESHOLD) return false;
    if (typeof v.viewCount !== "number" || typeof v.title !== "string") return false;
    if (typeof v.publishedAt !== "string") return false;
    const t = new Date(v.publishedAt).getTime();
    if (t < start.getTime() || t > end.getTime()) return false;
    // Filter 1
    if (!isTypeBeatTitle(v.title)) return false;
    // Filter 2
    if (!titleContainsArtist(v.title, artistName)) return false;
    return true;
  });
  if (!qualifying.length) return null;
  return qualifying.reduce((best, v) => ((v.viewCount as number) > (best.viewCount as number) ? v : best));
}

function toOutlierVideo(v: TopVideoRow): OutlierVideo {
  return {
    title: v.title ?? "",
    tags: v.tags ?? [],
    viewCount: v.viewCount ?? 0,
    subscriberCount: v.subscriberCount ?? 0,
    videoUrl: `https://www.youtube.com/watch?v=${v.videoId ?? ""}`,
  };
}

/** The dedicated live supplement — one search.list call, order=viewCount,
 * bounded to [start, end], query "{artist} type beat" (deliberately not the
 * scoring pipeline's genre-suffixed query — this is a narrower, purely
 * view-count-ranked search meant to surface the single true outlier, not a
 * representative sample for demand/saturation scoring). Returns null only
 * when quota couldn't be reserved at all; an empty array is a legitimate
 * "the search ran and found nothing." */
async function liveOutlierSearch(
  supabase: SupabaseClient,
  artistName: string,
  start: Date,
  end: Date
): Promise<TaggedVideo[] | null> {
  const allowed = await reserveQuota(supabase, OUTLIER_LIVE_SEARCH_UNITS);
  if (!allowed) return null;

  const query = `${artistName} type beat`;
  const searchResult = await searchVideos(query, {
    order: "viewCount",
    publishedAfter: start.toISOString(),
    publishedBefore: end.toISOString(),
    maxResults: 50,
  });
  if (!searchResult.items.length) return [];

  const details = await getVideoDetails(searchResult.items.map((v) => v.videoId));
  const channelInfo = await getChannelSubCounts(supabase, details.map((v) => v.channelId));
  return details.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    tags: v.tags,
    viewCount: v.viewCount,
    subscriberCount: channelInfo.get(v.channelId)?.subscriberCount ?? 0,
    publishedAt: v.publishedAt,
    _source: "live" as const,
  }));
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { artistNames?: string[]; month?: number; year?: number }
    | null;
  if (!body?.artistNames?.length) {
    return NextResponse.json({ error: "Missing artistNames" }, { status: 400 });
  }

  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Provide a valid month (1-12) and year." }, { status: 400 });
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of body.artistNames) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    names.push(trimmed);
  }
  const artistNames = names.slice(0, MAX_OUTLIER_ARTISTS);
  if (!artistNames.length) {
    return NextResponse.json({ error: `Provide at least one artist name (up to ${MAX_OUTLIER_ARTISTS}).` }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { start, end } = monthBounds(month, year);
    let liveSearchesRun = 0;

    const results: OutlierResult[] = await Promise.all(
      artistNames.map(async (artistName): Promise<OutlierResult> => {
        const slug = normalizeLaneSlug(artistName);
        const candidates: TaggedVideo[] = [];

        // Tier 1 + 1b — zero-quota cache reads.
        if (slug) {
          const { data: existingLane } = await supabase.from("lanes").select("id").eq("slug", slug).maybeSingle();
          const laneId = (existingLane?.id as string | undefined) ?? null;
          if (laneId) {
            const stored = await getLatestAnalysis(supabase, laneId);
            for (const v of (stored?.top_videos ?? []) as TopVideoRow[]) {
              candidates.push({ ...v, _source: "stored" });
            }
            const monthCached = await getMonthAnalysis(supabase, laneId, month, year);
            if (monthCached && !monthCached.no_data) {
              for (const v of (monthCached.top_videos ?? []) as TopVideoRow[]) {
                candidates.push({ ...v, _source: "month-cache" });
              }
            }
          }
        }

        // Tier 2 — always-run live supplement, one search.list call.
        const liveResults = await liveOutlierSearch(supabase, artistName, start, end);
        const quotaExhausted = liveResults === null;
        if (liveResults) {
          liveSearchesRun += 1;
          candidates.push(...liveResults);
        }

        const winner = pickOutlier(candidates, artistName, start, end);
        if (winner) {
          return { artistName, outlier: toOutlierVideo(winner), reason: null, source: winner._source };
        }
        if (quotaExhausted && !candidates.length) {
          return { artistName, outlier: null, reason: "Quota exhausted — retry tomorrow", source: null };
        }
        return { artistName, outlier: null, reason: "No qualifying outlier found", source: null };
      })
    );

    const quotaUnitsUsed = liveSearchesRun * OUTLIER_LIVE_SEARCH_UNITS;
    const cacheWinCount = results.filter((r) => r.source === "stored" || r.source === "month-cache").length;
    const liveWinCount = results.filter((r) => r.source === "live").length;
    const foundCount = results.filter((r) => r.outlier).length;
    console.log(
      `[admin/scores/outliers] extracted ${foundCount}/${results.length} outlier(s) for ${month}/${year} — ` +
      `${liveSearchesRun} live search(es) run (${quotaUnitsUsed} units), ` +
      `${cacheWinCount} winner(s) from cache, ${liveWinCount} winner(s) from live search`
    );

    return NextResponse.json({ results, quotaUnitsUsed });
  } catch (err) {
    console.error("[admin/scores/outliers] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Outlier extraction failed: ${message}` }, { status: 500 });
  }
}
