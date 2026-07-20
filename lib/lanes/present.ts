// Lane Check pivot — shapes a Lane + its latest LaneAnalysis into the API
// response shapes shared by /api/lane-check/run and /api/lane-check/report,
// so the free/paid and locked/unlocked rules live in exactly one place.

import type { Lane, LaneAnalysis } from "./types";
import { computeStatus, type LaneStatus } from "./scoring";

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
}

/** Score + status + a one-line, data-grounded verdict — never gated. This is
 * what "locked" lanes show forever, and what every lane shows pre-unlock. */
export function summarizeLane(lane: Lane, analysis: LaneAnalysis | null): LaneSummary {
  if (!analysis) {
    return { laneId: lane.id, laneSlug: lane.slug, displayName: lane.display_name, status: "queued" };
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

/** Full patterns/galleries. Co-mentions are paid-only per the brief — stripped
 * from the patterns object (not the whole lane) when includeCoMentions is false. */
export function fullLaneDetail(
  lane: Lane,
  analysis: LaneAnalysis,
  includeCoMentions: boolean
): FullLaneDetail {
  const summary = summarizeLane(lane, analysis);
  const patternsRecord = analysis.patterns as Record<string, unknown>;
  const patterns = includeCoMentions
    ? patternsRecord
    : { ...patternsRecord, topCoMentions: [] };

  return {
    ...summary,
    patterns,
    winnerVideos: analysis.winner_videos,
    topVideos: analysis.top_videos,
    rawMetrics: analysis.raw_metrics,
  };
}
