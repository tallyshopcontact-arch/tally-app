// Lane Check pivot — shapes a Lane + its latest LaneAnalysis into the API
// response shapes shared by /api/lane-check/run and /api/lane-check/report,
// so the free/paid and locked/unlocked rules live in exactly one place.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane, LaneAnalysis } from "./types";
import { computeStatus, type LaneStatus } from "./scoring";
import type { TrendingArtist } from "./trending";
import type { BestOpenLane } from "./recommendLane";
import { buildLaneInsights, type InsightType, type LaneInsight } from "./insights";

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
  insights: LaneInsight[];
}

const FREE_TAG_CAP = 15;

/** Free tier gets exactly one insight, in this priority order — both are
 * motivating without being tactically actionable (unlike mood_split,
 * differential_tags, winning_co_mention, or underused_pairing, which give
 * away the actual packaging move a paid producer would use). Falls back to
 * small_channel_winnability when winner_channel_age isn't available for the
 * lane (e.g. analyzed before that insight shipped — see insights.ts). */
const FREE_INSIGHT_PRIORITY: InsightType[] = ["winner_channel_age", "small_channel_winnability"];

/** Same free/paid split point as everything else in this file — reuses the
 * includeCoMentions flag callers already pass rather than adding a second
 * gating mechanism. */
function selectInsightsForTier(all: LaneInsight[], includeCoMentions: boolean): LaneInsight[] {
  if (includeCoMentions) return all;
  const byType = new Map(all.map((i) => [i.type, i]));
  for (const type of FREE_INSIGHT_PRIORITY) {
    const found = byType.get(type);
    if (found) return [found];
  }
  return [];
}

/** Full patterns/galleries. Co-mentions are paid-only per the brief — stripped
 * from the patterns object (not the whole lane) when includeCoMentions is
 * false. That same flag marks the non-paid view, so the tag list is also
 * capped here (not just in the UI) — free-tier caps must be enforced
 * server-side, never CSS-hidden. `allInsights` is the lane's full computed
 * list (from buildLaneInsights) — this function does the tier selection, not
 * the caller, so free-tier enforcement stays in one place alongside tags/
 * co-mentions. */
export function fullLaneDetail(
  lane: Lane,
  analysis: LaneAnalysis,
  includeCoMentions: boolean,
  allInsights: LaneInsight[]
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
    insights: selectInsightsForTier(allInsights, includeCoMentions),
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
 * anonymous /run callers, who still need the email gate first.
 *
 * Async (unlike the rest of this file) because insights are computed via
 * lib/lanes/insights.ts's buildLaneInsights, not read straight off the
 * already-loaded analysis row — only called for lanes that will actually
 * render full detail, so locked/queued lanes don't pay for it. */
export async function shapeLaneResults(
  supabase: SupabaseClient,
  ranked: RankedLane[],
  isPaid: boolean,
  revealTopLane: boolean
): Promise<(FullLaneDetail | LaneSummary)[]> {
  return Promise.all(
    ranked.map(async ({ lane, analysis, note }, i) => {
      if (!analysis) return summarizeLane(lane, null, note);
      const isTopLane = i === 0;
      const showFull = isPaid || (isTopLane && revealTopLane);
      if (!showFull) return summarizeLane(lane, analysis);

      const insights = await buildLaneInsights(supabase, lane, analysis);
      return fullLaneDetail(lane, analysis, isPaid, insights);
    })
  );
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
