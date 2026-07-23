// Generates 2 DM variations for a saved prospect (see
// app/admin/prospects/[id]/page.tsx). The prospect's real data (channel
// name, recent video title, lane/artist name) is re-read from the DB by id
// rather than trusted from the client; only the producer's selected insight
// sentences come from the request body.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generateDMVariations } from "@/lib/prospect-dm";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const MAX_SELECTED_INSIGHTS = 2;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: { selectedInsights?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const selectedInsights = (body.selectedInsights ?? []).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  if (!selectedInsights.length) {
    return NextResponse.json({ error: "Select at least one insight first" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: prospect, error } = await supabase.from("outreach_prospects").select("*").eq("id", id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load prospect" }, { status: 500 });
  }
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const result = await generateDMVariations({
    channelName: prospect.channel_name as string,
    recentVideoTitle: (prospect.recent_video_title as string | null) ?? null,
    artistName: prospect.artist_name as string,
    selectedInsights: selectedInsights.slice(0, MAX_SELECTED_INSIGHTS),
  });

  return NextResponse.json(result);
}
