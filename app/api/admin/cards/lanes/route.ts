// Lists lanes with a fresh (<14 day) analysis, for the /admin/cards lane
// pickers — a card can only ever be generated for a lane this list includes,
// so the picker can't lead someone into the render route's stale-data error.
// Also reused as-is by /admin/insights (see app/api/admin/insights/route.ts),
// which is why `id` is included alongside `slug` — insights are looked up by
// lane id, cards by slug.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getLatestAnalysis } from "@/lib/lanes/db";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const FRESHNESS_DAYS = 14;

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: lanes, error } = await supabase
    .from("lanes")
    .select("id, slug, display_name")
    .gte("last_analyzed_at", cutoff)
    .order("display_name");
  if (error) {
    return NextResponse.json({ error: "Failed to load lanes" }, { status: 500 });
  }

  const withScores = await Promise.all(
    (lanes ?? []).map(async (lane) => {
      const analysis = await getLatestAnalysis(supabase, lane.id);
      if (!analysis) return null;
      return {
        id: lane.id as string,
        slug: lane.slug as string,
        displayName: lane.display_name as string,
        opportunity: analysis.opportunity,
      };
    })
  );

  return NextResponse.json({ lanes: withScores.filter((l): l is NonNullable<typeof l> => l !== null) });
}
