// Shared lanes-table title matcher — extracted out of lib/reports/channelAnalyzer.ts
// so lib/reports/channelTracking.ts (channel snapshot history, Phase 1) can
// detect a video's niche the same way the report builder does, instead of
// duplicating the matcher and silently drifting from it. Both callers need
// the same punctuation-normalization fix ("J. Cole" vs "J COLE" — see
// normalizeForMatch) to apply identically.

import type { SupabaseClient } from "@supabase/supabase-js";

interface LaneRow {
  id: string;
  slug: string;
  display_name: string;
  aliases: string[] | null;
  genre_hint: string | null;
}

export interface LaneMatcher {
  laneId: string;
  slug: string;
  displayName: string;
  genreHint: string | null;
  regex: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips punctuation real titles frequently drop or vary ("J. Cole" vs
 * "J COLE", "Joey Bada$$" vs "Joey Badass") so matching isn't sensitive to
 * it — verified against a real channel during testing where every "J. Cole"
 * lane match silently failed against "J COLE" titles until this normalized
 * both sides the same way. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[.'’]/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchLaneMatchers(supabase: SupabaseClient): Promise<LaneMatcher[]> {
  const { data, error } = await supabase.from("lanes").select("id, slug, display_name, aliases, genre_hint");
  if (error) throw new Error(`fetchLaneMatchers query failed: ${error.message}`);

  const matchers: LaneMatcher[] = [];
  for (const lane of (data ?? []) as LaneRow[]) {
    const names = [lane.display_name, ...(lane.aliases ?? [])].filter((n) => n && n.trim().length >= 3);
    for (const name of names) {
      matchers.push({
        laneId: lane.id,
        slug: lane.slug,
        displayName: lane.display_name,
        genreHint: lane.genre_hint,
        regex: new RegExp(`\\b${escapeRegExp(normalizeForMatch(name))}\\b`, "i"),
      });
    }
  }
  // Longest display name first — a multi-word artist name should win over a
  // shorter name that happens to be one of its substrings.
  return matchers.sort((a, b) => b.displayName.length - a.displayName.length);
}

export function matchKnownLane(title: string, matchers: LaneMatcher[]): LaneMatcher | null {
  const normalizedTitle = normalizeForMatch(title);
  let best: { matcher: LaneMatcher; index: number } | null = null;
  for (const m of matchers) {
    const match = m.regex.exec(normalizedTitle);
    if (match && (best === null || match.index < best.index)) {
      best = { matcher: m, index: match.index };
    }
  }
  return best?.matcher ?? null;
}
