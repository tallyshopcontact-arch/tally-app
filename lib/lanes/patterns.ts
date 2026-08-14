// Lane Check pivot — deterministic pattern analysis over SMALL-CHANNEL winners
// only (never big channels — their success comes from audience, not packaging).
// All countable facts, no judgments. See LANE-CHECK-BRIEF.md "Pattern analysis".

import type { VideoDetails } from "./youtube";

const FREE_PREFIX_RE = /^\s*[[(]?\s*free\s*[\])]?/i;
const QUOTED_NAME_RE = /["'“”‘’].+?["'“”‘’]/;
const CO_MENTION_RE = /\b(?:x|X|&|and)\s+([a-z0-9$&.\-' ]{2,30}?)\s*type\s*beat/i;

// Stripped before grouping/counting so "the alchemist" and "alchemist" merge,
// and so a lane's own name showing up via "X x {SameArtist} Type Beat" title
// spam doesn't get counted as a co-mention of someone else.
const COMMON_PREFIXES = ["the ", "dj ", "mc ", "lil ", "young "];

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Exported for lib/lanes/insights.ts, which reuses this exact extraction/
// normalization so its co-mention-derived candidates never disagree with the
// coMentionPct/topCoMentions computed below.
export function normalizeArtistName(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  for (const prefix of COMMON_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).trim();
      break;
    }
  }
  return s;
}

export function extractCoMention(title: string): string | null {
  const m = title.match(CO_MENTION_RE);
  if (!m) return null;
  return m[1].trim().toLowerCase() || null;
}

// ── cleanArtistName — moved here from lib/lanes/insights.ts ─────────────
// It's a thin wrapper over normalizeArtistName (above), so it belongs next
// to it rather than in insights.ts, which imports normalizeArtistName FROM
// here — insights.ts defining cleanArtistName meant nicheMatch.ts (which
// needs both cleanArtistName and, as of this file's co-mention filter below,
// patterns-level helpers) would have had to import from both insights.ts
// AND patterns.ts, with insights.ts itself importing from patterns.ts —
// one step from a real cycle. Callers: lib/lanes/insights.ts,
// lib/lanes/nicheMatch.ts, lib/reports/channelAnalyzer.ts, scripts/seed-watchlist.ts.

/** patterns.ts's own CO_MENTION_RE can chain through multiple "x"s on a
 * title ("MF DOOM x Joey Bada$$ x 90s Boom Bap Type Beat") and capture
 * "joey bada$$ x 90s boom bap" as one blob instead of just the real artist.
 * Collapses that down to the first, real segment. */
function primaryCoMentionName(raw: string): string {
  return raw.split(/\s+x\s+/i)[0].trim();
}

/** Normalizes AND collapses any "x"-chaining artifact in one step — every
 * co-mention artist identity anywhere in this codebase (extracted from a
 * title, or read back from already-stored patterns.topCoMentions data)
 * should go through this so a chained name can never slip into a sentence
 * or silently fail to match against a cleaned name on the other side. Unlike
 * cleanCoMention below, this never rejects — it's the general-purpose
 * "make this string into a plausible display name" utility, used well
 * beyond just co-mention candidates (e.g. cleaning a lane's own display
 * name before a slug lookup). */
export function cleanArtistName(raw: string): string {
  return normalizeArtistName(primaryCoMentionName(raw));
}

// ── Type-beat video validation ───────────────────────────────────────────
// Shared by app/api/admin/scores/outliers/route.ts (outlier video
// detection) and analyzeLaneForMonth in lib/lanes/pipeline.ts (the
// /admin/scores batch scorer's own metrics) — both need "is this actually a
// producer's type-beat upload naming this artist," and both must agree on
// what that means, so this lives in exactly one place rather than being
// reimplemented per caller.

/** Filter 1 — a real producer type-beat upload, not an artist's own
 * release, a remake, or a sample flip that merely surfaced in search
 * results. Deliberately does NOT match "instrumental"/"inst." — those
 * catch far more non-type-beat videos than they exclude. */
export function isTypeBeatTitle(title: string): boolean {
  return /type\s?beat/i.test(title);
}

/** Filter 2 — the target artist's own (cleanArtistName-normalized) name
 * must appear in the title, not just a co-mentioned artist's — prevents
 * cross-niche contamination where a video ranks/counts for this lane
 * purely because it co-mentions the artist in passing. */
export function titleContainsArtist(title: string, artistName: string): boolean {
  const normalizedArtist = cleanArtistName(artistName);
  if (!normalizedArtist) return false;
  return title.toLowerCase().includes(normalizedArtist);
}

// ── Co-mention hard-reject filter ────────────────────────────────────────
// A raw CO_MENTION_RE capture is frequently not a real artist at all: a
// genre/style word used as if it were one ("x West Coast Type Beat"), a
// leaked descriptor ("x Kendrick Lamar Sample Type Beat" capturing "kendrick
// lamar sample"), or — after cleanArtistName's chain-collapse — the lane's
// own name re-surfacing from a chained capture. Applied inside
// analyzePatterns below so a freshly-analyzed lane can never store a dirty
// co-mention again, and reused by lib/lanes/nicheMatch.ts's title-format
// builder as a second, point-of-use check for any already-stored data that
// predates this fix (see scripts/reclean-lanes.ts for retroactively
// cleaning existing rows in place).

// Not exhaustive by construction — genres multiply — but covers the common
// ones actually seen in real "type beat" titles across the genres this app
// tracks. Multi-word phrases are matched as whole phrases (see
// containsPhrase), not simple substrings, so this only needs the canonical
// form of each.
const GENRE_STYLE_WORDS = [
  "west coast", "east coast", "south", "southern", "dirty south", "midwest",
  "boom bap", "boombap", "boom-bap", "trap", "drill", "uk drill", "ny drill",
  "chicago drill", "brooklyn drill", "lo-fi", "lofi", "lo fi", "jazz rap",
  "jazz", "rnb", "r&b", "afrobeats", "afrobeat", "afropop", "amapiano", "melodic", "emo rap",
  "sad rap", "underground", "old school", "new school", "phonk", "hyperpop",
  "cloud rap", "conscious rap", "gospel rap", "christian rap", "grime",
  "uk rap", "hip hop", "hiphop", "rap", "gospel", "country rap", "pop rap",
  "alternative", "indie", "90s", "80s", "2000s", "y2k", "g funk", "gfunk", "g-funk",
];

const CO_MENTION_BANNED_PHRASES = ["sample", "type beat", "instrumental", "prod", "free", "bpm", "ft", "feat", "featuring"];

const GENERIC_SINGLE_WORDS = new Set([
  "type", "beat", "beats", "music", "vibes", "instru", "loop", "flip", "remix", "cover", "storytelling",
]);

function escapeRegExpForCoMention(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase containment, not raw substring — "west coast" matches
 * inside "90s west coast" but "soul" does NOT match inside "soulja boy" (a
 * real artist name), since the boundary requires a non-letter/digit on both
 * sides of the match. Same lookaround approach as lib/lanes/nicheMatch.ts's
 * title matcher, for the same reason: \b itself breaks around punctuation
 * like the "$$" in "Joey Bada$$." */
function containsPhrase(haystack: string, phrase: string): boolean {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExpForCoMention(phrase)}(?![a-z0-9])`, "i");
  return re.test(haystack);
}

function isPlausibleCoMentionToken(candidate: string): boolean {
  if (!candidate) return false;
  if (/^\d+$/.test(candidate)) return false; // pure numbers
  if (candidate.length < 2) return false; // single character
  const words = candidate.split(" ").filter(Boolean);
  if (words.length === 1 && GENERIC_SINGLE_WORDS.has(words[0])) return false;
  return true;
}

function isRejectedCoMention(candidate: string, primaryNormalized: string): boolean {
  if (!isPlausibleCoMentionToken(candidate)) return true;
  for (const genreWord of GENRE_STYLE_WORDS) {
    if (containsPhrase(candidate, genreWord)) return true;
  }
  for (const banned of CO_MENTION_BANNED_PHRASES) {
    if (containsPhrase(candidate, banned)) return true;
  }
  if (primaryNormalized && containsPhrase(candidate, primaryNormalized)) return true;
  return false;
}

/** The full pipeline a raw CO_MENTION_RE capture goes through before it's
 * trusted as a real co-mentioned artist: reject-filter on the raw form,
 * chain-collapse + normalize (cleanArtistName), then reject-filter again —
 * the cleaned form can newly match a genre word or the primary artist even
 * when the raw chained blob didn't (e.g. "joey bada$$ x 90s boom bap"
 * collapses to "joey bada$$", which only THEN equals the primary artist on
 * that lane). Returns null when the candidate should be discarded entirely,
 * never a fabricated fallback. Exported so lib/lanes/nicheMatch.ts's
 * title-format builder and scripts/reclean-lanes.ts clean a stored
 * candidate exactly the same way this does at analysis time. */
export function cleanCoMention(raw: string, primaryArtistName: string): string | null {
  const primaryNormalized = normalizeArtistName(primaryArtistName);
  const rawNormalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (isRejectedCoMention(rawNormalized, primaryNormalized)) return null;

  const cleaned = cleanArtistName(raw);
  if (isRejectedCoMention(cleaned, primaryNormalized)) return null;

  return cleaned;
}

export interface CoMentionStat {
  artist: string;
  count: number;
  pct: number;
}

/** Shared by analyzePatterns (live pipeline) and scripts/reclean-lanes.ts
 * (retroactive cleanup of already-stored rows) — both just need "co-mention
 * stats from a set of winner titles," and both must compute them exactly
 * the same way so a recleaned row and a freshly-analyzed one can't disagree.
 * Takes titles only (not full VideoDetails) since that's all either caller
 * actually has: reclean-lanes.ts's stored winner_videos data doesn't carry
 * every VideoDetails field (no durationSeconds, in particular). */
export function recomputeCoMentions(
  winnerTitles: string[],
  laneArtistName: string
): { topCoMentions: CoMentionStat[]; coMentionPct: number } {
  const n = winnerTitles.length;
  if (n === 0) return { topCoMentions: [], coMentionPct: 0 };

  const coMentions = winnerTitles
    .map(extractCoMention)
    .filter((x): x is string => !!x)
    .map((raw) => cleanCoMention(raw, laneArtistName))
    .filter((name): name is string => !!name);

  const coMentionCounts = new Map<string, number>();
  for (const artist of coMentions) coMentionCounts.set(artist, (coMentionCounts.get(artist) ?? 0) + 1);
  const topCoMentions: CoMentionStat[] = [...coMentionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([artist, count]) => ({ artist, count, pct: Math.round((count / n) * 100) }));

  return { topCoMentions, coMentionPct: Math.round((coMentions.length / n) * 100) };
}

export interface TagStat {
  tag: string;
  count: number;
}

export interface PatternStats {
  winnerCount: number;
  freePrefixPct: number;
  quotedNamePct: number;
  coMentionPct: number;
  topCoMentions: CoMentionStat[];
  medianTitleLength: number;
  medianDurationSeconds: number;
  medianTagCount: number;
  topTags: TagStat[];
  empty: boolean; // true when zero small-channel winners were found
}

export function analyzePatterns(winnerVideos: VideoDetails[], laneArtistName: string): PatternStats {
  const n = winnerVideos.length;
  if (n === 0) {
    return {
      winnerCount: 0,
      freePrefixPct: 0,
      quotedNamePct: 0,
      coMentionPct: 0,
      topCoMentions: [],
      medianTitleLength: 0,
      medianDurationSeconds: 0,
      medianTagCount: 0,
      topTags: [],
      empty: true,
    };
  }

  const freeCount = winnerVideos.filter((v) => FREE_PREFIX_RE.test(v.title)).length;
  const quotedCount = winnerVideos.filter((v) => QUOTED_NAME_RE.test(v.title)).length;

  const { topCoMentions, coMentionPct } = recomputeCoMentions(
    winnerVideos.map((v) => v.title),
    laneArtistName
  );

  const tagCounts = new Map<string, number>();
  for (const v of winnerVideos) {
    for (const tag of v.tags) {
      const key = tag.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
  }
  // 25, not a smaller display-sized number — this is the raw extraction pool
  // that both the free tag cap (15) and the paid "full list" in
  // lib/lanes/present.ts draw from; capping it near the display size would
  // make free and paid identical whenever a lane has more than a handful of
  // distinct tags across its winners.
  const topTags: TagStat[] = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([tag, count]) => ({ tag, count }));

  // Diagnostic only — the median calculation itself is unchanged. Logs every
  // winner video's real duration (longest first) so a skewed
  // medianDurationSeconds (e.g. from an extended version or a full mixtape
  // slipping into the small-channel winner pool) is visible in server logs
  // without having to re-derive it after the fact — durationSeconds isn't
  // persisted anywhere past this point (GalleryVideo has no duration field).
  const sortedByDuration = [...winnerVideos].sort((a, b) => b.durationSeconds - a.durationSeconds);
  console.log(
    `[patterns] ${laneArtistName} duration inputs (n=${n}, median will be ${Math.round(median(winnerVideos.map((v) => v.durationSeconds)))}s):`
  );
  for (const v of sortedByDuration) {
    console.log(`  ${v.durationSeconds}s (${Math.floor(v.durationSeconds / 60)}:${String(v.durationSeconds % 60).padStart(2, "0")}) — "${v.title}"`);
  }

  return {
    winnerCount: n,
    freePrefixPct: Math.round((freeCount / n) * 100),
    quotedNamePct: Math.round((quotedCount / n) * 100),
    coMentionPct,
    topCoMentions,
    medianTitleLength: Math.round(median(winnerVideos.map((v) => v.title.length))),
    medianDurationSeconds: Math.round(median(winnerVideos.map((v) => v.durationSeconds))),
    medianTagCount: Math.round(median(winnerVideos.map((v) => v.tags.length))),
    topTags,
    empty: false,
  };
}
