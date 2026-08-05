// Weekly streaming momentum snapshot cron — snapshots every active
// watchlist_artists row (see lib/momentum/snapshot.ts). Runs Sundays 6am UTC
// (see vercel.json), clear of the daily lane-refresh (2am), track-channels
// (5am), and lane-jobs (9am) crons.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { snapshotAllArtists } from "@/lib/momentum/snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  const result = await snapshotAllArtists(supabase);
  console.log(
    `[cron/momentum-snapshot] processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed}`
  );
  return NextResponse.json(result);
}
