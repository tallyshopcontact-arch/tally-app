// Saves one prospect from the lane-based Producer Finder (see
// app/admin/prospects/page.tsx) into outreach_prospects. Upserts on
// channel_id so re-saving (or a channel showing up again in a later search
// before the search route's own exclusion catches up) never errors.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface SaveBody {
  channelId?: string;
  channelName?: string;
  subscriberCount?: number;
  recentVideoTitle?: string | null;
  laneId?: string;
  artistName?: string;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  const channelName = body.channelName?.trim();
  const laneId = body.laneId?.trim();
  const artistName = body.artistName?.trim();
  if (!channelId || !channelName || !laneId || !artistName) {
    return NextResponse.json({ error: "Missing channelId, channelName, laneId, or artistName" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("outreach_prospects").upsert(
    {
      channel_id: channelId,
      channel_name: channelName,
      subscriber_count: body.subscriberCount ?? 0,
      recent_video_title: body.recentVideoTitle ?? null,
      lane_id: laneId,
      artist_name: artistName,
      status: "pending",
    },
    { onConflict: "channel_id" }
  );
  if (error) {
    return NextResponse.json({ error: `Failed to save prospect: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
