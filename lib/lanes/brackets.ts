// Shared subscriber-bracket selection — the "3 gallery videos" (smallest
// channel, mid-sized channel, established channel winner) that both
// TopVideosThisLane and the title/tag generator draw from. Factored out so
// both consumers are guaranteed to pick the exact same 3 videos.

export interface BracketVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelId?: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  publishedAt: string;
  /** Raw YouTube Studio tags for this video. Optional because lane_analyses
   * rows written before this field existed won't have it until re-analyzed. */
  tags?: string[];
}

export interface Bracket {
  key: string;
  label: string;
  emptyLabel: string;
  test: (subs: number) => boolean;
}

export const BRACKETS: Bracket[] = [
  { key: "small", label: "Smallest channel winning in this lane", emptyLabel: "smallest-channel", test: (s) => s < 1000 },
  { key: "mid", label: "Mid-sized channel winning in this lane", emptyLabel: "mid-sized-channel", test: (s) => s >= 1000 && s < 10000 },
  { key: "established", label: "Established channel in this lane", emptyLabel: "established-channel", test: (s) => s >= 10000 },
];

// Views-per-day, not lifetime viewCount — so "winning" means winning right
// now, not just having had more time to accumulate views.
export function viewsPerDay(v: { viewCount: number; publishedAt: string }): number {
  const days = Math.max((Date.now() - new Date(v.publishedAt).getTime()) / 86_400_000, 1);
  return v.viewCount / days;
}

export function topInBracket<T extends BracketVideo>(videos: T[], test: (subs: number) => boolean): T | null {
  const matches = videos.filter((v) => test(v.subscriberCount));
  if (!matches.length) return null;
  return [...matches].sort((a, b) => viewsPerDay(b) - viewsPerDay(a))[0];
}

/** The 3 bracket winners, in BRACKETS order (small, mid, established).
 * A bracket with no matching video returns null in its slot. */
export function selectBracketWinners<T extends BracketVideo>(videos: T[]): (T | null)[] {
  return BRACKETS.map((b) => topInBracket(videos, b.test));
}
