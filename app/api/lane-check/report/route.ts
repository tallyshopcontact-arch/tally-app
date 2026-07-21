import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { isPaidUser } from "@/lib/lanes/entitlement";
import { summarizeLane, fullLaneDetail, type LaneSummary, type FullLaneDetail } from "@/lib/lanes/present";
import { getLatestAnalysis } from "@/lib/lanes/db";
import { getTrendingCoMentionedArtists } from "@/lib/lanes/trending";
import { getBestOpenLane } from "@/lib/lanes/recommendLane";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const laneCheckIdParam = req.nextUrl.searchParams.get("laneCheckId");
  if (!token && !laneCheckIdParam) {
    return NextResponse.json({ error: "token or laneCheckId is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  let laneCheckId: string;
  let userId: string | null = null;

  if (token) {
    // Anonymous magic-link path
    const { data: lead, error: leadErr } = await supabase
      .from("lane_check_leads")
      .select("id, lane_check_id, verified")
      .eq("verify_token", token)
      .maybeSingle();
    if (leadErr || !lead) {
      return NextResponse.json({ error: "Invalid or expired report link" }, { status: 404 });
    }
    if (!lead.verified) {
      await supabase.from("lane_check_leads").update({ verified: true }).eq("id", lead.id);
    }
    laneCheckId = lead.lane_check_id;
  } else {
    // Authenticated path — no email gate needed, we already know who this is.
    let authedUserId: string | null = null;
    try {
      const authClient = await createAuthClient();
      const { data: { user } } = await authClient.auth.getUser();
      authedUserId = user?.id ?? null;
    } catch {
      authedUserId = null;
    }
    if (!authedUserId) {
      return NextResponse.json({ error: "Sign in required to view this report" }, { status: 401 });
    }

    const { data: check, error: checkErr } = await supabase
      .from("lane_checks")
      .select("id, user_id")
      .eq("id", laneCheckIdParam)
      .single();
    if (checkErr || !check || check.user_id !== authedUserId) {
      return NextResponse.json({ error: "Lane check not found" }, { status: 404 });
    }
    laneCheckId = check.id;
    userId = authedUserId;
  }

  const { data: laneCheck, error: laneCheckErr } = await supabase
    .from("lane_checks")
    .select("id, lane_ids, genre, channel_id, created_at")
    .eq("id", laneCheckId)
    .single();
  if (laneCheckErr || !laneCheck) {
    return NextResponse.json({ error: "Lane check not found" }, { status: 404 });
  }

  const isPaid = userId ? await isPaidUser(supabase, userId) : false;

  const { data: laneRows, error: lanesErr } = await supabase
    .from("lanes")
    .select("*")
    .in("id", laneCheck.lane_ids as string[]);
  if (lanesErr) {
    return NextResponse.json({ error: "Failed to load lanes" }, { status: 500 });
  }
  const lanesById = new Map((laneRows as Lane[]).map((l) => [l.id, l]));

  const withAnalyses = await Promise.all(
    (laneCheck.lane_ids as string[]).map(async (id) => {
      const lane = lanesById.get(id);
      if (!lane) return null;
      const analysis = await getLatestAnalysis(supabase, id);
      return { lane, analysis };
    })
  );
  const lanes = withAnalyses.filter((x): x is NonNullable<typeof x> => x !== null);

  const ranked = [...lanes].sort((a, b) => (b.analysis?.opportunity ?? -1) - (a.analysis?.opportunity ?? -1));

  const results: (FullLaneDetail | LaneSummary)[] = ranked.map(({ lane, analysis }, i) => {
    if (!analysis) return summarizeLane(lane, null);
    const isTopLane = i === 0;
    // Free: top lane full (no co-mentions). Paid: everything full, co-mentions included.
    if (isPaid) return fullLaneDetail(lane, analysis, true);
    if (isTopLane) return fullLaneDetail(lane, analysis, false);
    return summarizeLane(lane, analysis);
  });

  const { count: paidCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("subscription_status", "active");
  const foundingSeatsRemain = (paidCount ?? 0) < 20;

  const trendingArtists = await getTrendingCoMentionedArtists(supabase, laneCheck.genre);

  const bestCheckedOpportunity = Math.max(-1, ...ranked.map(({ analysis }) => analysis?.opportunity ?? -1));
  const bestOpenLane = await getBestOpenLane(
    supabase,
    laneCheck.genre,
    laneCheck.lane_ids as string[],
    bestCheckedOpportunity
  );

  return NextResponse.json({
    laneCheckId: laneCheck.id,
    genre: laneCheck.genre,
    generatedAt: laneCheck.created_at,
    isPaid,
    results,
    trendingArtists,
    bestOpenLane,
    cta: {
      signupUrl: "https://www.tallyagc.com/signup",
      foundingSeatsRemain,
      promoCode: foundingSeatsRemain ? "FOUNDING20" : null,
      message: foundingSeatsRemain
        ? "Start your 14-day free trial — then $14/month, locked for life as a founding member. Use code FOUNDING20 for 20% off ($11.20/month forever)."
        : "Start your 14-day free trial — then $14/month.",
    },
  });
}
