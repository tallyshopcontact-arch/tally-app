// Lane Check pivot — title generator (paid only). Fully deterministic: no LLM
// call. Real small-channel winner titles are parsed into structural skeletons
// (artist/quoted-name/numbers stripped to placeholders), the most common
// skeletons are kept, and each is refilled with the producer's beat name, the
// lane's top co-mention, and the lane's top tags.
// No "@/..." aliases (see lib/lanes/types.ts) so this loads from both Next.js
// and plain `node scripts/*.ts`.

import type { PatternStats } from "./patterns.ts";

export interface TitleGeneratorInput {
  artistName: string;
  beatName?: string;
  patterns: PatternStats;
  /** Raw titles from lane_analyses.winner_videos — the real small-channel wins. */
  winnerTitles: string[];
  /** Shifts which skeleton/keyword-candidate index each output slot draws
   * from — paid "Regenerate" increments this client-side and re-requests.
   * Still built only from the same real winner-title skeletons/tags; this
   * just varies which valid combination is shown, never invents content. */
  offset?: number;
}

const QUOTE_RE = /["'"“”‘’].+?["'"“”‘’]/;
const STRUCTURAL_WORDS = new Set(["free", "type", "beat", "x", "and"]);
// [FREE]/(FREE) — real lanes use either convention; forcing one would fabricate
// a format this lane's actual data doesn't show. Only used when NO winner
// videos exist at all (nothing real to draw a convention from).
const DEFAULT_SKELETON = "[FREE] {artist} Type Beat | {keywords} {year}";
const CO_MENTION_WORD_RE = "[a-z0-9$&.\\-' ]{2,40}?";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapses a chained co-mention capture (e.g. "joey bada$$ x 90s boom bap",
 * an artifact of the shared title-parsing regex chaining across multiple "x"s)
 * down to just the first, real artist segment. */
export function primaryCoMentionName(raw: string): string {
  return raw.split(/\s+x\s+/i)[0].trim();
}

/** split/join instead of replace/replaceAll — a data value containing "$$"
 * (e.g. an artist name like "Joey Bada$$") gets silently corrupted by
 * String.replaceAll's special $-pattern handling when used as the replacement
 * argument (JS treats "$$" in a replacement STRING as an escaped literal "$").
 * split/join never interprets "$" specially. */
function safeReplaceAll(s: string, token: string, value: string): string {
  return s.split(token).join(value);
}

function normalizeDashes(s: string): string {
  return s.replace(/[–—]/g, "-");
}

function isPlaceholderToken(tok: string): boolean {
  return /^"?\{[a-z]+\}"?$/.test(tok);
}

function isStructuralToken(tok: string): boolean {
  if (isPlaceholderToken(tok)) return true;
  if (/^[|\-()[\]]+$/.test(tok)) return true;
  const bare = tok.replace(/[^\w{}]/g, "").toLowerCase();
  return STRUCTURAL_WORDS.has(bare);
}

/** Strips the artist name (optionally preceded by "The ") to {artist}. Must
 * run before co-mention detection — otherwise a title like "Larry June x The
 * Alchemist Type Beat" (co-mention FIRST, lane artist second — the opposite
 * convention from "MF DOOM x Joey Bada$$ Type Beat") gets misread, with the
 * real co-mention swallowed as a generic keyword and the lane's own artist
 * never placeholdered at all. */
function stripArtist(s: string, artistName: string): string {
  if (!artistName.trim()) return s;
  return s.replace(new RegExp(`(?:the\\s+)?${escapeRegExp(artistName)}`, "gi"), "{artist}");
}

/** Finds a co-mention adjacent to (already-stripped) {artist}, checking both
 * orders: "{artist} x NAME" (trailing) and "NAME x {artist}" (leading).
 * Returns the raw matched text, or null. Assumes stripArtist() already ran. */
