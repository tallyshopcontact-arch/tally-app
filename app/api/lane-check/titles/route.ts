import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { isPaidUser } from "@/lib/lanes/entitlement";
import { getLatestAnalysis } from "@/lib/lanes/db";
import { generateLaneTitles, scoreGeneratedTitles } from "@/lib/lanes/titles";
import type { PatternStats } from "@/lib/lanes/patterns";
import type { LaneAnalysis } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

const FREE_TITLE_COUNT = 2;
const PAID_TITLE_COUNT = 5;

export async function POST(req: NextRequest) {
  let body: { laneCheckId?: string; laneId?: string; offset?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const laneCheckId = body.laneCheckId?.trim();
  const laneId = body.laneId?.trim();
  if (!laneCheckId || !laneId) {
    return NextResponse.json({ error: "laneCheckId and laneId are required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: laneCheck, error: checkErr } = await supabase
    .from("lane_checks")
    .select("id, lane_ids, beat_name")
    .eq("id", laneCheckId)
    .single();
  if (checkErr || !laneCheck) {
    return NextResponse.json({ error: "Upload kit not found" }, { status: 404 });
  }
  const laneIds = laneCheck.lane_ids as string[];
  if (!laneIds.includes(laneId)) {
    return NextResponse.json({ error: "That lane isn't part of this upload kit" }, { status: 400 });
  }

  // Anonymous calls are allowed (free tier, top lane only) — this route makes
  // no YouTube calls, it's a pure function over already-cached analysis.
  let userId: string | null = null;
  try {
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  const isPaid = userId ? await isPaidUser(supabase, userId) : false;

  if (!isPaid) {
    // Recompute the check's top-ranked lane the same way shapeLaneResults
    // does, so a free/anon caller can't request titles for a locked lane.
    const analysesById = new Map<string, LaneAnalysis | null>();
    for (const id of laneIds) analysesById.set(id, await getLatestAnalysis(supabase, id));
    const ranked = [...laneIds].sort(
      (a, b) => (analysesById.get(b)?.opportunity ?? -1) - (analysesById.get(a)?.opportunity ?? -1)
    );
    if (ranked[0] !== laneId) {
      return NextResponse.json({ error: "The title generator is available for your top lane on the free tier." }, { status: 403 });
    }
  }

  const { data: lane, error: laneErr } = await supabase
    .from("lanes")
    .select("id, display_name")
    .eq("id", laneId)
    .single();
  if (laneErr || !lane) {
    return NextResponse.json({ error: "Lane not found" }, { status: 404 });
  }

  const analysis = await getLatestAnalysis(supabase, laneId);
  if (!analysis) {
    return NextResponse.json({ error: "No analysis available for this lane yet" }, { status: 404 });
  }

  try {
    const winnerTitles = (analysis.winner_videos as { title: string }[]).map((v) => v.title);
    const titleInput = {
      artistName: lane.display_name,
      beatName: (laneCheck.beat_name as string | null) ?? undefined,
      patterns: analysis.patterns as unknown as PatternStats,
      winnerTitles,
      offset: isPaid ? Math.max(0, Math.floor(body.offset ?? 0)) : 0,
    };
    const titles = generateLaneTitles(titleInput);
    const scored = scoreGeneratedTitles(titles, titleInput).slice(0, isPaid ? PAID_TITLE_COUNT : FREE_TITLE_COUNT);
    return NextResponse.json({ titles: scored, canRegenerate: isPaid });
  } catch (e) {
    console.error("[lane-check/titles] generation failed:", e);
    return NextResponse.json({ error: "Title generation failed. Please try again." }, { status: 502 });
  }
}
