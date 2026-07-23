// Lane insight extractor — read-and-rank layer over data lib/lanes/scoring.ts
// and lib/lanes/patterns.ts already computed and persisted onto the latest
// lane_analyses row. No new YouTube calls, no new "recent winners" window:
// this reuses patterns.ts's existing 30-day-recency small-channel winner set
// (analysis.winner_videos / analysis.patterns) and scoring.ts's existing
// demand/saturation/winnability/momentum/opportunity fields as-is.
//
// Replaces the social card generator's role as the thing actively used to
// produce postable facts — see lib/lanes/cards.ts, left in place but not
// built on further.
//
// Display model: a FIXED lineup of insight types, in a fixed order (see
// buildDisplayInsights), each independently omitted if its own signal isn't
// reliable — not a ranked "pick the top 2-3 most extreme" selection anymore.
// buildCandidates below still computes the earlier ranked-model candidates
// (small_channel_rate/momentum/free_prefix_pattern/quoted_name_pattern/
// co_mention/opportunity/pairing_performance) because the brief asks to keep
// them as code even though most are no longer shown; buildDisplayInsights
// reuses a couple of them (small_channel_rate as the 10K fallback,
// underused_pairing and demand_percentile as-is) rather than recomputing the
// same data twice.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestAnalysis } from "./db";
import { computeStatus, viewsPerDay } from "./scoring";
import { extractCoMention, normalizeArtistName, type PatternStats } from "./patterns";
import { getTrendingCoMentionedArtists, type TrendingArtist } from "./trending";

export type InsightType =
  // Displayed, in this fixed order:
  | "demand_percentile"
  | "small_channel_winnability"
  | "winning_co_mention"
  | "underused_pairing"
  | "cumulative_views"
  | "breakout_video"
  | "view_concentration"
  // Computed but not displayed (demoted / kept for later use — see file header):
  | "small_channel_rate"
  | "momentum"
  | "free_prefix_pattern"
  | "quoted_name_pattern"
  | "co_mention"
  | "opportunity"
  | "pairing_performance";

export interface LaneInsight {
  type: InsightType;
  sentence: string;
  /** The number the sentence is built from — kept alongside the phrasing so
   * a human can eyeball whether the sentence accurately represents it before
   * posting, per the brief. Percentages are 0-100, momentum is a signed
   * point delta, opportunity is 0-100, cumulative_views/breakout_video are
   * raw counts. */
  rawValue: number;
}

export type LaneInsightsResult =
  | { ok: true; laneDisplayName: string; analyzedAt: string; insights: LaneInsight[] }
  | { ok: false; error: string };

// Deliberately NOT SCORE_CALIBRATION.smallChannelSubThreshold (3,000) — that
// number feeds the opportunity score itself and changing it here would be
// silently inconsistent with the score shown elsewhere. 10K remains the
// fallback framing for small_channel_winnability when the 1K rate is ~0;
// 1K is the new primary threshold for that same insight.
const SMALL_CHANNEL_SUB_THRESHOLD_10K = 10_000;
const SMALL_CHANNEL_SUB_THRESHOLD_1K = 1_000;
const NEAR_ZERO_PCT = 5; // 1K rate at or below this counts as "0 or near-0" for the fallback
// Separate, deliberately different threshold — a "breakout" needs to be a
// genuinely small channel, not just under the more generous 10K framing used
// elsewhere; kept at 10K per the brief's own example, just named distinctly
// so a future change to one doesn't silently affect the other.
const BREAKOUT_SUB_THRESHOLD = 10_000;
const VIEW_CONCENTRATION_MIN_POOL = 15;

const MIN_GENRE_POOL = 5; // fewest lanes (including this one) needed to trust a percentile
const PERCENTILE_BUCKETS = [1, 5, 10, 25, 50, 75, 90, 100];

// Matches the "top 20" framing already used in existing verdict copy
// (see lib/lanes/present.ts summarizeLane).
const TOP_N = 20;

const STATUS_LABELS = {
  green: "strong opportunity",
  yellow: "moderate opportunity",
  red: "a tough lane",
} as const;

// ── Pairing performance / underused-pairing gap — both reuse the same
// solo-vs-co-mention grouping over top_videos (the broader top-performer
// pool, not the small-channel-only winner_videos patterns.ts already
// analyzed), since a velocity comparison needs more samples per group than
// the typically-small winner set has. ──