function matchCoMention(s: string): string | null {
  const trailing = s.match(new RegExp(`\\{artist\\}\\s*(?:x|X|&|and)\\s+(${CO_MENTION_WORD_RE})(?=\\s*type\\s*beat)`, "i"));
  if (trailing) return trailing[1].trim();
  const leading = s.match(new RegExp(`(${CO_MENTION_WORD_RE})\\s+(?:x|X|&|and)\\s+\\{artist\\}`, "i"));
  if (leading) return leading[1].trim();
  return null;
}

/** Structural skeleton for one real winner title: artist/co-mention/quoted
 * name/numbers -> named placeholders. Leftover free words (genre/tag text)
 * collapse into {keywords} per contiguous run, refilled later with the lane's
 * CURRENT top tags rather than the stale words from one specific old title. */
export function extractSkeleton(rawTitle: string, artistName: string): string {
  let s = normalizeDashes(rawTitle.trim());
  s = stripArtist(s, artistName);

  const coMention = matchCoMention(s);
  if (coMention) {
    // Replace whichever order matched with a canonical "{artist} x {comention}"
    // shape — order doesn't matter for the skeleton once both are placeholders.
    s = s
      .replace(new RegExp(`\\{artist\\}\\s*(?:x|X|&|and)\\s+${escapeRegExp(coMention)}`, "i"), "{artist} x {comention}")
      .replace(new RegExp(`${escapeRegExp(coMention)}\\s+(?:x|X|&|and)\\s+\\{artist\\}`, "i"), "{comention} x {artist}");
  }

  s = s.replace(QUOTE_RE, '"{beatname}"');
  // \b\d{2,4}\b leaves "90s" intact since the trailing "s" removes the right word boundary.
  s = s.replace(/\b\d{2,4}\b/g, "{year}");

  const tokens = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (isStructuralToken(tokens[i])) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    while (i < tokens.length && !isStructuralToken(tokens[i])) i++;
    out.push("{keywords}");
  }

  return out.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** The lane's most common co-mention, derived directly from winner_videos
 * titles (bidirectional — see matchCoMention) rather than solely trusting the
 * aggregate patterns.topCoMentions field, since that field's extraction only
 * checks the trailing "{artist} x NAME" order and can self-filter the wrong
 * name on lanes using the opposite convention (falls back to it when winner
 * titles yield nothing, e.g. zero winners). */
