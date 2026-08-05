// Lane Check pivot — trending co-mentioned artist discovery. Surfaces artists
// that show up as co-mentions across small-channel winner titles in every
// lane checked under the same genre, excluding artists that already have
// their own lane (they'd just be a locked/regular lane result, not a "new
// artist to target" tip).

import type { SupabaseClient } from "@supabase/supabase-js";
// Extension-explicit (allowImportingTsExtensions in tsconfig.json) so this
// file is directly importable by a plain `node scripts/*.ts` run, not just
// through the Next.js bundler — see scripts/seed-watchlist.ts.
import { normalizeLaneSlug } from "./db.ts";

export interface TrendingArtist {
  artist: string;
  count: number;
}

export interface GenreCoMentionCount {
  /** Lowercase, as stored in patterns.topCoMentions — not title-cased. */
  artist: string;
  count: number;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Raw genre-wide co-mention aggregation — every lane checked under this
 * genre, summed by how often each artist shows up in their winners'
 * co-mentions. No filtering of already-laned artists: that's specific to
 * getTrendingCoMentionedArtists's "new artist to target" use case below.
 * The report builder's expansion-recommendation neighborhood (see
 * lib/reports/channelAnalyzer.ts) wants the opposite — laned artists are
 * exactly the ones it can recommend — so it calls this directly instead. */
export async function getGenreCoMentionCounts(
  supabase: SupabaseClient,
  genre: string | null
): Promise<GenreCoMentionCount[]> {
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

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([artist, count]) => ({ artist, count }));
}

export async function getTrendingCoMentionedArtists(
  supabase: SupabaseClient,
  genre: string | null
): Promise<TrendingArtist[]> {
  const candidates = await getGenreCoMentionCounts(supabase, genre);
  if (!candidates.length) return [];

  const candidateSlugs = candidates.map((c) => normalizeLaneSlug(c.artist)).filter(Boolean);
  const { data: existingLanes } = await supabase.from("lanes").select("slug").in("slug", candidateSlugs);
  const existingSlugs = new Set((existingLanes as { slug: string }[] | null)?.map((l) => l.slug) ?? []);

  return candidates
    .filter((c) => !existingSlugs.has(normalizeLaneSlug(c.artist)))
    .slice(0, 3)
    .map((c) => ({ artist: titleCase(c.artist), count: c.count }));
}
