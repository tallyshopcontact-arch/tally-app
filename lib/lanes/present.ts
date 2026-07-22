// Lane Check pivot — shapes a Lane + its latest LaneAnalysis into the API
// response shapes shared by /api/lane-check/run and /api/lane-check/report,
// so the free/paid and locked/unlocked rules live in exactly one place.

import type { Lane, LaneAnalysis } from "./types";
import { computeStatus, type LaneStatus } from "./scoring";
import type { TrendingArtist } from "./trending";
import type { BestOpenLane } from "./recommendLane";

export interface LaneSummary {
  laneId: string;
  laneSlug: string;
  displayName: string;
  status: "ready" | "queued";
  opportunity?: number;
  statusColor?: LaneStatus;
  verdict?: string;
  demand?: number;
  saturation?: number;
  winnability?: number;
  momentum?: number | null;
  /** Set only when a queued lane's absence is explained (quota exhausted or
   * analysis failed) rather than just "never requested yet". */
  note?: string;
}

/** Score + status + a one-line, data-grounded verdict — never gated. This is
 * what "locked" lanes show forever, and what every lane shows pre-unlock. */
export function summarizeLane(lane: Lane, analysis: LaneAnalysis | null, note?: string): LaneSummary {
  if (!analysis) {
    return {
      laneId: lane.id,
      laneSlug: lane.slug,
      displayName: lane.display_name,
      status: "queued",
      ...(note ? { note } : {}),
    };
  }
  return {
    laneId: lane.id,
    laneSlug: lane.slug,
    displayName: lane.display_name,
    status: "ready",
    opportunity: analysis.opportunity,
    statusColor: computeStatus(analysis.opportunity),
    verdict: `${analysis.winnability}% of the top 20 videos in this lane come from small channels.`,
    demand: analysis.demand,
    saturation: analysis.saturation,
    winnability: analysis.winnability,
    momentum: analysis.momentum,
  };
}

export interface FullLaneDetail extends LaneSummary {
  patterns: unknown;
  winnerVideos: unknown[];
  topVideos: unknown[];
  rawMetrics: unknown;
}

const FREE_TAG_CAP = 15;

/** Full patterns/galleries. Co-mentions are paid-only per the brief — stripped
 * from the patterns object (not the whole lane) when includeCoMentions is
 * false. That same flag marks the non-paid view, so the tag list is also
 * capped here (not just in the UI) — free-tier caps must be enforced
 * server-side, never CSS-hidden. */
export function fullLaneDetail(
  lane: Lane,
  analysis: LaneAnalysis,
  includeCoMentions: boolean
): FullLaneDetail {
  const summary = summarizeLane(lane, analysis);
  const patternsRecord = analysis.patterns as Record<string, unknown>;
  const patterns = includeCoMentions
    ? patternsRecord
    : {
        ...patternsRecord,
        topCoMentions: [],
        topTags: ((patternsRecord.topTags as unknown[]) ?? []).slice(0, FREE_TAG_CAP),
      };

  return {
    ...summary,
    patterns,
    winnerVideos: analysis.winner_videos,
    topVideos: analysis.top_videos,
    rawMetrics: analysis.raw_metrics,
  };
}

export interface RankedLane {
  lane: Lane;
  analysis: LaneAnalysis | null;
  /** Explains an absent analysis (quota exhausted / analysis failed), vs. a
   * lane that's simply never been requested before. */
  note?: string;
}

/** Shared free/paid/top-lane shaping used by both /api/lane-check/run and
 * /api/lane-check/report, so the rules live in exactly one place. `ranked`
 * must already be sorted by opportunity desc (missing analyses last).
 * `revealTopLane` gates whether a non-paid caller sees the top lane's full
 * kit inline: true for /report (caller already proved ownership via auth or
 * a magic-link token) and for authenticated /run callers; false for
 * anonymous /run callers, who still need the email gate first. */
export function shapeLaneResults(
  ranked: RankedLane[],
  isPaid: boolean,
  revealTopLane: boolean
): (FullLaneDetail | LaneSummary)[] {
  return ranked.map(({ lane, analysis, note }, i) => {
    if (!analysis) return summarizeLane(lane, null, note);
    if (isPaid) return fullLaneDetail(lane, analysis, true);
    const isTopLane = i === 0;
    if (isTopLane && revealTopLane) return fullLaneDetail(lane, analysis, false);
    return summarizeLane(lane, analysis);
  });
}

/** Caps "Also consider" (merged trending co-mentions + best open lane) the
 * same way the client renders it — free: 1 suggestion, preferring a scored
 * open lane over a bare trending name. Enforced here, not just by slicing in
 * the UI, so the free-tier response body never contains more than it should. */
export function capAlsoConsider(
  trendingArtists: TrendingArtist[],
  bestOpenLane: BestOpenLane | null,
  isPaid: boolean
): { trendingArtists: TrendingArtist[]; bestOpenLane: BestOpenLane | null } {
  if (isPaid) return { trendingArtists, bestOpenLane };
  if (bestOpenLane) return { trendingArtists: [], bestOpenLane };
  return { trendingArtists: trendingArtists.slice(0, 1), bestOpenLane: null };
}
