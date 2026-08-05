// Report Builder — Manual Curation mode: scores up to 5 producer-supplied
// artist names through the exact same real pipeline the auto-picker uses
// (scoreLane -> getNicheData -> getOrCreateLane/analyzeLane), so the admin
// picks from real numbers instead of guesses. See
// lib/reports/channelAnalyzer.ts's scoreManualArtists for the actual
// scoring/budget/reject-filter logic this route just wraps in the same
// admin-password auth pattern every other report-builder route uses.
import { NextRequest, NextResponse } from "next/server";
import type { ChannelAnalysis } from "@/lib/reports/channelAnalyzer";
import { scoreManualArtists, MAX_MANUAL_ARTISTS } from "@/lib/reports/channelAnalyzer";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { analysis?: ChannelAnalysis; artistNames?: string[] }
    | null;
  if (!body?.analysis) {
    return NextResponse.json({ error: "Missing analysis" }, { status: 400 });
  }

  const artistNames = (body.artistNames ?? []).filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  if (!artistNames.length) {
    return NextResponse.json({ error: `Provide at least one artist name (up to ${MAX_MANUAL_ARTISTS}).` }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const results = await scoreManualArtists(
      supabase,
      artistNames,
      body.analysis.anchorGenre,
      body.analysis.channel.subscriberCount
    );
    // Quota visibility — same logging convention as the rest of the report
    // builder (see channelAnalyzer.ts's reserveQuota callers): how many of
    // this request's names actually spent new-artist budget vs. came back
    // free from cache.
    const newArtistCount = results.filter((r) => r.isNewArtist && r.candidate).length;
    console.log(
      `[report-builder/score-artists] scored ${results.length} artist(s) — ${newArtistCount} newly analyzed, ${results.length - newArtistCount} cache-warm/failed`
    );
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[report-builder/score-artists] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Scoring failed: ${message}` }, { status: 500 });
  }
}
