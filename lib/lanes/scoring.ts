// Lane Check pivot — deterministic lane scoring. Zero LLM calls.
// See LANE-CHECK-BRIEF.md "Scoring" section for the formulas this implements.

import type { VideoDetails } from "./youtube";

// CALIBRATE: these map raw metrics onto a 0-100 scale. Values below are
// producer-approved as of the MF DOOM / Drake / Alchemist calibration run.
// NOTE: winnability can swing ~±15% run-to-run purely from live YouTube search
// results shifting between calls (ranking/view-count churn, not a bug) — don't
// chase that noise in future tuning passes; look for sustained drift instead.
export const SCORE_CALIBRATION = {
  demandLogBase: 15000,          // views/day (top 20 median) that maps to Demand = 100, on a log10 curve
  saturationUploadsFor100: 75000, // pageInfo.totalResults value that maps to Saturation = 100
  smallChannelSubThreshold: 3000,
  maxWinnerVideosPerChannel: 2,  // caps one prolific channel from dominating pattern analysis
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const daysSincePublish = (publishedAt: string): number =>
  Math.max((Date.now() - new Date(publishedAt).getTime()) / 86_400_000, 1);

export interface DemandResult {
  score: number;
  medianViewsPerDay: number;
  sampleSize: number;
}

/** Median views-per-day of the top 20 performers — normalizes for video age.
 * Log-scaled: raw type-beat view velocity for known artists clusters in the
 * high hundreds to low thousands per day, which crushed a linear scale flat
 * at 100 for nearly every lane. log10 spreads that range out meaningfully. */
export function computeDemand(topPerformers: VideoDetails[]): DemandResult {
  const top20 = topPerformers.slice(0, 20);
  const ratesPerDay = top20.map((v) => v.viewCount / daysSincePublish(v.publishedAt));
  const medianVpd = median(ratesPerDay);
  const score = clamp(
    (Math.log10(medianVpd + 1) / Math.log10(SCORE_CALIBRATION.demandLogBase)) * 100
  );
  return {
    score,
    medianViewsPerDay: Math.round(medianVpd),
    sampleSize: top20.length,
  };
}

export interface SaturationResult {
  score: number;
  uploadsLast30d: number;
}

/** Uploads in the last 30 days. 0-100, LOWER is better (more saturated = higher score).
 * uploadsLast30d must be YouTube's pageInfo.totalResults from the recency search, NOT
 * items.length — items.length is capped at maxResults (50) and pegs every lane with
 * real activity at the same ceiling, destroying differentiation between lanes. */
export function computeSaturation(uploadsLast30d: number): SaturationResult {
  return {
    score: clamp((uploadsLast30d / SCORE_CALIBRATION.saturationUploadsFor100) * 100),
    uploadsLast30d,
  };
}

export interface WinnabilityResult {
  score: number;
  smallChannelCount: number;
  sampleSize: number;
}

/** % of top 20 performers from channels under the small-channel sub threshold. */
export function computeWinnability(
  topPerformers: (VideoDetails & { subscriberCount: number })[]
): WinnabilityResult {
  const top20 = topPerformers.slice(0, 20);
  const small = top20.filter((v) => v.subscriberCount < SCORE_CALIBRATION.smallChannelSubThreshold);
  return {
    score: top20.length ? clamp((small.length / top20.length) * 100) : 0,
    smallChannelCount: small.length,
    sampleSize: top20.length,
  };
}

/** Weighted sum: Demand x0.4 + Winnability x0.45 + (100-Saturation) x0.15, rounded, clamped 0-100. */
export function computeOpportunity(demand: number, winnability: number, saturation: number): number {
  return clamp(Math.round(demand * 0.4 + winnability * 0.45 + (100 - saturation) * 0.15));
}

export type LaneStatus = "green" | "yellow" | "red";

export function computeStatus(opportunity: number): LaneStatus {
  return opportunity >= 65 ? "green" : opportunity >= 40 ? "yellow" : "red";
}

/** Delta vs. the previous stored analysis row. Null on first analysis — render
 * as "new lane — no trend yet". */
export function computeMomentum(currentDemand: number, previousDemand: number | null): number | null {
  if (previousDemand === null) return null;
  return Math.round(currentDemand - previousDemand);
}
