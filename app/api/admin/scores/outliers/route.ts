// Admin outlier video extractor — Fix 5/6 of the /admin/scores brief. For up
// to 5 selected artists, finds the single highest-performing (by total view
// count) video that both (a) published within the selected calendar month
// and (b) came from a channel under 1,000 subscribers — the real proof-point
// the brief's title-framework section is built from, full tags array
// included.
//
// Two-tier lookup per artist:
//   1. lane_analyses.top_videos already on file (zero quota) — only useful
//      when the selected month happens to fall inside whatever window that
//      row's own rolling-window analysis covered; still worth checking
//      first since it's free.
//   2. getNicheData's month-scoped branch — itself cache-aware
//      (lane_month_analyses, 7-day freshness, same forceRefresh flag the
//      batch scorer's "Force Fresh Data" checkbox drives) — so this is
//      "zero quota if that exact month was already checked recently"
//      before falling all the way through to a real live re-analysis. This
//      is also the "follow-up channels.list call per video" the brief
//      describes: analyzeLaneForMonth already makes that call as part of
//      computing topVideos, so there's no separate lighter-weight fetch to
//      write for the live case.
import { NextRequest, NextResponse } from "next/server";
import { normalizeLaneSlug, getLatestAnalysis } from "@/lib/lanes/db";
import { monthBounds } from "@/lib/lanes/dateRange";
import { isTypeBeatTitle, titleContainsArtist } from "@/lib/lanes/patterns";
import { getNicheData } from "@/lib/reports/nicheCache";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const MAX_OUTLIER_ARTISTS = 5;
// Same tier as the batch scorer's SUBK_CHANNEL_THRESHOLD — strictly
// enforced per the brief ("Channel subscriber count < 1,000").
const SUBK_CHANNEL_THRESHOLD = 1_000;

interface TopVideoRow {
  videoId?: string;
  title?: string;
  tags?: string[];
  viewCount?: number;
  subscriberCount?: number;
  publishedAt?: string;
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
  source: "stored" | "month-cache" | "live" | null;
}

// Filter 1 (isTypeBeatTitle) and Filter 2 (titleContainsArtist) now live in
// lib/lanes/patterns.ts — shared with lib/lanes/pipeline.ts's
// analyzeLaneForMonth, which applies the exact same checks to the videos it
// scores from (see that file), rather than reimplementing them here.

/** Filters to (1) a real type-beat title, (2) the target
 * artist's own name present in that title, (3) a sub-1K-subscriber channel
 * — strictly, before any ranking happens — published within [start, end],
 * THEN picks the single highest-total-view survivor. "Highest-performing"
 * read as the biggest real breakout hit (the strongest proof point for a
 * title framework), not merely the fastest-currently-climbing one. */
function pickOutlier(topVideos: TopVideoRow[], artistName: string, start: Date, end: Date): TopVideoRow | null {
  const qualifying = topVideos.filter((v) => {
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

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { artistNames?: string[]; month?: number; year?: number; forceRefresh?: boolean }
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
  const forceRefresh = body.forceRefresh === true;

  try {
    const supabase = createServerClient();
    const { start, end } = monthBounds(month, year);

    const results: OutlierResult[] = await Promise.all(
      artistNames.map(async (artistName): Promise<OutlierResult> => {
        const slug = normalizeLaneSlug(artistName);

        // Tier 1 — zero-quota stored-data check.
        if (slug) {
          const { data: existingLane } = await supabase.from("lanes").select("id").eq("slug", slug).maybeSingle();
          if (existingLane) {
            const stored = await getLatestAnalysis(supabase, existingLane.id as string);
            if (stored) {
              const outlier = pickOutlier((stored.top_videos ?? []) as TopVideoRow[], artistName, start, end);
              if (outlier) {
                return { artistName, outlier: toOutlierVideo(outlier), reason: null, source: "stored" };
              }
            }
          }
        }

        // Tier 2 — getNicheData's month-scoped branch: a zero-quota hit if
        // this exact month was already cached within 7 days (e.g. a Score
        // All run moments ago), a real live analysis otherwise.
        const nicheResult = await getNicheData(supabase, artistName, null, { forceRefresh, month, year });
        if (!nicheResult) {
          return { artistName, outlier: null, reason: "Quota exhausted — retry tomorrow", source: null };
        }
        if (nicheResult.noData) {
          return { artistName, outlier: null, reason: "No data for this period", source: null };
        }
        const outlier = pickOutlier((nicheResult.analysis.top_videos ?? []) as TopVideoRow[], artistName, start, end);
        if (!outlier) {
          return { artistName, outlier: null, reason: "No qualifying outlier found", source: null };
        }
        return { artistName, outlier: toOutlierVideo(outlier), reason: null, source: nicheResult.fromCache ? "month-cache" : "live" };
      })
    );

    const storedCount = results.filter((r) => r.source === "stored" || r.source === "month-cache").length;
    const liveCount = results.filter((r) => r.source === "live").length;
    const foundCount = results.filter((r) => r.outlier).length;
    console.log(
      `[admin/scores/outliers] extracted ${foundCount}/${results.length} outlier(s) for ${month}/${year} ` +
      `(forceRefresh=${forceRefresh}) — ${storedCount} from cache (zero quota), ${liveCount} live (quota spent)`
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[admin/scores/outliers] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Outlier extraction failed: ${message}` }, { status: 500 });
  }
}
