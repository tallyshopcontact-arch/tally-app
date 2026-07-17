/**
 * TALLY — Free Channel Diagnostic: deterministic scoring engine
 * ---------------------------------------------------------------
 * Zero LLM calls. Pure math on YouTube Data API v3 data.
 * Input: channel stats + last 50 uploads (snippet, statistics, contentDetails).
 * Output: 6 findings + composite score. Free tier reveals worst 2, locks 4.
 *
 * Quota cost per diagnostic:
 *   channels.list (1) + playlistItems.list (1) + videos.list (1) = ~3 units
 */

// ---------- Input shapes (map from your existing snapshot code) ----------

export interface ChannelInput {
  channelId: string;
  title: string;
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  publishedAt: string; // channel creation date
}

export interface VideoInput {
  videoId: string;
  title: string;
  description: string;
  tags: string[];           // snippet.tags (may be empty)
  publishedAt: string;
  durationSeconds: number;  // parsed from contentDetails.duration
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

// ---------- Output shapes ----------

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Finding {
  id: string;
  category: string;        // shown even when locked ("Title SEO issue found")
  status: CheckStatus;
  score: number;           // 0–100 for this check
  weight: number;          // contribution to composite
  headline: string;        // one-liner WITH their real numbers — the hook
  detail: string;          // full explanation + what to do (locked content)
  metrics: Record<string, number | string>; // raw numbers for the UI
}

export interface DiagnosticResult {
  tallyScore: number;              // 0–100 composite
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  findings: Finding[];             // all 6, sorted worst-first
  freeFindingIds: string[];        // the 2 to reveal on the free report
}

// ---------- Tunable benchmarks (YOUR producer judgment lives here) ----------

export const BENCH = {
  cadence: { passPerWeek: 3, warnPerWeek: 1, maxGapDays: 14 },
  artistLanes: { min: 3, max: 8 },      // healthy # of artist targets in last 50
  deadUploadViews: 25,                  // < this after 7 days = dead on arrival
  deadUploadMaxRate: 0.2,               // >20% dead uploads = fail
  momentumWarn: 0.85,                   // recent median < 85% of prior = warn
  momentumFail: 0.6,
  lanePerformance: {
    minQualifyingVideos: 3,             // a lane needs 3+ uploads to be compared
    passRatio: 0.5,                     // worst lane median >= 50% of best = pass
    warnRatio: 0.2,                     // >= 20% = warn, below = fail
  },
  hitDependence: {
    passMaxPct: 0.3,                    // top 2 videos <= 30% of total views = pass
    warnMaxPct: 0.5,
  },
} as const;

// ---------- Helpers ----------

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const daysBetween = (a: string, b: string) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

const daysSince = (iso: string) => daysBetween(iso, new Date().toISOString());

/** Extract the artist target from a type-beat title, e.g. "Griselda Type Beat" -> "griselda" */
const extractArtistLane = (title: string): string | null => {
  const m = title.toLowerCase().match(/([a-z0-9$&.\-' ]{2,30}?)\s*(?:x\s+[a-z0-9$&.\-' ]{2,30}\s*)?type\s*beat/i);
  if (!m) return null;
  return m[1].replace(/^\[?(free|sold)\]?\s*/i, '').trim() || null;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ---------- The 6 checks ----------

type Check = (ch: ChannelInput, vids: VideoInput[]) => Finding;

/** 1. Artist-lane strategy — concentration vs. scatter */
const checkArtistLanes: Check = (_ch, vids) => {
  const lanes = new Map<string, number>();
  for (const v of vids) {
    const lane = extractArtistLane(v.title);
    if (lane) lanes.set(lane, (lanes.get(lane) ?? 0) + 1);
  }
  const n = lanes.size;
  const status: CheckStatus =
    n >= BENCH.artistLanes.min && n <= BENCH.artistLanes.max ? 'pass'
    : n === 0 ? 'fail'
    : n < BENCH.artistLanes.min || n <= BENCH.artistLanes.max + 4 ? 'warn' : 'fail';
  const top = [...lanes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, c]) => `${k} (${c})`).join(', ');
  return {
    id: 'artist_lanes', category: 'Keyword strategy', status, weight: 16,
    score: n === 0 ? 10 : clamp(100 - Math.abs(n - 5.5) * 12),
    headline: n === 0
      ? `Your titles don't target any artist lanes — search can't find you.`
      : `You're spread across ${n} artist ${n === 1 ? 'lane' : 'lanes'} in your last ${vids.length} uploads.`,
    detail: n === 0
      ? `None of your recent titles follow the "Artist Type Beat" pattern, which is how buyers search. Pick ${BENCH.artistLanes.min}–${BENCH.artistLanes.max} artists that fit your boom bap sound and build repetition in those lanes.`
      : `Top lanes: ${top}. The sweet spot is ${BENCH.artistLanes.min}–${BENCH.artistLanes.max} lanes with repeated uploads in each — repetition builds suggested-video clustering, while too many lanes means the algorithm never learns who to show you to. ${n > BENCH.artistLanes.max ? 'You are too scattered: cut to your best-performing lanes.' : n < BENCH.artistLanes.min ? 'You are too concentrated: one lane caps your ceiling if that artist search cools off.' : 'Good spread — double down on the lanes with the best view velocity.'}`,
    metrics: { laneCount: n, topLanes: top || 'none' },
  };
};