export function deriveTopCoMention(input: TitleGeneratorInput): string | undefined {
  const counts = new Map<string, number>();
  for (const raw of input.winnerTitles) {
    const s = stripArtist(normalizeDashes(raw.trim()), input.artistName);
    const match = matchCoMention(s);
    if (!match) continue;
    const clean = primaryCoMentionName(match);
    if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  if (counts.size) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const fallback = input.patterns.topCoMentions[0]?.artist;
  return fallback ? primaryCoMentionName(fallback) : undefined;
}

function dedupeSkeletonsByFrequency(skeletons: string[]): string[] {
  const counts = new Map<string, number>();
  for (const s of skeletons) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

/** A distinct list of keyword-fill strings to cycle through: 2-tag pairs at
 * every rotation, then single tags, then empty (drops the slot). With N usable
 * tags there are only N unique PAIR rotations — e.g. exactly 2 tags gives only
 * ["a b", "b a"], so pair-reordering alone runs out after 2 slots. Widening to
 * singles and empty is what actually lets "vary using the next tags" produce
 * up to 5 distinct fills instead of endlessly re-finding the same 2 pairs. */
function buildKeywordFillCandidates(tags: string[]): string[] {
  if (!tags.length) return [""];
  const candidates: string[] = [];
  for (let start = 0; start < tags.length; start++) {
    const combo = `${tags[start % tags.length]} ${tags[(start + 1) % tags.length]}`.trim();
    if (!candidates.includes(combo)) candidates.push(combo);
  }
  for (const t of tags) {
    if (!candidates.includes(t)) candidates.push(t);
  }
  candidates.push("");
  return candidates;
}

/** A tag is only usable as keyword filler if its text is actually evidenced
 * in a real winner title — not just present as loosely-related YouTube tag
 * metadata (which can include adjacent-but-contradicting genre words, e.g. a
 * "West Coast Soul" tag on a boom-bap lane's winner video). This can and does
 * legitimately leave zero usable keywords for a lane whose real titles are
 * bare (artist + co-mention + beat name, no descriptive words) — the {keywords}
 * slot then just contributes nothing rather than inventing content. */
function tagAppearsInWinnerTitles(tag: string, winnerTitles: string[]): boolean {
  const cleaned = tag.toLowerCase().trim();
  if (!cleaned) return false;
  return winnerTitles.some((t) => t.toLowerCase().includes(cleaned));
}

function fillSkeleton(
  skeleton: string,
  opts: { artistName: string; beatName?: string; comention?: string; keywords: string; year: string }
): string {
  let out = skeleton;

  if (out.includes("{beatname}")) {
    out = opts.beatName
      ? safeReplaceAll(out, "{beatname}", opts.beatName)
      : out.replace(/\s*"\{beatname\}"\s*/g, " ").replace(/\{beatname\}/g, "");
  }

  if (out.includes("{comention}")) {
    if (opts.comention) {
      out = safeReplaceAll(out, "{comention}", opts.comention);
    } else {
      // Drop the connector on whichever side it fell — "{artist} x {comention}" or "{comention} x {artist}"
      out = out
        .replace(/\s*\b(x|X|&|and)\s+\{comention\}/gi, "")
        .replace(/\{comention\}\s+(x|X|&|and)\s*/gi, "");
    }
  }

  out = safeReplaceAll(out, "{keywords}", opts.keywords);
  out = safeReplaceAll(out, "{year}", opts.year);
  out = safeReplaceAll(out, "{artist}", opts.artistName);

  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+-\s*\|/g, " |") // dangling connector left when a dropped quoted slot backed onto "|"
    .replace(/\s+-\s*$/g, "")     // dangling connector left when a dropped quoted slot was at the end
    .replace(/\s+\|/g, " |")
    .replace(/\|\s*\|/g, "|")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .trim();
}

/** Tags stored as full scraped phrases (e.g. "larry june type beat") would
 * duplicate the skeleton's own literal "Type Beat" — that part is stripped —
 * then only tags actually evidenced in a real winner title are kept (see
 * tagAppearsInWinnerTitles), so a loosely-related/contradicting tag (e.g. a
 * "West Coast Soul" tag on a boom-bap lane) never shows up as filler as if it
 * were an observed convention. Exported so callers can show their work. */
export function deriveUsableKeywordTags(input: TitleGeneratorInput): string[] {
  return input.patterns.topTags
    .map((t) => t.tag.replace(/\btype\s*beat\b/gi, "").trim())
    .filter(Boolean)
    .filter((tag) => tagAppearsInWinnerTitles(tag, input.winnerTitles));
}

/** Top 5 skeletons (by frequency among this lane's real small-channel winners),
 * each refilled with the producer's beat name, the lane's top co-mention, and
 * the lane's top tags. Final dedup runs on the COMPLETED titles (not just
 * skeletons/keyword pairs) — two different skeletons can still fill to the
 * same string, and simple pair-reordering runs out fast (2 tags -> only 2
 * unique pair rotations), so buildKeywordFillCandidates widens to singles and
 * empty before this ever has to accept a real duplicate. */
export function generateLaneTitles(input: TitleGeneratorInput): string[] {
  let pool = dedupeSkeletonsByFrequency(
    input.winnerTitles.map((t) => extractSkeleton(t, input.artistName))
  ).slice(0, 5);
  if (!pool.length) pool = [DEFAULT_SKELETON];

  // A skeleton gets reused across multiple output slots when fewer than 5
  // unique ones exist. If it has no {keywords} gap to vary, reuse would
  // otherwise produce byte-identical titles — give it one so keyword-cycling
  // has something to change.
  if (pool.length < 5) {
    pool = pool.map((s) => (s.includes("{keywords}") ? s : `${s} | {keywords}`));
  }

  const comention = deriveTopCoMention(input);
  const keywordCandidates = buildKeywordFillCandidates(deriveUsableKeywordTags(input));
  const year = String(new Date().getFullYear());
  const offset = input.offset ?? 0;

  const results: string[] = [];
  for (let i = 0; i < 5; i++) {
    const skeleton = pool[(i + offset) % pool.length];
    let candidate = "";
    let attempt = 0;
    do {
      const keywords = keywordCandidates[(i + offset + attempt) % keywordCandidates.length];
      candidate = fillSkeleton(skeleton, { artistName: input.artistName, beatName: input.beatName, comention, keywords, year });
      attempt++;
    } while (results.includes(candidate) && attempt < keywordCandidates.length);
    results.push(candidate);
  }
  return results;
}

// ── Deterministic scoring — verifies the output against the same pattern data
// used to build it, so a skeleton/fill bug shows up as a low score instead of
// shipping silently. ──

export interface ScoredTitle {
  title: string;
  score: number;
  explanation: string;
}

const FREE_PREFIX_RE = /^(?:\[free\]|\(free\))/i;

export function scoreGeneratedTitle(title: string, input: TitleGeneratorInput): ScoredTitle {
  const lower = title.toLowerCase();
  const reasons: string[] = [];
  const misses: string[] = [];
  let score = 0;

  const prefixMatch = title.trim().match(FREE_PREFIX_RE);
  const formatOk = !!prefixMatch && lower.includes(input.artistName.toLowerCase()) && /type\s*beat/i.test(title);
  if (formatOk) {
    score += 25;
    reasons.push(`opens with ${prefixMatch![0]}, this lane's real prefix convention`);
  } else {
    misses.push("doesn't fully match the lane's title format");
  }

  const topCoMention = deriveTopCoMention(input);
  if (!topCoMention) {
    score += 25;
  } else if (lower.includes(topCoMention.toLowerCase())) {
    score += 25;
    reasons.push(`names ${topCoMention}, the lane's top co-mention`);
  } else {
    misses.push(`doesn't mention ${topCoMention}`);
  }

  if (!input.beatName) {
    score += 25;
  } else if (lower.includes(input.beatName.toLowerCase())) {
    score += 25;
    reasons.push(`includes your beat name "${input.beatName}"`);
  } else {
    misses.push(`missing your beat name "${input.beatName}"`);
  }

  // Signed, not absolute — lets the explanation say over/under with the real
  // numbers, which is also what actually differentiates otherwise-similar
  // titles that share every other trait (same co-mention/beat name/format).
  const signedDiff = title.length - input.patterns.medianTitleLength;
  const absDiff = Math.abs(signedDiff);
  const lengthScore = absDiff <= 10 ? 25 : absDiff <= 25 ? 15 : 5;
  score += lengthScore;
  if (lengthScore === 25) {
    reasons.push(`at ${title.length} characters, right in line with this lane's typical ${input.patterns.medianTitleLength}`);
  } else {
    const direction = signedDiff > 0 ? "over" : "under";
    misses.push(`${title.length} characters is ${absDiff} ${direction} this lane's typical ${input.patterns.medianTitleLength}`);
  }

  // Two titles can tie on every scored criterion (same score, same qualitative
  // traits) if they use the same keywords in a different order — nothing above
  // differs since order isn't scored. Naming the actual trailing keyword text
  // (or its absence) is real, title-specific content that's never repeated
  // identically unless the keyword fill is genuinely byte-identical too.
  const pipeIndex = title.lastIndexOf("|");
  const trailingKeywords = pipeIndex !== -1 ? title.slice(pipeIndex + 1).trim() : "";
  if (trailingKeywords) {
    reasons.push(`layers in "${trailingKeywords}" from this lane's real tags`);
  }

  const explanation = reasons.length
    ? `${reasons.join(", ")}${misses.length ? ` — but ${misses.join(" and ")}` : ""}.`
        .replace(/^./, (c) => c.toUpperCase())
    : `${misses.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());

  return { title, score, explanation };
}

export function scoreGeneratedTitles(titles: string[], input: TitleGeneratorInput): ScoredTitle[] {
  return titles.map((t) => scoreGeneratedTitle(t, input));
}
