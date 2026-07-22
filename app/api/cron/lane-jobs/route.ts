// Drains the lane_jobs queue — runs daily at 9am UTC (see vercel.json).
// TODO: tighten to hourly/10min on Vercel Pro — Hobby plan caps crons at
// once/day, so this is the tightest interval available until upgrading.
// Capped per run to protect YouTube quota (~204 units/lane analyzed).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeLane } from "@/lib/lanes/pipeline";
import { sendLaneReadyEmail } from "@/lib/email";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

const MAX_JOBS_PER_RUN = 10;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.LANE_ANALYSIS_ENABLED === "false") {
    return NextResponse.json({ processed: 0, note: "LANE_ANALYSIS_ENABLED=false — cache-only mode, queue not drained" });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  const { data: jobs, error } = await supabase
    .from("lane_jobs")
    .select("id, lane_id, notify_email")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);
  if (error) {
    console.error("[cron/lane-jobs] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    await supabase.from("lane_jobs").update({ status: "running" }).eq("id", job.id);

    try {
      const { data: lane, error: laneErr } = await supabase
        .from("lanes")
        .select("*")
        .eq("id", job.lane_id)
        .single();
      if (laneErr || !lane) throw new Error(laneErr?.message ?? "lane not found");

      await analyzeLane(supabase, lane as Lane);

      await supabase
        .from("lane_jobs")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      succeeded++;

      if (job.notify_email) {
        const prefillUrl = `https://www.tallyagc.com/upload-kit?artist=${encodeURIComponent((lane as Lane).display_name)}`;
        const { ok, error: emailErr } = await sendLaneReadyEmail(job.notify_email, (lane as Lane).display_name, prefillUrl);
        if (!ok) console.error(`[cron/lane-jobs] notify email failed for job ${job.id}:`, emailErr);
      }
    } catch (e) {
      console.error(`[cron/lane-jobs] job ${job.id} failed:`, e);
      await supabase
        .from("lane_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      failed++;
    }
  }

  console.log(`[cron/lane-jobs] processed=${jobs?.length ?? 0} succeeded=${succeeded} failed=${failed}`);
  return NextResponse.json({ processed: jobs?.length ?? 0, succeeded, failed });
}