const MIN_GROUP_SAMPLE = 4; // minimum videos per group to trust an average velocity
const RARE_MAX_COUNT = 2; // at most this many occurrences counts as "rare"
const MIN_POOL_FOR_RARITY = 10; // top_videos pool must be this big for "rare" to mean anything
const RARE_GAP_MIN_MARGIN = 0.3; // rare pairing must beat the solo baseline by >=30% to call it "performs well"

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 2,400,000 -> "2.4M", 380,000 -> "380K" — matches the brief's own examples
 * (note: unlike this file's K/M rounding, other components in the app such
 * as TopVideosThisLane.tsx's formatCount always show one decimal for K too;
 * this is a deliberate, display-context-specific deviation from that, not
 * an inconsistency to fix). */
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** patterns.ts's CO_MENTION_RE can chain through multiple "x"s on a title
 * like "MF DOOM x Joey Bada$$ x 90s Boom Bap Type Beat" and capture
 * "joey bada$$ x 90s boom bap" as one blob instead of just the real artist.
 * Collapses that down to the first, real segment — same fix the old
 * title-generator engine used to apply (since removed along with the rest
 * of that engine), needed again here since this reads the same raw titles. */
function primaryCoMentionName(raw: string): string {
  return raw.split(/\s+x\s+/i)[0].trim();
}

/** Normalizes AND collapses any "x"-chaining artifact in one step — every
 * co-mention artist identity in this file (extracted locally or read back
 * from trending.ts, which sources the same patterns.topCoMentions data)
 * should go through this so a chained name can never slip into a sentence
 * or silently fail to match against a cleaned name on the other side. */
function cleanArtistName(raw: string): string {
  return normalizeArtistName(primaryCoMentionName(raw));
}

/** Distance from the 50% midpoint — a 50/50 split is the least notable
 * outcome for a plain percentage; the closer to 0% or 100%, the more
 * one-sided (and more postable) the pattern is. */
function extremityFromMidpoint(pct: number): number {
  return Math.abs(pct - 50);
}

interface TitledVideo {
  title: string;
  viewCount: number;
  publishedAt: string;
}

type PoolVideo = TitledVideo & { subscriberCount: number };

function avgVelocity(videos: TitledVideo[]): number {
  return videos.reduce((sum, v) => sum + viewsPerDay(v), 0) / videos.length;
}

/** Splits a video pool into "solo" (no co-mention detected in the title) and
 * "paired" groups (keyed by the other, normalized artist name) — the exact
 * same extraction patterns.ts already uses for coMentionPct/topCoMentions,
 * so these candidates never disagree with the existing co-mention insight
 * about what counts as a co-mention. */
function groupByCoMention(
  videos: TitledVideo[],
  laneDisplayName: string
): { solo: TitledVideo[]; byArtist: Map<string, TitledVideo[]> } {
  const laneNormalized = normalizeArtistName(laneDisplayName);
  const solo: TitledVideo[] = [];
  const byArtist = new Map<string, TitledVideo[]>();
  for (const v of videos) {
    const raw = extractCoMention(v.title);
    const artist = raw ? cleanArtistName(raw) : null;
    if (!artist || artist === laneNormalized) {
      solo.push(v);
      continue;
    }
    const list = byArtist.get(artist) ?? [];
    list.push(v);
    byArtist.set(artist, list);
  }
  return { solo, byArtist };
}

/** Snaps a raw percentile UP to the nearest "clean" bucket that is still
 * true of the lane — e.g. a raw 13.7% becomes "top 25%", never a decimal and
 * never a claim tighter than reality (rounding down could overstate how
 * elite the lane actually is). */
function snapPercentileUp(rawPct: number): number {
  for (const bucket of PERCENTILE_BUCKETS) {
    if (rawPct <= bucket) return bucket;
  }
  return 100;
}

interface GenreDemandRank {
  genreLabel: string;
  rank: number; // 1-indexed; ties don't count against this lane (see below)
  poolSize: number;
}

/** Ranks this lane's Demand score against every other lane sharing the same
 * genre_hint (case-insensitive — same match style getBestOpenLane already
 * uses). Genre-scoped, not the winner pool, so this works even on lanes with
 * zero winner-pool data (see file header). A lane with no analysis at all is
 * simply excluded from the pool rather than treated as a zero score. */
