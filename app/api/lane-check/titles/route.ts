import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { isPaidUser } from "@/lib/lanes/entitlement";
import { getLatestAnalysis } from "@/lib/lanes/db";
import { generateLaneTitles, scoreGeneratedTitles } from "@/lib/lanes/titles";
import type { PatternStats } from "@/lib/lanes/patterns";
import { sanitizeInput } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const supabase = createServerClient();
  const isPaid = await isPaidUser(supabase, userId);
  if (!isPaid) {
    return NextResponse.json({ error: "Title generator is a Pro feature." }, { status: 403 });
  }

  let body: { laneId?: string; beatName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const laneId = body.laneId?.trim();
  const beatName = body.beatName?.trim() ? sanitizeInput(body.beatName.trim(), 60) : undefined;
  if (!laneId) {
    return NextResponse.json({ error: "laneId is required" }, { status: 400 });
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
      beatName,
      patterns: analysis.patterns as unknown as PatternStats,
      winnerTitles,
    };
    const titles = generateLaneTitles(titleInput);
    const scored = scoreGeneratedTitles(titles, titleInput);
    return NextResponse.json({ titles: scored });
  } catch (e) {
    console.error("[lane-check/titles] generation failed:", e);
    return NextResponse.json({ error: "Title generation failed. Please try again." }, { status: 502 });
  }
}