/** 2. Lane performance — best lane vs. worst lane (or best/worst uploads) by median views */
const checkLanePerformance: Check = (_ch, vids) => {
  const laneViews = new Map<string, number[]>();
  for (const v of vids) {
    const lane = extractArtistLane(v.title);
    if (!lane) continue;
    const arr = laneViews.get(lane) ?? [];
    arr.push(v.viewCount);
    laneViews.set(lane, arr);
  }

  const qualifying = [...laneViews.entries()]
    .filter(([, views]) => views.length >= BENCH.lanePerformance.minQualifyingVideos)
    .map(([lane, views]) => ({ lane, medianViews: median(views) }));

  let mode: 'lane' | 'fallback';
  let bestLabel: string, worstLabel: string, bestMedian: number, worstMedian: number;

  if (qualifying.length >= 2) {
    mode = 'lane';
    const sorted = [...qualifying].sort((a, b) => b.medianViews - a.medianViews);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    bestLabel = best.lane; bestMedian = best.medianViews;
    worstLabel = worst.lane; worstMedian = worst.medianViews;
  } else {
    mode = 'fallback';
    const sortedVids = [...vids].sort((a, b) => b.viewCount - a.viewCount);
    bestLabel = 'top 5 uploads';
    worstLabel = 'bottom 5 uploads';
    bestMedian = median(sortedVids.slice(0, 5).map(v => v.viewCount));
    worstMedian = median(sortedVids.slice(-5).map(v => v.viewCount));
  }

  if (bestMedian <= 0) {
    return {
      id: 'lane_performance', category: 'Lane performance', status: 'fail', weight: 22,
      score: 0,
      headline: `No view data available yet to compare performance across your uploads.`,
      detail: `We couldn't find enough view activity across your uploads to measure consistency. Once your videos start picking up views, this check will compare your best-performing segment against your worst.`,
      metrics: {
        mode, qualifyingLanes: qualifying.length,
        bestLabel: 'n/a', bestMedianViews: 0, worstLabel: 'n/a', worstMedianViews: 0, gapMultiplier: 'n/a',
      },
    };
  }

  const gapRatio = worstMedian / bestMedian;
  const multiplier = worstMedian > 0 ? bestMedian / worstMedian : null;
  const gapDesc = multiplier ? `${multiplier.toFixed(1)}x` : 'a total';
  const status: CheckStatus =
    gapRatio >= BENCH.lanePerformance.passRatio ? 'pass'
    : gapRatio >= BENCH.lanePerformance.warnRatio ? 'warn' : 'fail';

  return {
    id: 'lane_performance', category: 'Lane performance', status, weight: 22,
    score: clamp((gapRatio / BENCH.lanePerformance.passRatio) * 100),
    headline: mode === 'lane'
      ? `Your "${bestLabel}" lane (${Math.round(bestMedian)} median views) beats your "${worstLabel}" lane (${Math.round(worstMedian)} median views) by ${gapDesc}.`
      : `Your top 5 uploads median ${Math.round(bestMedian)} views vs. your bottom 5 at ${Math.round(worstMedian)} — a ${gapDesc} gap.`,
    detail: mode === 'lane'
      ? `Across your ${qualifying.length} lanes with ${BENCH.lanePerformance.minQualifyingVideos}+ uploads each, "${bestLabel}" is your strongest and "${worstLabel}" is your weakest by median views. A big gap means uploads in the weak lane aren't converting — cut it or rework the packaging, and put those upload slots into your best lane instead.`
      : `You don't have 2+ artist lanes with ${BENCH.lanePerformance.minQualifyingVideos}+ uploads each to compare directly, so this compares your 5 best uploads against your 5 worst by raw view count. A big gap here usually means inconsistent packaging (title/thumbnail/lane targeting) rather than inconsistent beat quality — look at what's different about your top performers and repeat it.`,
    metrics: {
      mode,
      bestLabel, bestMedianViews: Math.round(bestMedian),
      worstLabel, worstMedianViews: Math.round(worstMedian),
      gapMultiplier: multiplier ? +multiplier.toFixed(1) : 'n/a',
      qualifyingLanes: qualifying.length,
    },
  };
};

