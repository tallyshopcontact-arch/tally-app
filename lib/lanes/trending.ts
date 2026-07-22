// Lane Check pivot — trending co-mentioned artist discovery. Surfaces artists
// that show up as co-mentions across small-channel winner titles in every
// lane checked under the same genre, excluding artists that already have
// their own lane (they'd just be a locked/regular lane result, not a "new
// artist to target" tip).

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLaneSlug } from "./db";

export interface TrendingArtist {
  artist: string;
  count: number;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getTrendingCoMentionedArtists(
  supabase: SupabaseClient,
  genre: string | null
): Promise<TrendingArtist[]> {
  if (!genre?.trim()) return [];

  const { data: checks } = await supabase
    .from("lane_checks")
    .select("lane_ids")
    .ilike("genre", genre.trim());
  if (!checks?.length) return [];

  const laneIds = new Set<string>();
  for (const c of checks as { lane_ids: string[] }[]) {
    for (const id of c.lane_ids ?? []) laneIds.add(id);
  }
  if (!laneIds.size) return [];

  const { data: analyses } = await supabase
    .from("lane_analyses")
    .select("patterns")
    .in("lane_id", [...laneIds]);
  if (!analyses?.length) return [];

  const counts = new Map<string, number>();
  for (const row of analyses as { patterns: Record<string, unknown> }[]) {
    const topCoMentions = (row.patterns?.topCoMentions ?? []) as { artist: string; count: number }[];
    for (const c of topCoMentions) {
      if (!c.artist) continue;
      counts.set(c.artist, (counts.get(c.artist) ?? 0) + (c.count ?? 0));
    }
  }
  if (!counts.size) return [];

  const candidates = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const candidateSlugs = candidates.map(([artist]) => normalizeLaneSlug(artist)).filter(Boolean);
  const { data: existingLanes } = await supabase.from("lanes").select("slug").in("slug", candidateSlugs);
  const existingSlugs = new Set((existingLanes as { slug: string }[] | null)?.map((l) => l.slug) ?? []);

  return candidates
    .filter(([artist]) => !existingSlugs.has(normalizeLaneSlug(artist)))
    .slice(0, 3)
    .map(([artist, count]) => ({ artist: titleCase(artist), count }));
}
