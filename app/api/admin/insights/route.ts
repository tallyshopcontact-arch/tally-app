// Lane insight extractor endpoint — plain-text, copy-friendly facts for
// posting, computed entirely from the already-persisted latest lane_analyses
// row (no YouTube calls here). Same shared-secret auth pattern as the rest
// of /api/admin/*.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getLaneInsights } from "@/lib/lanes/insights";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const laneId = url.searchParams.get("laneId");
  if (!laneId) {
    return NextResponse.json({ error: "Missing laneId" }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await getLaneInsights(supabase, laneId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