async function getGenreDemandRank(
  supabase: SupabaseClient,
  genreHint: string,
  ownLaneId: string,
  ownDemand: number
): Promise<GenreDemandRank | null> {
  const { data: genreLanes } = await supabase.from("lanes").select("id").ilike("genre_hint", genreHint);
  const laneIds = (genreLanes as { id: string }[] | null)?.map((l) => l.id) ?? [];
  if (!laneIds.length) return null;

  const demands = await Promise.all(
    laneIds.map(async (id) => {
      if (id === ownLaneId) return ownDemand;
      const analysis = await getLatestAnalysis(supabase, id);
      return analysis?.demand ?? null;
    })
  );
  const validDemands = demands.filter((d): d is number => d !== null);
  if (validDemands.length < MIN_GENRE_POOL) return null;

  // Ties don't count against this lane — a 4-way tie for first is rank 1
  // for all four, not rank 1/2/3/4.
  const rank = validDemands.filter((d) => d > ownDemand).length + 1;
  return { genreLabel: genreHint, rank, poolSize: validDemands.length };
}

interface Candidate extends LaneInsight {
  /** Ranking key only — how "surprising" this candidate is. Unused by the
   * fixed 6-item display lineup now, but left in place since this whole
   * candidate pool is kept computed per the brief (see file header). */
  deviation: number;
}

// ── Ranked-model candidate pool — kept computed (per the brief), no longer
// the thing rendered on the insights page. buildDisplayInsights below reuses
// small_channel_rate (as the 10K fallback) and underused_pairing (as-is)
// from this pool rather than recomputing the same underlying data twice. ──

