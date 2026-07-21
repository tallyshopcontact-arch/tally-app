// Lane Check pivot — "Best open lane" recommendation. Surfaces the highest-
// scoring lane analyzed in the last 14 days that (a) isn't one of the lanes
// the producer just checked and (b) actually beats their best checked score,
// so the section is proof of a real opportunity, never a consolation prize.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStatus, type LaneStatus } from "./scoring";

const FRESHNESS_DAYS = 14;
const CANDIDATE_LIMIT = 50; // top-N by opportunity to scan past excluded lane ids

export interface BestOpenLane {
  laneId: string;
  laneSlug: string;
  displayName: string;
  opportunity: number;
  statusColor: LaneStatus;
  daysAgo: number;
}

interface AnalysisRow {
  lane_id: string;
  opportunity: number;
  created_at: string;
}

async function topAnalysis(
  supabase: SupabaseClient,
  laneIds: string[] | null, // null = search across all lanes
  excludeLaneIds: string[],
  sinceIso: string
): Promise<AnalysisRow | null> {
  if (laneIds && !laneIds.length) return null;

  let query = supabase
    .from("lane_analyses")
    .select("lane_id, opportunity, created_at")
    .gte("created_at", sinceIso)
    .order("opportunity", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (laneIds) query = query.in("lane_id", laneIds);

  const { data } = await query;
  if (!data?.length) return null;

  const excluded = new Set(excludeLaneIds);
  return (data as AnalysisRow[]).find((row) => !excluded.has(row.lane_id)) ?? null;
}

/** Case-insensitive exact match against lanes.genre_hint, falling back to an
 * unscoped search (any genre) when the genre-scoped search finds nothing —
 * either because the genre is empty/unrecognized or no lane in it has a
 * fresh analysis. */
export async function getBestOpenLane(
  supabase: SupabaseClient,
  genre: string | null,
  excludeLaneIds: string[],
  bestCheckedOpportunity: number
): Promise<BestOpenLane | null> {
  const sinceIso = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trimmedGenre = genre?.trim() || null;

  let top: AnalysisRow | null = null;

  if (trimmedGenre) {
    const { data: genreLanes } = await supabase.from("lanes").select("id").ilike("genre_hint", trimmedGenre);
    const genreLaneIds = (genreLanes as { id: string }[] | null)?.map((l) => l.id) ?? [];
    top = await topAnalysis(supabase, genreLaneIds, excludeLaneIds, sinceIso);
  }

  if (!top) {
    top = await topAnalysis(supabase, null, excludeLaneIds, sinceIso);
  }

  if (!top || top.opportunity <= bestCheckedOpportunity) return null;

  const { data: lane } = await supabase
    .from("lanes")
    .select("id, slug, display_name")
    .eq("id", top.lane_id)
    .single();
  if (!lane) return null;

  const daysAgo = Math.floor((Date.now() - new Date(top.created_at).getTime()) / 86_400_000);

  return {
    laneId: lane.id as string,
    laneSlug: lane.slug as string,
    displayName: lane.display_name as string,
    opportunity: top.opportunity,
    statusColor: computeStatus(top.opportunity),
    daysAgo,
  };
}
