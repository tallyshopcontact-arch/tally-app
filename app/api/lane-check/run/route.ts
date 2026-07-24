import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sanitizeInput } from "@/lib/sanitize";
import { sendLaneCheckMagicLink } from "@/lib/email";
import { isPaidUser } from "@/lib/lanes/entitlement";
import {
  getOrCreateLane,
  isLaneFresh,
  getLatestAnalysis,
  hasPendingJob,
  enqueueLaneJob,
  reserveQuota,
  ESTIMATED_UNITS_PER_ANALYSIS,
} from "@/lib/lanes/db";
import { analyzeLane } from "@/lib/lanes/pipeline";
import { shapeLaneResults, capAlsoConsider, type RankedLane } from "@/lib/lanes/present";
import { getTrendingCoMentionedArtists } from "@/lib/lanes/trending";
import { getBestOpenLane } from "@/lib/lanes/recommendLane";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";
// Cache-miss analysis runs inline (see step 8 below) — a request with a cold
// lane needs real headroom beyond Vercel's default timeout.
export const maxDuration = 60;

const MAX_GENRE_LENGTH = 40;
const MAX_BEAT_NAME_LENGTH = 60;
const MAX_ARTISTS = 2;
const WWW_BASE = "https://www.tallyagc.com";

function analysisEnabled(): boolean {
  return process.env.LANE_ANALYSIS_ENABLED !== "false";
}

