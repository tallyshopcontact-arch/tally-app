// Lane-based Producer Finder search (see app/admin/prospects/page.tsx).
// Deliberately separate from /api/admin/find-producers (the older genre/
// artist-based pipeline backing the Producer Finder tab in /admin) — this
// resolves the artist name from a lane instead of free-text input, and
// reuses lib/lanes/youtube.ts (the same YouTube adapter the lane-analysis
// pipeline uses) rather than lib/producer-finder.ts's own fetch calls, since
// getChannelSubCounts' channels_cache read-through means a channel already
// seen by lane analysis (or an earlier prospect search) costs no quota here.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { searchVideos, getVideoDetails, getChannelSubCounts } from "@/lib/lanes/youtube";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const MIN_SUBS = 500;
const MAX_SUBS = 50_000;
const SEARCH_WINDOW_DAYS = 90;
const SEARCH_MAX_RESULTS = 50;

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { laneId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const laneId = body.laneId?.trim();
  if (!laneId) {
    return NextResponse.json({ error: "Missing laneId" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: lane, error: laneErr } = await supabase
    .from("lanes")
    .select("id, display_name")
    .eq("id", laneId)
    .maybeSingle();
  if (laneErr) {
    return NextResponse.json({ error: "Lane lookup failed" }, { status: 500 });
  }
  if (!lane) {
    return NextResponse.json({ error: "Lane not found" }, { status: 404 });
  }
  const artistName = lane.display_name as string;

  let searchResult;
  try {
    searchResult = await searchVideos(`${artistName} type beat`, {
      order: "date",
      publishedAfterDays: SEARCH_WINDOW_DAYS,
      maxResults: SEARCH_MAX_RESULTS,
    });
  } catch (e) {
    console.error("[prospects/search] YouTube search failed:", e);
    return NextResponse.json({ error: "YouTube search failed. Please try again." }, { status: 502 });
  }

  // Results arrive newest-first, so the first hit per channel is already its
  // most recent relevant video — no separate re-sort needed.
  const videoIdByChannel = new Map<string, string>();
  for (const item of searchResult.items) {
    if (!videoIdByChannel.has(item.channelId)) videoIdByChannel.set(item.channelId, item.videoId);
  }
  const channelIds = [...videoIdByChannel.keys()];
  if (!channelIds.length) {
    return NextResponse.json({ artistName, prospects: [] });
  }

  const [subCounts, videoDetails] = await Promise.all([
    getChannelSubCounts(supabase, channelIds),
    getVideoDetails([...videoIdByChannel.values()]),
  ]);
  const titleByVideoId = new Map(videoDetails.map((v) => [v.videoId, v.title]));

  const { data: existing, error: existingErr } = await supabase
    .from("outreach_prospects")
    .select("channel_id")
    .in("channel_id", channelIds);
  if (existingErr) {
    return NextResponse.json({ error: "Failed to check existing prospects" }, { status: 500 });
  }
  const existingIds = new Set((existing ?? []).map((r) => r.channel_id as string));

  const prospects = channelIds
    .filter((id) => !existingIds.has(id))
    .map((channelId) => {
      const sub = subCounts.get(channelId);
      const videoId = videoIdByChannel.get(channelId)!;
      return {
        channelId,
        channelName: sub?.title ?? "",
        subscriberCount: sub?.subscriberCount ?? 0,
        recentVideoTitle: titleByVideoId.get(videoId) ?? null,
        channelUrl: `https://youtube.com/channel/${channelId}`,
      };
    })
    .filter((p) => p.subscriberCount >= MIN_SUBS && p.subscriberCount <= MAX_SUBS)
    .sort((a, b) => a.subscriberCount - b.subscriberCount);

  return NextResponse.json({ artistName, prospects });
}