/** 3. Hit dependence — % of total views from just your top 2 videos */
const checkHitDependence: Check = (_ch, vids) => {
  const totalViews = vids.reduce((s, v) => s + v.viewCount, 0);
  const sorted = [...vids].sort((a, b) => b.viewCount - a.viewCount);
  const top2Views = sorted.slice(0, 2).reduce((s, v) => s + v.viewCount, 0);
  const pct = totalViews > 0 ? top2Views / totalViews : 0;

  const status: CheckStatus =
    pct <= BENCH.hitDependence.passMaxPct ? 'pass'
    : pct <= BENCH.hitDependence.warnMaxPct ? 'warn' : 'fail';

  return {
    id: 'hit_dependence', category: 'Hit dependence', status, weight: 14,
    score: clamp(100 - pct * 150),
    headline: `Your top 2 videos account for ${Math.round(pct * 100)}% of your last ${vids.length} uploads' total views.`,
    detail: `Out of ${Math.round(totalViews).toLocaleString()} total views across your last ${vids.length} uploads, your 2 biggest videos brought in ${Math.round(pct * 100)}%. Heavy reliance on a couple of hits means your channel's growth isn't repeatable — if the algorithm stops boosting those two, your numbers fall off a cliff. Fix: consistent packaging and cadence so every upload gets a fair shot, not just the lucky ones.`,
    metrics: { top2ViewsPct: Math.round(pct * 100), totalViews: Math.round(totalViews), sampleSize: vids.length },
  };
};

/** 4. Dead-on-arrival rate — uploads that never got picked up */
const checkDeadUploads: Check = (_ch, vids) => {
  const eligible = vids.filter(v => daysSince(v.publishedAt) >= 7);
  const dead = eligible.filter(v => v.viewCount < BENCH.deadUploadViews);
  const rate = eligible.length ? dead.length / eligible.length : 0;
  const status: CheckStatus = rate <= 0.05 ? 'pass' : rate <= BENCH.deadUploadMaxRate ? 'warn' : 'fail';
  return {
    id: 'dead_uploads', category: 'Upload performance', status, weight: 20,
    score: clamp(100 - rate * 250),
    headline: `${dead.length} of your last ${eligible.length} uploads died under ${BENCH.deadUploadViews} views.`,
    detail: `${Math.round(rate * 100)}% of your uploads (7+ days old) never cleared ${BENCH.deadUploadViews} views. Dead uploads usually mean a packaging problem (title/lane mismatch) rather than a beat-quality problem — the algorithm never even tested them with an audience. Cross-reference your dead uploads against your lane data: if one artist lane produces most of the deaths, cut it.`,
    metrics: { deadCount: dead.length, eligibleCount: eligible.length, deadRatePct: Math.round(rate * 100) },
  };
};