function queuedNote(displayName: string): string {
  return `We haven't analyzed the ${displayName} lane yet — it's queued and we'll email you when it's ready.`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  // 1. Parse and validate input
  let body: {
    artists?: string[];
    genre?: string;
    channelId?: string;
    beatName?: string;
    turnstileToken?: string;
    email?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawArtists = (body.artists ?? []).map((a) => sanitizeInput(a, 60)).filter(Boolean);
  const artists = [...new Set(rawArtists)].slice(0, MAX_ARTISTS);
  const genre = sanitizeInput(body.genre ?? "", MAX_GENRE_LENGTH);
  const channelId = body.channelId?.trim() || null;
  const beatName = body.beatName?.trim() ? sanitizeInput(body.beatName.trim(), MAX_BEAT_NAME_LENGTH) : null;
  const submittedEmail = body.email?.trim().toLowerCase() || null;

  if (!artists.length) {
    return NextResponse.json({ error: "At least one artist is required" }, { status: 400 });
  }
  if (!genre) {
    return NextResponse.json({ error: "Genre is required" }, { status: 400 });
  }

  // 2. Identity + entitlement
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  } catch {
    userId = null; // treat as anonymous rather than failing the request
  }
  const isPaid = userId ? await isPaidUser(supabase, userId) : false;

  // 3. Anonymous callers with no email yet get asked for one before we do
  // anything else — no lane resolution, no Turnstile check, no analysis.
  // The email gate is now the sole free-tier enforcement mechanism (no more
  // IP-based daily cap).
  if (!userId && !submittedEmail) {
    return NextResponse.json({ requiresEmail: true });
  }

  let email: string | null = null;
  if (!userId) {
    if (!submittedEmail || !isValidEmail(submittedEmail)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    email = submittedEmail;
  }

  // 4. Real work is about to happen (analysis or a cache read that still
  // counts against a limit) — verify Turnstile now, not on the pre-check
  // above, since that call does no analysis and doesn't need to burn the token.
  const turnstileResult = await verifyTurnstileToken(body.turnstileToken);
  if (!turnstileResult.success) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 403 });
  }

  // 5. Resolve each artist to a lane and check cache freshness — cheap, no
  // YouTube calls yet.
  const enabled = analysisEnabled();
  const resolved: { lane: Lane; fresh: boolean }[] = [];
  for (const artist of artists) {
    const { lane } = await getOrCreateLane(supabase, artist, null);
    resolved.push({ lane, fresh: isLaneFresh(lane.last_analyzed_at) });
  }
  const allCached = resolved.every((r) => r.fresh);

  // 6. Monthly cap — only relevant when we're about to do real analysis
  // work. Fully cache-served kits are unlimited for free and paid alike.
  // Authenticated free users are capped by account; anonymous callers are
  // capped by the email they just gave us.
  const month = new Date().toISOString().slice(0, 7);
  const emailCapKey = email ? `lanecheck:email:${email}:${month}` : null;
  let emailCapCount = 0;

  if (!allCached && !isPaid) {
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
          { error: "You've used your free Upload Kit this month. Upgrade for unlimited kits." },
          { status: 429 }
        );
      }
    } else if (emailCapKey) {
      const { data: rl } = await supabase
        .from("diagnostic_rate_limits")
        .select("count")
        .eq("key", emailCapKey)
        .maybeSingle();
      emailCapCount = rl?.count ?? 0;
      if (emailCapCount >= 1) {
        return NextResponse.json(
          { error: "You've already used your free kit this month — upgrade for unlimited", capped: true },
          { status: 429 }
        );
      }
    }
  }

  // 7. Serve fresh lanes from cache (zero quota cost). For stale/missing
  // lanes, reserve against the daily YouTube quota budget before analyzing;
  // if the budget's exhausted or the analysis fails, enqueue onto the
  // existing lane_jobs queue instead of hard-failing the request.
  const lanes: { lane: Lane; analysis: Awaited<ReturnType<typeof getLatestAnalysis>>; note?: string }[] = [];

  for (const { lane, fresh } of resolved) {
    if (fresh) {
      const analysis = await getLatestAnalysis(supabase, lane.id);
      await supabase.from("lanes").update({ request_count: lane.request_count + 1 }).eq("id", lane.id);
      lanes.push({ lane, analysis });
      continue;
    }

    await supabase.from("lanes").update({ request_count: lane.request_count + 1 }).eq("id", lane.id);

    if (!enabled) {
      lanes.push({ lane, analysis: null });
      continue;
    }

    const withinBudget = await reserveQuota(supabase, ESTIMATED_UNITS_PER_ANALYSIS);
    if (!withinBudget) {
      if (!(await hasPendingJob(supabase, lane.id))) {
        await enqueueLaneJob(supabase, lane.id, { priority: isPaid ? 10 : 0, requestedBy: userId, notifyEmail: userEmail ?? email });
      }
      lanes.push({ lane, analysis: null, note: queuedNote(lane.display_name) });
      continue;
    }

    try {
      const result = await analyzeLane(supabase, lane);
      lanes.push({ lane, analysis: result.analysisRow });
    } catch (e) {
      console.error(`[lane-check/run] analyzeLane failed for ${lane.slug}:`, e);
      if (!(await hasPendingJob(supabase, lane.id))) {
        await enqueueLaneJob(supabase, lane.id, { priority: isPaid ? 10 : 0, requestedBy: userId, notifyEmail: userEmail ?? email });
      }
      lanes.push({ lane, analysis: null, note: queuedNote(lane.display_name) });
    }
  }

  // 8. Persist the check
  const { data: laneCheck, error: checkErr } = await supabase
    .from("lane_checks")
    .insert({
      user_id: userId,
      email,
      lane_ids: lanes.map((l) => l.lane.id),
      genre,
      channel_id: channelId,
      beat_name: beatName,
    })
    .select("id")
    .single();
  if (checkErr || !laneCheck) {
    console.error("[lane-check/run] insert error:", checkErr?.message);
    return NextResponse.json({ error: "Failed to save upload kit" }, { status: 500 });
  }

  // 9. Shape response — paid, authenticated-free, and now-identified
  // anonymous (gave a valid, non-capped email) callers all get their top
  // lane inline. There's no second "unlock" step anymore.
  const ranked: RankedLane[] = [...lanes].sort((a, b) => {
    const oa = a.analysis?.opportunity ?? -1;
    const ob = b.analysis?.opportunity ?? -1;
    return ob - oa;
  });

  const revealTopLane = isPaid || !!userId || !!email;
  const results = await shapeLaneResults(supabase, ranked, isPaid, revealTopLane);

  let trendingArtists: Awaited<ReturnType<typeof getTrendingCoMentionedArtists>> = [];
  let bestOpenLane: Awaited<ReturnType<typeof getBestOpenLane>> = null;
  if (revealTopLane) {
    trendingArtists = await getTrendingCoMentionedArtists(supabase, genre);
    const bestCheckedOpportunity = Math.max(-1, ...ranked.map((r) => r.analysis?.opportunity ?? -1));
    bestOpenLane = await getBestOpenLane(supabase, genre, lanes.map((l) => l.lane.id), bestCheckedOpportunity);
  }
  const alsoConsider = capAlsoConsider(trendingArtists, bestOpenLane, isPaid);

  // 10. Anonymous success: record the lead, send a bookmark link to their
  // kit, and — only when this request actually drew against the monthly
  // cap (i.e. wasn't a free unlimited cache hit) — bump that counter.
  if (!userId && email) {
    if (emailCapKey && !allCached && !isPaid) {
      await supabase.from("diagnostic_rate_limits").upsert(
        { key: emailCapKey, count: emailCapCount + 1, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    const verifyToken = randomBytes(32).toString("hex");
    const { error: leadErr } = await supabase.from("lane_check_leads").upsert(
      { email, lane_check_id: laneCheck.id, verified: true, verify_token: verifyToken },
      { onConflict: "email,lane_check_id" }
    );
    if (leadErr) {
      console.error("[lane-check/run] lead upsert error:", leadErr.message);
    } else {
      const reportUrl = `${WWW_BASE}/upload-kit/report?token=${verifyToken}`;
      const { ok, error: emailErr } = await sendLaneCheckMagicLink(email, reportUrl);
      if (!ok) console.error("[lane-check/run] bookmark email failed:", emailErr);
    }
  }

  return NextResponse.json({
    laneCheckId: laneCheck.id,
    beatName,
    genre,
    isPaid,
    results,
    requiresEmail: false,
    trendingArtists: alsoConsider.trendingArtists,
    bestOpenLane: alsoConsider.bestOpenLane,
  });
}
