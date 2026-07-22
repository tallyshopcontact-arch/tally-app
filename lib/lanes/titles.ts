// Upload Kit reframe — title/tag generation, rebuilt as pure string
// manipulation over the exact 3 videos already selected for the
// TopVideosThisLane gallery (smallest / mid-sized / established channel
// winner). No skeleton extraction, no scoring, no additional YouTube calls,
// no LLM — every title is a real winning title with the beat name dropped
// in, and every tag is a real tag pulled straight from those 3 videos.
// No "@/..." aliases (see lib/lanes/types.ts) so this loads from both
// Next.js and plain `node scripts/*.ts`.

import { selectBracketWinners, BRACKETS, type BracketVideo } from "./brackets.ts";

const QUOTE_RE = /["'"“”‘’].+?["'"“”‘’]/;

const BRACKET_TITLE_LABELS = ["Smallest channel format", "Mid-sized channel format", "Established channel format"];

export interface GeneratedTitle {
  label: string;
  title: string;
  sourceViewCount: number;
  sourceSubscriberCount: number;
}

export interface GeneratedTag {
  tag: string;
  count: number;
}

/** split/join instead of replace — a beat name containing "$" (rare, but
 * artist/beat names do this — e.g. "Joey Bada$$") gets silently corrupted by
 * String.replace's special $-pattern handling when used as the replacement
 * argument. split/join never interprets "$" specially. */
function safeReplace(s: string, re: RegExp, value: string): string {
  const match = s.match(re);
  if (!match) return s;
  return s.slice(0, match.index) + value + s.slice((match.index ?? 0) + match[0].length);
}

/** Drops the producer's beat name into a real winning title: replaces the
 * existing quoted name if there is one, otherwise inserts it before the
 * first "|" or appends it at the end. If no beat name was given, the title
 * is returned completely unchanged — we only ever touch it when we have
 * something real to put there. */
export function applyBeatName(rawTitle: string, beatName: string | null | undefined): string {
  const name = beatName?.trim();
  if (!name) return rawTitle;

  const quoted = `"${name}"`;
  if (QUOTE_RE.test(rawTitle)) {
    return safeReplace(rawTitle, QUOTE_RE, quoted);
  }

  const pipeIndex = rawTitle.indexOf("|");
  if (pipeIndex !== -1) {
    const before = rawTitle.slice(0, pipeIndex).trim();
    const after = rawTitle.slice(pipeIndex + 1).trim();
    return after ? `${before} ${quoted} | ${after}` : `${before} ${quoted}`;
  }

  return `${rawTitle.trim()} ${quoted}`;
}

/** One title per bracket winner (up to 3), each the real winning title from
 * that bracket with the producer's beat name dropped in. A bracket with no
 * winner is simply omitted — never backfilled with an invented title. */
export function generateGalleryTitles<T extends BracketVideo>(
  topVideos: T[],
  beatName: string | null | undefined
): GeneratedTitle[] {
  const winners = selectBracketWinners(topVideos);
  const results: GeneratedTitle[] = [];
  winners.forEach((video, i) => {
    if (!video) return;
    results.push({
      label: BRACKET_TITLE_LABELS[i],
      title: applyBeatName(video.title, beatName),
      sourceViewCount: video.viewCount,
      sourceSubscriberCount: video.subscriberCount,
    });
  });
  return results;
}

const MAX_TAGS = 25;

/** All tags from the same bracket-winner videos (up to 3), combined and
 * deduped, sorted by how many of those videos share the tag (ties broken by
 * first-seen order across small -> mid -> established). Never draws from any
 * wider pool — a video missing `tags` (pre-dates this field) just
 * contributes nothing. */
export function generateGalleryTags<T extends BracketVideo>(topVideos: T[]): GeneratedTag[] {
  const winners = selectBracketWinners(topVideos).filter((v): v is T => !!v);
  const counts = new Map<string, number>();
  for (const v of winners) {
    const seenInThisVideo = new Set<string>();
    for (const rawTag of v.tags ?? []) {
      // Real YouTube tags occasionally contain stray internal whitespace
      // (including literal newlines) from creator input — collapse it so
      // dedup actually matches and the tag renders as one clean pill.
      const tag = rawTag.replace(/\s+/g, " ").trim().toLowerCase();
      if (!tag || seenInThisVideo.has(tag)) continue;
      seenInThisVideo.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS)
    .map(([tag, count]) => ({ tag, count }));
}

export { BRACKET_TITLE_LABELS, BRACKETS };
