// Shared lanes-table title matcher — extracted out of lib/reports/channelAnalyzer.ts
// so lib/reports/channelTracking.ts (channel snapshot history, Phase 1) can
// detect a video's niche the same way the report builder does, instead of
// duplicating the matcher and silently drifting from it. Both callers need
// the same punctuation-normalization fix ("J. Cole" vs "J COLE" — see
// normalizeForMatch) to apply identically.
//
// Also houses the winning-title-format builder and small-channel-example
// lookup — both consumed by the report builder's niche picker
// (channelAnalyzer.ts Step 10) AND the report route's plan cards, so they're
// built from real winner data exactly once, not twice.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCoMention } from "./patterns";
import { SCORE_CALIBRATION } from "./scoring";

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
        // Lookaround boundaries, not \b — \b anchors on a word/non-word
        // transition, which silently fails for a name ending in a
        // non-word character. "Joey Bada$$" normalizes to "joey bada$$";
        // \b right after "$$" never matches (both "$" and the space/end
        // after it are non-word, so there's no transition for \b to
        // anchor on), so the whole regex NEVER matches "Joey Bada$$ Type
        // beat" even though the text is right there — found verifying
        // this exact channel. (?<![a-z0-9]) / (?![a-z0-9]) require only
        // that a letter/digit doesn't sit directly against the match,
        // which still blocks "wayne" matching inside "dwayne" the same
        // way \b did, but doesn't choke on trailing punctuation.
        regex: new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizeForMatch(name))}(?![a-z0-9])`, "i"),
      });
    }
  }
  // Longest display name first — a multi-word artist name should win over a
  // shorter name that happens to be one of its substrings.
  return matchers.sort((a, b) => b.displayName.length - a.displayName.length);
}

/** Every distinct lane mentioned in a title, not just the best/first one —
 * "Boldy James x Larry June x Roc Marciano Type Beat" must return all three,
 * so a co-mention title counts toward every niche it names rather than
 * crediting only whichever artist happens to match first. Returned in the
 * order each name appears in the title (title order, not matcher-list order).
 *
 * Still respects the "longest name wins" collision rule a single-match
 * lookup needed (e.g. "Lil Wayne" shouldn't also separately credit a
 * hypothetical "Wayne" lane): matchers are pre-sorted longest-display-name
 * first by fetchLaneMatchers, and a shorter match whose span overlaps a
 * longer match already claimed in this title is skipped rather than counted
 * as a second, spurious artist. */
export function matchAllKnownLanes(title: string, matchers: LaneMatcher[]): LaneMatcher[] {
  const normalizedTitle = normalizeForMatch(title);
  const claimed: { start: number; end: number }[] = [];
  const seenLaneIds = new Set<string>();
  const found: { matcher: LaneMatcher; index: number }[] = [];

  for (const m of matchers) {
    if (seenLaneIds.has(m.laneId)) continue; // already matched via a different alias earlier in the list
    const match = m.regex.exec(normalizedTitle);
    if (!match) continue;

    const start = match.index;
    const end = start + match[0].length;
    if (claimed.some((c) => start < c.end && end > c.start)) continue; // overlaps an already-claimed (longer) match

    claimed.push({ start, end });
    seenLaneIds.add(m.laneId);
    found.push({ matcher: m, index: start });
  }

  return found.sort((a, b) => a.index - b.index).map((f) => f.matcher);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Winning title format builder ─────────────────────────────────────────
// Turns a niche's stored winner-pattern data into a "{Artist} x {CoMention}
// Type Beat "{Name}"" template. Reuses lib/lanes/patterns.ts's cleanCoMention
// — the same reject-filter-then-clean pipeline analyzePatterns applies at
// analysis time — as a second, point-of-use check: a stored topCoMentions
// candidate may predate that fix (see scripts/reclean-lanes.ts), so this
// can't just trust whatever's in the jsonb. Originally found via the exact
// bug this guards against: patterns.ts's co-mention regex can chain through
// multiple "x"s on a title ("MF DOOM x Joey Bada$$ x 90s Boom Bap Type
// Beat") and capture "joey bada$$ x 90s boom bap" as one blob instead of
// just the real artist — for a niche that IS Joey Bada$$, an uncleaned
// candidate produces "Joey Bada$$ x Joey Bada$$ X 90s Boom Bap."

/** First co-mention candidate that survives cleanCoMention's reject-filter
 * (genre/style words, "sample"/"prod"/etc., the primary artist itself,
 * implausible tokens) — or null if every candidate gets rejected, or there's
 * no co-mention data at all. */
export function pickTitleFormatCoMention(
  primaryArtistName: string,
  topCoMentions: { artist: string }[] | undefined
): string | null {
  for (const candidate of topCoMentions ?? []) {
    const cleaned = cleanCoMention(candidate.artist, primaryArtistName);
    if (cleaned) return titleCase(cleaned);
  }
  return null;
}

/** "{prefix}{Artist} x {CoMention} Type Beat "{Name}"" — the exact template
 * shape plan cards and the niche picker's pre-filled title format both use. */
export function buildWinningTitleFormat(
  primaryArtistName: string,
  topCoMentions: { artist: string }[] | undefined,
  freePrefixPct: number | undefined,
  beatNamePlaceholder = "{Name}"
): string {
  const usesFree = (freePrefixPct ?? 0) >= 50;
  const prefix = usesFree ? "[FREE] " : "";
  const coMention = pickTitleFormatCoMention(primaryArtistName, topCoMentions);
  return coMention
    ? `${prefix}${primaryArtistName} x ${coMention} Type Beat "${beatNamePlaceholder}"`
    : `${prefix}${primaryArtistName} Type Beat "${beatNamePlaceholder}"`;
}

// ── Small-channel example lookup ─────────────────────────────────────────
// A real, citable title from a niche's stored top_videos — used both for
// the report route's plan-card receipts ("an 812-sub channel took #2...")
// and the niche picker's "current winning title format example."

export interface SmallChannelExample {
  /** 1-indexed position in topVideos, which lib/lanes/pipeline.ts already
   * stores ranked by views/day desc — so this "#N" is the video's real rank
   * among this niche's top performers, not a made-up number. */
  rank: number;
  subscriberCount: number;
  title: string;
}

export function findSmallChannelExample(topVideos: unknown[]): SmallChannelExample | null {
  const videos = topVideos as { subscriberCount?: number; title?: string }[];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (
      typeof v.subscriberCount === "number" &&
      v.subscriberCount < SCORE_CALIBRATION.smallChannelSubThreshold &&
      typeof v.title === "string"
    ) {
      return { rank: i + 1, subscriberCount: v.subscriberCount, title: v.title };
    }
  }
  return null;
}