function buildCandidates(
  laneDisplayName: string,
  analysis: {
    opportunity: number;
    momentum: number | null;
    patterns: PatternStats;
    top_videos: unknown;
  },
  trendingArtists: TrendingArtist[],
  demandRank: GenreDemandRank | null
): Candidate[] {
  const candidates: Candidate[] = [];
  const patterns = analysis.patterns;
  const topVideos = (analysis.top_videos as PoolVideo[] | null) ?? [];

  // 1. Small-channel win rate — derived by re-filtering the already-stored
  // top_videos (each already carries subscriberCount), not by re-fetching or
  // re-scoring anything.
  const topSlice = topVideos.slice(0, TOP_N);
  if (topSlice.length > 0) {
    const smallCount = topSlice.filter((v) => v.subscriberCount < SMALL_CHANNEL_SUB_THRESHOLD_10K).length;
    const pct = Math.round((smallCount / topSlice.length) * 100);
    candidates.push({
      type: "small_channel_rate",
      sentence: `${pct}% of this month's winning videos came from channels under 10K subs.`,
      rawValue: pct,
      deviation: extremityFromMidpoint(pct),
    });
  }

  // 2. Momentum — a signed delta in the Demand score (view-velocity, log
  // scaled) versus the prior analysis, not a raw upload-count percentage.
  // Omitted entirely when there's no prior analysis to compare against
  // (momentum === null) or when it's exactly flat (nothing to say).
  if (analysis.momentum !== null && analysis.momentum !== 0) {
    const m = analysis.momentum;
    const direction = m > 0 ? "up" : "down";
    candidates.push({
      type: "momentum",
      sentence: `Demand in this lane is ${direction} ${Math.abs(m)} points versus the last analysis.`,
      rawValue: m,
      deviation: Math.abs(m),
    });
  }

  // 3 & 4. Title pattern — [FREE] prefix and quoted-artist-name.
  if (!patterns.empty) {
    if (patterns.freePrefixPct > 0) {
      candidates.push({
        type: "free_prefix_pattern",
        sentence: `${patterns.freePrefixPct}% of winning titles use the [FREE] prefix.`,
        rawValue: patterns.freePrefixPct,
        deviation: extremityFromMidpoint(patterns.freePrefixPct),
      });
    }
    if (patterns.quotedNamePct > 0) {
      candidates.push({
        type: "quoted_name_pattern",
        sentence: `${patterns.quotedNamePct}% of winning titles quote ${laneDisplayName}'s name directly.`,
        rawValue: patterns.quotedNamePct,
        deviation: extremityFromMidpoint(patterns.quotedNamePct),
      });
    }

    // 5. Co-mention (frequency-only framing) — superseded on the display
    // page by "winning_co_mention" below, kept computed as-is here.
    const top = patterns.topCoMentions[0];
    if (top) {
      candidates.push({
        type: "co_mention",
        sentence: `The most common pairing in winning titles is ${laneDisplayName} + ${titleCase(top.artist)}.`,
        rawValue: top.pct,
        deviation: top.pct,
      });
    }
  }

  // 6. Opportunity framing.
  const status = computeStatus(analysis.opportunity);
  candidates.push({
    type: "opportunity",
    sentence: `This lane is sitting at ${analysis.opportunity}/100 — ${STATUS_LABELS[status]}.`,
    rawValue: analysis.opportunity,
    deviation: extremityFromMidpoint(analysis.opportunity),
  });

  // 7. Pairing performance — velocity comparison for the lane's #1 co-mention.
  if (!patterns.empty && patterns.topCoMentions[0]) {
    const topArtist = cleanArtistName(patterns.topCoMentions[0].artist);
    const { solo, byArtist } = groupByCoMention(topVideos, laneDisplayName);
    const paired = byArtist.get(topArtist) ?? [];
    if (solo.length >= MIN_GROUP_SAMPLE && paired.length >= MIN_GROUP_SAMPLE) {
      const soloAvg = avgVelocity(solo);
      if (soloAvg > 0) {
        const pctDiff = Math.round(((avgVelocity(paired) - soloAvg) / soloAvg) * 100);
        const direction = pctDiff >= 0 ? "outperform" : "underperform";
        candidates.push({
          type: "pairing_performance",
          sentence: `Videos titled "${laneDisplayName} x ${titleCase(topArtist)} type beat" ${direction} solo "${laneDisplayName} type beat" titles by ${Math.abs(pctDiff)}%.`,
          rawValue: pctDiff,
          deviation: Math.abs(pctDiff),
        });
      }
    }
  }

  // 8. Underused pairing gap — displayed as-is (see buildDisplayInsights).
  if (!patterns.empty && topVideos.length >= MIN_POOL_FOR_RARITY) {
    const topArtist = patterns.topCoMentions[0] ? cleanArtistName(patterns.topCoMentions[0].artist) : null;
    const { solo, byArtist } = groupByCoMention(topVideos, laneDisplayName);
    const rareEntries = [...byArtist.entries()].filter(
      ([artist, vids]) => artist !== topArtist && vids.length > 0 && vids.length <= RARE_MAX_COUNT
    );

    let gap: Candidate | null = null;

    if (solo.length >= MIN_GROUP_SAMPLE && rareEntries.length > 0) {
      const soloAvg = avgVelocity(solo);
      if (soloAvg > 0) {
        let best: { artist: string; vids: TitledVideo[]; margin: number } | null = null;
        for (const [artist, vids] of rareEntries) {
          const margin = (avgVelocity(vids) - soloAvg) / soloAvg;
          if (margin >= RARE_GAP_MIN_MARGIN && (!best || margin > best.margin)) {
            best = { artist, vids, margin };
          }
        }
        if (best) {
          const pct = Math.round((best.vids.length / topVideos.length) * 100);
          gap = {
            type: "underused_pairing",
            sentence: `${titleCase(best.artist)} rarely appears in ${laneDisplayName} titles (${pct}%), but performs well when it does — an open pairing.`,
            rawValue: Math.round(best.margin * 100),
            deviation: Math.min(60, Math.round(best.margin * 100)),
          };
        }
      }
    }

    if (!gap && rareEntries.length > 0 && trendingArtists.length > 0) {
      const match = trendingArtists.find((t) => {
        const clean = cleanArtistName(t.artist);
        return byArtist.has(clean) && clean !== topArtist;
      });
      if (match) {
        const matchArtist = cleanArtistName(match.artist);
        const vids = byArtist.get(matchArtist)!;
        const pct = Math.round((vids.length / topVideos.length) * 100);
        gap = {
          type: "underused_pairing",
          sentence: `${titleCase(matchArtist)} rarely appears in ${laneDisplayName} titles (${pct}%), but is a common pairing across other lanes in this genre right now — worth testing.`,
          rawValue: match.count,
          deviation: Math.min(40, match.count * 10),
        };
      }
    }

    if (gap) candidates.push(gap);
  }

  // 9. Demand percentile — genre-scoped ranking against every other lane's
  // latest Demand score. Needs no winner-pool data at all, so this can fire
  // even on lanes where every winner-pool-dependent candidate above has
  // nothing to work with (see file header).
  if (demandRank) {
    const rawPct = (demandRank.rank / demandRank.poolSize) * 100;
    const bucket = snapPercentileUp(rawPct);
    candidates.push({
      type: "demand_percentile",
      sentence: `This lane ranks in the top ${bucket}% for demand across all ${demandRank.genreLabel} lanes tracked by TALLY.`,
      rawValue: bucket,
      deviation: 100 - bucket, // a smaller/more-elite bucket is the more surprising, more postable result
    });
  }

  return candidates;
}

