import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sanitizeInput } from "@/lib/sanitize";
import { isPaidUser } from "@/lib/lanes/entitlement";
import {
  getOrCreateLane, isLaneFresh, getLatestAnalysis, hasPendingJob, enqueueLaneJob,
} from "@/lib/lanes/db";
import { analyzeLane } from "@/lib/lanes/pipeline";
import { summarizeLane, fullLaneDetail, type LaneSummary, type FullLaneDetail } from "@/lib/lanes/present";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

const GENRES = ["Boom Bap", "Drill", "Trap", "Lo-Fi", "Melodic", "R&B"];
const MAX_ARTISTS = 3;
const IP_DAILY_CAP = 5;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function analysisEnabled(): boolean {
  return process.env.LANE_ANALYSIS_ENABLED !== "false";
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  // 1. Parse and validate input
  let body: { artists?: string[]; genre?: string; channelId?: string; turnstileToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawArtists = (body.artists ?? []).map((a) => sanitizeInput(a, 60)).filter(Boolean);
  const artists = [...new Set(rawArtists)].slice(0, MAX_ARTISTS);
  const genre = body.genre?.trim() ?? "";
  const channelId = body.channelId?.trim() || null;

  if (!artists.length) {
    return NextResponse.json({ error: "At least one artist is required" }, { status: 400 });
  }
  if (!GENRES.includes(genre)) {
    return NextResponse.json({ error: `genre must be one of: ${GENRES.join(", ")}` }, { status: 400 });
  }

  const turnstileResult = await verifyTurnstileToken(body.turnstileToken);
  if (!turnstileResult.success) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 403 });
  }

  // 2. Identity + entitlement
  let userId: string | null = null;
  try {
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null; // treat as anonymous rather than failing the request
  }
  const isPaid = userId ? await isPaidUser(supabase, userId) : false;

  // 3. Rate limiting — paid users are exempt from both
  if (!isPaid) {
    const ip = getClientIp(req);
    const today = new Date().toISOString().slice(0, 10);
    const ipKey = `lanecheck:ip:${ip}:${today}`;
    const { data: rl } = await supabase.from("diagnostic_rate_limits").select("count").eq("key", ipKey).maybeSingle();
    if (rl && rl.count >= IP_DAILY_CAP) {
      return NextResponse.json({ error: "You've run 5 lane checks today. Come back tomorrow." }, { status: 429 });
    }
    await supabase.from("diagnostic_rate_limits").upsert(
      { key: ipKey, count: (rl?.count ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

    if (userId) {
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("lane_checks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString());
      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { error: "You've used your free Lane Check this month. Upgrade for unlimited checks." },
          { status: 429 }
        );
      }
    }
  }

  // 4. Resolve each artist to a lane, serve from cache or queue/run fresh analysis.
  // Lane-first caching: a request NEVER triggers YouTube directly except the paid
  // inline path below — everything else reads lane_analyses or enqueues a job.
  const enabled = analysisEnabled();
  const lanes: { lane: Lane; analysis: Awaited<ReturnType<typeof getLatestAnalysis>> }[] = [];

  for (const artist of artists) {
    const { lane } = await getOrCreateLane(supabase, artist, null);

    let analysis = isLaneFresh(lane.last_analyzed_at) ? await getLatestAnalysis(supabase, lane.id) : null;

    if (!analysis) {
      if (enabled && isPaid) {
        // Paid jumps the queue and runs inline. Kill switch overrides even this.
        const result = await analyzeLane(supabase, lane);
        analysis = result.analysisRow;
      } else if (!(await hasPendingJob(supabase, lane.id))) {
        await enqueueLaneJob(supabase, lane.id, { priority: isPaid ? 10 : 0, requestedBy: userId });
      }
    }

    await supabase.from("lanes").update({ request_count: lane.request_count + 1 }).eq("id", lane.id);
    lanes.push({ lane, analysis });
  }

  // 5. Persist the check
  const { data: laneCheck, error: checkErr } = await supabase
    .from("lane_checks")
    .insert({
      user_id: userId,
      email: null,
      lane_ids: lanes.map((l) => l.lane.id),
      genre,
      channel_id: channelId,
    })
    .select("id")
    .single();
  if (checkErr || !laneCheck) {
    console.error("[lane-check/run] insert error:", checkErr?.message);
    return NextResponse.json({ error: "Failed to save lane check" }, { status: 500 });
  }

  // 6. Shape response — paid callers get everything inline, no email/report step
  const ranked = [...lanes].sort((a, b) => {
    const oa = a.analysis?.opportunity ?? -1;
    const ob = b.analysis?.opportunity ?? -1;
    return ob - oa;
  });

  if (isPaid) {
    const allLanesFull: (FullLaneDetail | LaneSummary)[] = ranked.map(({ lane, analysis }) =>
      analysis ? fullLaneDetail(lane, analysis, true) : summarizeLane(lane, null)
    );
    return NextResponse.json({ laneCheckId: laneCheck.id, isPaid: true, results: allLanesFull, requiresEmail: false });
  }

  const results: LaneSummary[] = ranked.map(({ lane, analysis }) => summarizeLane(lane, analysis));
  return NextResponse.json({
    laneCheckId: laneCheck.id,
    isPaid: false,
    results,
    requiresEmail: !userId,
  });
}