/** 5. Momentum — is the channel trending up or bleeding out? */
const checkMomentum: Check = (_ch, vids) => {
  const byDate = [...vids].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  const recent = byDate.slice(0, 10).map(v => v.viewCount);
  const prior = byDate.slice(10, 40).map(v => v.viewCount);
  const rMed = median(recent), pMed = median(prior);
  const ratio = pMed > 0 ? rMed / pMed : 1;
  const status: CheckStatus =
    ratio >= 1 ? 'pass' : ratio >= BENCH.momentumWarn ? 'warn' : ratio >= BENCH.momentumFail ? 'warn' : 'fail';
  return {
    id: 'momentum', category: 'Channel momentum', status, weight: 18,
    score: clamp(ratio * 75),
    headline: ratio >= 1
      ? `Your last 10 uploads are out-performing your prior median by ${Math.round((ratio - 1) * 100)}%.`
      : `Your last 10 uploads are running ${Math.round((1 - ratio) * 100)}% below your prior median.`,
    detail: `Median views — last 10 uploads: ${Math.round(rMed)}; previous 30: ${Math.round(pMed)}. ${ratio >= 1 ? 'Momentum is positive: identify what changed (lanes, cadence, packaging) and lean into it.' : 'Declining medians usually trace to lane fatigue (an artist search cooling off) or cadence drops. Check whether your recent uploads shifted lanes compared to your best-performing stretch.'}`,
    metrics: { recentMedian: Math.round(rMed), priorMedian: Math.round(pMed), ratioPct: Math.round(ratio * 100) },
  };
};

/** 6. Upload cadence & consistency — the #1 lever in the type-beat game */
const checkCadence: Check = (_ch, vids) => {
  const recent = vids.filter(v => daysSince(v.publishedAt) <= 90);
  const perWeek = recent.length / (90 / 7);
  const sorted = [...vids].sort((a, b) => +new Date(a.publishedAt) - +new Date(b.publishedAt));
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    maxGap = Math.max(maxGap, daysBetween(sorted[i - 1].publishedAt, sorted[i].publishedAt));
  }
  const status: CheckStatus =
    perWeek >= BENCH.cadence.passPerWeek && maxGap <= BENCH.cadence.maxGapDays ? 'pass'
    : perWeek >= BENCH.cadence.warnPerWeek ? 'warn' : 'fail';
  const gapCallout = maxGap > BENCH.cadence.maxGapDays ? ` Longest gap: ${Math.round(maxGap)} days.` : '';
  return {
    id: 'cadence', category: 'Upload cadence', status, weight: 10,
    score: clamp((perWeek / BENCH.cadence.passPerWeek) * 100 - (maxGap > BENCH.cadence.maxGapDays ? 15 : 0)),
    headline: `You're uploading ${perWeek.toFixed(1)} beats/week — the channels winning your lanes post ${BENCH.cadence.passPerWeek}+.${gapCallout}`,
    detail: `Over the last 90 days you published ${recent.length} videos (${perWeek.toFixed(1)}/week), with a longest gap of ${Math.round(maxGap)} days. Type-beat search is a volume-and-recency game: each upload is a new lottery ticket on browse and suggested. Target ${BENCH.cadence.passPerWeek}/week minimum and never let a gap exceed ${BENCH.cadence.maxGapDays} days — consistency signals an active channel to the algorithm.`,
    metrics: { uploadsLast90d: recent.length, perWeek: +perWeek.toFixed(2), maxGapDays: Math.round(maxGap) },
  };
};

// ---------- Aggregate ----------

const CHECKS: Check[] = [
  checkArtistLanes, checkLanePerformance, checkHitDependence,
  checkDeadUploads, checkMomentum, checkCadence,
];

const STATUS_RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

export function runDiagnostic(channel: ChannelInput, videos: VideoInput[]): DiagnosticResult {
  const findings = CHECKS.map(c => c(channel, videos))
    // worst first: fails before warns before passes, then by weighted score
    .sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.score * a.weight - b.score * b.weight);

  const totalWeight = findings.reduce((s, f) => s + f.weight, 0);
  const tallyScore = Math.round(
    findings.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);

  const grade = tallyScore >= 85 ? 'A' : tallyScore >= 70 ? 'B'
    : tallyScore >= 55 ? 'C' : tallyScore >= 40 ? 'D' : 'F';

  // Free report strategy: reveal the 2 worst findings (they carry the numbers
  // that create the aha moment), lock the remaining 4 behind signup.
  const freeFindingIds = findings.slice(0, 2).map(f => f.id);

  return { tallyScore, grade, findings, freeFindingIds };
}
