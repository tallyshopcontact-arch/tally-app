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

export interface CoMentionStat {
  artist: string;
  count: number;
  pct: number;
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

  const laneNameNormalized = normalizeArtistName(laneArtistName);
  const coMentions = winnerVideos
    .map((v) => extractCoMention(v.title))
    .filter((x): x is string => !!x)
    .map(normalizeArtistName)
    .filter((name) => name && name !== laneNameNormalized);
  const coMentionCounts = new Map<string, number>();
  for (const artist of coMentions) coMentionCounts.set(artist, (coMentionCounts.get(artist) ?? 0) + 1);
  const topCoMentions: CoMentionStat[] = [...coMentionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([artist, count]) => ({ artist, count, pct: Math.round((count / n) * 100) }));

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
    coMentionPct: Math.round((coMentions.length / n) * 100),
    topCoMentions,
    medianTitleLength: Math.round(median(winnerVideos.map((v) => v.title.length))),
    medianDurationSeconds: Math.round(median(winnerVideos.map((v) => v.durationSeconds))),
    medianTagCount: Math.round(median(winnerVideos.map((v) => v.tags.length))),
    topTags,
    empty: false,
  };
}
