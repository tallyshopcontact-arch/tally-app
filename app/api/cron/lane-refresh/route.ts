// Nightly: enqueue refresh jobs for lanes older than 14 days that have
// request_count >= 2. Never refreshes lanes nobody asks about (see
// LANE-CHECK-BRIEF.md "Architecture principle"). Actual analysis happens when
// /api/cron/lane-jobs drains the queue it adds to.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLaneFresh, hasPendingJob, enqueueLaneJob } from "@/lib/lanes/db";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

const MAX_LANES_PER_RUN = 40;
const MIN_REQUEST_COUNT = 2;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.LANE_ANALYSIS_ENABLED === "false") {
    return NextResponse.json({ queued: 0, note: "LANE_ANALYSIS_ENABLED=false — refresh skipped" });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  const { data: lanes, error } = await supabase
    .from("lanes")
    .select("*")
    .gte("request_count", MIN_REQUEST_COUNT)
    .order("last_analyzed_at", { ascending: true, nullsFirst: true });
  if (error) {
    console.error("[cron/lane-refresh] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let queued = 0;
  let skippedFresh = 0;
  let skippedPending = 0;

  for (const lane of (lanes ?? []) as Lane[]) {
    if (queued >= MAX_LANES_PER_RUN) break;
    if (isLaneFresh(lane.last_analyzed_at)) { skippedFresh++; continue; }
    if (await hasPendingJob(supabase, lane.id)) { skippedPending++; continue; }
    await enqueueLaneJob(supabase, lane.id, { priority: 0 });
    queued++;
  }

  console.log(`[cron/lane-refresh] queued=${queued} skippedFresh=${skippedFresh} skippedPending=${skippedPending}`);
  return NextResponse.json({ queued, skippedFresh, skippedPending });
}
