import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthClient } from "@/lib/supabase-server";
import { getLatestAnalysis } from "@/lib/lanes/db";
import { summarizeLane } from "@/lib/lanes/present";
import type { Lane } from "@/lib/lanes/types";

export const dynamic = "force-dynamic";

const MAX_CHECKS = 50;

export async function GET() {
  let userId: string | null = null;
  try {
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: checks, error: checksErr } = await supabase
    .from("lane_checks")
    .select("id, lane_ids, genre, channel_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_CHECKS);
  if (checksErr) {
    console.error("[lane-check/history] query error:", checksErr.message);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }

  const allLaneIds = [...new Set((checks ?? []).flatMap((c) => c.lane_ids as string[]))];
  const lanesById = new Map<string, Lane>();
  if (allLaneIds.length) {
    const { data: laneRows } = await supabase.from("lanes").select("*").in("id", allLaneIds);
    for (const l of (laneRows ?? []) as Lane[]) lanesById.set(l.id, l);
  }

  const results = await Promise.all(
    (checks ?? []).map(async (check) => {
      const lanes = await Promise.all(
        (check.lane_ids as string[]).map(async (id) => {
          const lane = lanesById.get(id);
          if (!lane) return null;
          const analysis = await getLatestAnalysis(supabase, id);
          return summarizeLane(lane, analysis);
        })
      );
      return {
        id: check.id,
        genre: check.genre,
        channelId: check.channel_id,
        createdAt: check.created_at,
        lanes: lanes.filter((l): l is NonNullable<typeof l> => l !== null)
          .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1)),
      };
    })
  );

  return NextResponse.json({ checks: results });
}
