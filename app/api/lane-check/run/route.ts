import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sanitizeInput } from "@/lib/sanitize";
import { isPaidUser } from "@/lib/lanes/entitlement";
import { getOrCreateLane, isLaneFresh, getLatestAnalysis } from "@/lib/lanes/db";
import { analyzeLane } from "@/lib/lanes/pipeline";
import { summarizeLane, fullLaneDetail, type LaneSummary, type FullLaneDetail } from "@/lib/lanes/present";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";
// Cache-miss analysis runs inline (see step 4 below) — a request with
// multiple cold lanes needs real headroom beyond Vercel's default timeout.
export const maxDuration = 60;

const MAX_GENRE_LENGTH = 40;
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
  const genre = sanitizeInput(body.genre ?? "", MAX_GENRE_LENGTH);
  const channelId = body.channelId?.trim() || null;

  if (!artists.length) {
    return NextResponse.json({ error: "At least one artist is required" }, { status: 400 });
  }
  if (!genre) {
    return NextResponse.json({ error: "Genre is required" }, { status: 400 });
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

  // 4. Resolve each artist to a lane, serve from cache or run fresh analysis
  // inline. No queue — every cache miss is analyzed synchronously within this
  // request, for every user, paid or free. lane_jobs/enqueueLaneJob still
  // exist (used by the cron pre-warm/refresh scripts) but this route no
  // longer enqueues into them.
  const enabled = analysisEnabled();
  const lanes: { lane: Lane; analysis: Awaited<ReturnType<typeof getLatestAnalysis>> }[] = [];

  for (const artist of artists) {
    const { lane } = await getOrCreateLane(supabase, artist, null);

    let analysis = isLaneFresh(lane.last_analyzed_at) ? await getLatestAnalysis(supabase, lane.id) : null;

    if (!analysis && enabled) {
      const result = await analyzeLane(supabase, lane);
      analysis = result.analysisRow;
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