// ── Fixed 6-item display lineup — always attempted in this order; each item
// is independently omitted if its own signal isn't reliable, never
// substituted or reordered based on how "notable" it is relative to the
// others (that ranked model is what this replaces). ──

function buildSmallChannelWinnability(
  laneDisplayName: string,
  topSlice: PoolVideo[],
  fallback10k: Candidate | null
): LaneInsight | null {
  if (!topSlice.length) return null;
  const count1k = topSlice.filter((v) => v.subscriberCount < SMALL_CHANNEL_SUB_THRESHOLD_1K).length;
  const pct1k = Math.round((count1k / topSlice.length) * 100);

  if (pct1k > NEAR_ZERO_PCT) {
    return {
      type: "small_channel_winnability",
      sentence: `${pct1k}% of the top performing ${laneDisplayName} type beat videos last month were from channels with less than 1K subs.`,
      rawValue: pct1k,
    };
  }

  // 1K rate is 0 or near-0 — fall back to the 10K framing (already computed
  // in buildCandidates) so this insight still says something useful instead
  // of reporting a hollow "1% were under 1K subs."
  if (fallback10k) {
    return {
      type: "small_channel_winnability",
      sentence: `${fallback10k.rawValue}% of the top performing ${laneDisplayName} type beat videos last month were from channels with less than 10K subs.`,
      rawValue: fallback10k.rawValue,
    };
  }
  return null;
}

function buildWinningCoMention(laneDisplayName: string, patterns: PatternStats): LaneInsight | null {
  if (patterns.empty) return null;
  const top = patterns.topCoMentions[0];
  if (!top) return null;

  const artist = titleCase(cleanArtistName(top.artist));
  const sentence =
    top.pct > 50
      ? `Most of the winning ${laneDisplayName} type beat titles also mention ${artist}.`
      : `${top.pct}% of winning ${laneDisplayName} type beat titles also mention ${artist}.`;

  return { type: "winning_co_mention", sentence, rawValue: top.pct };
}

function buildCumulativeViews(laneDisplayName: string, topSlice: PoolVideo[]): LaneInsight | null {
  if (!topSlice.length) return null;
  const totalViews = topSlice.reduce((sum, v) => sum + v.viewCount, 0);
  return {
    type: "cumulative_views",
    sentence: `The top performing ${laneDisplayName} type beat videos cumulated a total of ${formatViews(totalViews)} views last month.`,
    rawValue: totalViews,
  };
}

/** Same viewsPerDay ranking the pipeline itself uses to decide "top
 * performer" (see lib/lanes/pipeline.ts) — re-sorted here rather than
 * assumed from storage order, so this doesn't silently break if that
 * changes upstream. */
function sortByVelocityDesc<T extends TitledVideo>(videos: T[]): T[] {
  return [...videos].sort((a, b) => viewsPerDay(b) - viewsPerDay(a));
}

function buildBreakoutVideo(laneDisplayName: string, sortedByVelocity: PoolVideo[]): LaneInsight | null {
  const top1 = sortedByVelocity[0];
  if (!top1) return null;
  if (top1.subscriberCount >= BREAKOUT_SUB_THRESHOLD) return null; // not a genuinely small channel — not an insight

  return {
    type: "breakout_video",
    sentence: `The #1 ${laneDisplayName} type beat last month came from a channel with only ${formatViews(top1.subscriberCount)} subs — ${formatViews(top1.viewCount)} views.`,
    rawValue: top1.subscriberCount,
  };
}

