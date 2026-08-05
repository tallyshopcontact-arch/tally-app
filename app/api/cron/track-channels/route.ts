// Daily channel snapshot cron — snapshots every active tracked_channels row
// (see lib/reports/channelTracking.ts). Runs at 5am UTC (see vercel.json),
// clear of lane-refresh (2am) and lane-jobs (9am).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { snapshotAllChannels } from "@/lib/reports/channelTracking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  const result = await snapshotAllChannels(supabase);
  console.log(
    `[cron/track-channels] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} quotaExhausted=${result.quotaExhausted}`
  );
  return NextResponse.json(result);
}