function buildViewConcentration(laneDisplayName: string, sortedByVelocity: PoolVideo[]): LaneInsight | null {
  if (sortedByVelocity.length < VIEW_CONCENTRATION_MIN_POOL) return null;
  const totalViews = sortedByVelocity.reduce((sum, v) => sum + v.viewCount, 0);
  if (totalViews <= 0) return null;
  const top5Views = sortedByVelocity.slice(0, 5).reduce((sum, v) => sum + v.viewCount, 0);
  const pct = Math.round((top5Views / totalViews) * 100);

  return {
    type: "view_concentration",
    sentence: `The top 5 videos captured ${pct}% of all ${laneDisplayName} type beat views last month.`,
    rawValue: pct,
  };
}

function buildDisplayInsights(
  laneDisplayName: string,
  patterns: PatternStats,
  topVideos: PoolVideo[],
  allCandidates: Candidate[]
): LaneInsight[] {
  const insights: LaneInsight[] = [];
  const topSlice = topVideos.slice(0, TOP_N);
  const sortedByVelocity = sortByVelocityDesc(topSlice);

  // Demand percentile leads the lineup — it needs no winner-pool data at
  // all, so it gives immediate context even before the winner-pool-dependent
  // insights below (which may have less, or nothing, to show).
  const demandPercentile = allCandidates.find((c) => c.type === "demand_percentile");
  if (demandPercentile) {
    insights.push({ type: demandPercentile.type, sentence: demandPercentile.sentence, rawValue: demandPercentile.rawValue });
  }

  const fallback10k = allCandidates.find((c) => c.type === "small_channel_rate") ?? null;
  const winnability = buildSmallChannelWinnability(laneDisplayName, topSlice, fallback10k);
  if (winnability) insights.push(winnability);

  const winningCoMention = buildWinningCoMention(laneDisplayName, patterns);
  if (winningCoMention) insights.push(winningCoMention);

  const gap = allCandidates.find((c) => c.type === "underused_pairing");
  if (gap) insights.push({ type: gap.type, sentence: gap.sentence, rawValue: gap.rawValue });

  const cumulativeViews = buildCumulativeViews(laneDisplayName, topSlice);
  if (cumulativeViews) insights.push(cumulativeViews);

  const breakout = buildBreakoutVideo(laneDisplayName, sortedByVelocity);
  if (breakout) insights.push(breakout);

  const concentration = buildViewConcentration(laneDisplayName, sortedByVelocity);
  if (concentration) insights.push(concentration);

  return insights;
}

export async function getLaneInsights(supabase: SupabaseClient, laneId: string): Promise<LaneInsightsResult> {
  const { data: lane, error: laneErr } = await supabase
    .from("lanes")
    .select("id, display_name, genre_hint")
    .eq("id", laneId)
    .maybeSingle();
  if (laneErr) throw new Error(`getLaneInsights lane lookup failed: ${laneErr.message}`);
  if (!lane) return { ok: false, error: "Lane not found" };

  const analysis = await getLatestAnalysis(supabase, laneId);
  if (!analysis) return { ok: false, error: "No analysis available for this lane yet" };

  // Only worth the query when there's a genre to scope it to — getTrendingCoMentionedArtists
  // returns [] for a null/empty genre anyway, so this just skips a pointless round trip.
  const trendingArtists = lane.genre_hint
    ? await getTrendingCoMentionedArtists(supabase, lane.genre_hint as string)
    : [];
  const demandRank = lane.genre_hint
    ? await getGenreDemandRank(supabase, lane.genre_hint as string, laneId, analysis.demand)
    : null;

  const patterns = analysis.patterns as unknown as PatternStats;
  const topVideos = (analysis.top_videos as PoolVideo[] | null) ?? [];

  const candidates = buildCandidates(
    lane.display_name as string,
    {
      opportunity: analysis.opportunity,
      momentum: analysis.momentum,
      patterns,
      top_videos: topVideos,
    },
    trendingArtists,
    demandRank
  );

  return {
    ok: true,
    laneDisplayName: lane.display_name as string,
    analyzedAt: analysis.created_at,
    insights: buildDisplayInsights(lane.display_name as string, patterns, topVideos, candidates),
  };
}
