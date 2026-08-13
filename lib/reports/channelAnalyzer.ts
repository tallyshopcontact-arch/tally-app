// Report Builder — analyzes an arbitrary YouTube channel against TALLY's
// existing lane data to build a growth report (see app/admin/report-builder
// and app/api/admin/report-builder/*). Reuses lib/youtube.ts's channel-ID
// resolver and lib/lanes/{db,scoring,patterns,insights}.ts's already-computed
// scoring/pattern machinery rather than recomputing any of it — the only new
// YouTube calls this file makes are the channel-metadata lookup and the
// uploads-playlist read (steps 1-3 below); everything from step 4 onward is
// either deterministic string matching or a Postgres read.
//
// Deliberately does NOT use search.list (100 units/call) anywhere — recent
// uploads come from the channel's own uploads playlist (playlistItems.list,
// ~1 unit) instead, per the brief.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractChannelId } from "@/lib/youtube";
import { getPriorAnalysis, normalizeLaneSlug } from "@/lib/lanes/db";
import { viewsPerDay, computeStatus, type LaneStatus } from "@/lib/lanes/scoring";
import { monthLabel, monthBounds } from "@/lib/lanes/dateRange";
import { cleanArtistName, cleanCoMention } from "@/lib/lanes/patterns";
import { getGenreCoMentionCounts } from "@/lib/lanes/trending";
import { getNicheData } from "@/lib/reports/nicheCache";
import {
  fetchLaneMatchers,
  matchAllKnownLanes,
  normalizeForMatch,
  pickTitleFormatCoMention,
  buildWinningTitleFormat,
  findSmallChannelExample,
  type LaneMatcher,
} from "@/lib/lanes/nicheMatch";
import { extractCoMention } from "@/lib/lanes/patterns";
import { detectRisingWindows } from "@/lib/momentum/rising";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

const MIN_UPLOADS_FOR_FULL_ANALYSIS = 5;
const MAX_RISING_WINDOWS = 5;

// Fix 2 — expansion recommendations fire when the channel's upload mix looks
// too narrow (few niches) or its best niche is crowded (high saturation).
const MONO_NICHE_MAX_COUNT = 2;
export const SATURATED_THRESHOLD = 80;
const MAX_EXPANSION_RECOMMENDATIONS = 2;

// Fix 1 — benchmark against channels of comparable size, not the whole
// winner pool. A tier with fewer than this many comparable videos is too
// thin to be meaningful, so the benchmark falls back to the full winner set.
const MIN_COMPARABLE_VIDEOS = 3;

// Uploads playlist paging when scanning for a specific calendar month — the
// playlist is newest-first, so paging stops the moment an item published
// before the month's start turns up. The page cap is a safety net against a
// pathological/misordered playlist, not an expected case.
const PLAYLIST_PAGE_SIZE = 50;
const MAX_PLAYLIST_PAGES = 10;
const MAX_UPLOADS_PER_MONTH = 50; // videos.list accepts at most 50 ids per call

// ── Types ────────────────────────────────────────────────────────────────

export interface ChannelMeta {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  videoCount: number;
  publishedAt: string;
  thumbnailUrl: string;
}

export interface RecentUpload {
  videoId: string;
  title: string;
  viewCount: number;
  publishedAt: string;
  viewsPerDay: number;
  tags: string[];
}

export interface DetectedNiche {
  artistName: string;
  laneId: string | null;
  slug: string | null;
  genreHint: string | null;
  uploadCount: number;
  totalViewsPerDay: number;
  avgViewsPerDay: number;
  videos: { videoId: string; title: string; viewsPerDay: number }[];
}

/** Fix 1 — median views/day of a comparable-size benchmark pool, plus enough
 * to label the pool honestly (comparable channels vs. the full winner set). */
export interface BenchmarkComparison {
  medianViewsPerDay: number;
  sampleSize: number;
  /** true = filtered to channels in the analyzed channel's subscriber tier;
   * false = fewer than MIN_COMPARABLE_VIDEOS matched, so this is the full
   * winner pool instead — report copy must label it "top performers", not
   * "comparable channels". */
  isComparableSet: boolean;
}

export interface NicheScore {
  laneId: string;
  artistName: string;
  slug: string;
  opportunity: number;
  saturation: number;
  demand: number;
  /** How often small (sub-threshold) channels break into this niche's top
   * performers — lib/lanes/scoring.ts's computeWinnability, already stored
   * on every lane_analyses row but not previously surfaced through
   * NicheScore. Manual-mode scoring (score-artists route) is what first
   * needed this exposed — the auto-picker never showed it directly. */
  winnability: number;
  status: LaneStatus;
  topVideos: unknown[];
  patterns: Record<string, unknown>;
  rawMetrics: Record<string, unknown>;
  priorOpportunity: number | null;
  priorSaturation: number | null;
  analyzedAt: string;
  benchmark: BenchmarkComparison | null;
  /** True when this came from the shared niche cache (lib/reports/nicheCache.ts)
   * past its freshness window because a re-analysis couldn't get quota —
   * real data, just not current. */
  stale: boolean;
}

/** An expansion recommendation plus the receipts that justify it (Step 4).
 * receipt is null only for a Step 3(a) same-genre fallback pick, which has
 * no co-mention data to cite — the report shows a different, honest line
 * for those instead of fabricating a percentage. */
export interface ExpansionPick {
  score: NicheScore;
  receipt: { pct: number; nicheName: string } | null;
}

export interface RisingWindow {
  artist: string;
  genre: string | null;
  momentumPct: number;
  description: string | null;
}

/** Step 10 — the niche picker's shortlist. Wraps a full NicheScore (rather
 * than a slimmer projection) so the report route's existing plan-card
 * builder — note/receipt included — works unchanged on whichever candidate
 * ends up picked. */
export interface NicheCandidate {
  score: NicheScore;
  /** "manual" — Manual Curation mode (score-artists route): a producer-
   * researched artist name, scored with the same real pipeline as every
   * other source, not picked by the algorithm. */
  source: "own" | "expansion" | "genre" | "manual";
  /** Top 2-3 co-mentions performing well right now, cleaned and self-match-
   * filtered (see lib/lanes/nicheMatch.ts's pickTitleFormatCoMention). */
  topCoMentions: { artist: string; pct: number }[];
  /** Pre-fill for the picker's editable title format field. */
  titleFormatExample: string;
  /** A real title from this niche's stored top_videos, filtered to small
   * channels — cited on the candidate card as proof, not itself editable. */
  realExampleTitle: string | null;
}

export interface ChannelAnalysis {
  channel: ChannelMeta;
  /** The calendar month/year recentUploads (and Section 1's stats) are scoped to. */
  reportMonth: number;
  reportYear: number;
  recentUploads: RecentUpload[];
  detectedNiches: DetectedNiche[];
  nicheScores: NicheScore[];
  risingWindows: RisingWindow[];
  risingWindowsAvailable: boolean;
  /** Fix 2 — true when the channel is mono-niche (≤ MONO_NICHE_MAX_COUNT
   * detected niches) or its best niche is saturated (≥ SATURATED_THRESHOLD).
   * Report's Action Plan leads with expansionRecommendations instead of the
   * current (crowded) niche when this is true. */
  expansionRecommended: boolean;
  expansionRecommendations: ExpansionPick[];
  /** Step 10 — curator model: up to 5 ranked, deduplicated niche candidates
   * for the admin to choose Priority 1, 2 & 3 from (see buildNicheCandidates).
   * Fix 3 — all three priorities are assigned from this one pool now; there
   * is no separate "Priority 3 only" candidate outside it. */
  nicheCandidates: NicheCandidate[];
  /** Step 10 — Priority 3's SENSIBLE DEFAULT (Fix 3 — a pre-selection the
   * admin can change, not a separate auto-filled slot): the channel's own
   * highest-OPPORTUNITY (not highest-velocity) current niche. Always present
   * among nicheCandidates (buildNicheCandidates guarantees it a slot) so the
   * client can pre-select this laneId into Priority 3 on load. */
  defaultHoldCandidate: NicheCandidate | null;
  /** Fix 1's most-common-genre resolution (resolveAnchorGenre) over every
   * detected niche — persisted here rather than only living as a local in
   * analyzeChannel so Manual Curation mode's score-artists route (called in
   * a LATER, separate request, with only this ChannelAnalysis in hand) can
   * anchor its own genre-adjacency/new-lane-genre logic identically instead
   * of re-deriving it a second way. */
  anchorGenre: string | null;
  /** Fewer than MIN_UPLOADS_FOR_FULL_ANALYSIS recent uploads were found —
   * callers should show a "limited data" note rather than a thin, overconfident report. */
  limitedData: boolean;
  /** Step 8 — the report's headline root cause, rendered above Section 1. */
  diagnosis: Diagnosis;
  /** Step 9 — the diagnosis expressed as a testable bet, pre-filled into the
   * experiment textarea. Editable client-side; this is only the starting text. */
  generatedExperiment: GeneratedExperiment;
}

// ── Step 1 — resolve channel ID from any URL format ─────────────────────
// lib/youtube.ts's extractChannelId already handles /channel/UC..., @handle
// (via forHandle), and /c/|/user/ (via forUsername, with a search.list
// fallback only for the rare vanity-name miss) — reused as-is.

async function resolveChannelId(channelUrl: string): Promise<string> {
  const trimmed = channelUrl.trim();
  const directMatch = trimmed.match(/(?:^|\/)(UC[\w-]{20,})(?:$|\/|\?)/);
  if (directMatch) return directMatch[1];
  return extractChannelId(trimmed);
}

// ── Step 2 — channel metadata + uploads playlist ID ──────────────────────
// One channels.list call (part=snippet,statistics,contentDetails) covers the
// brief's steps 1-2 metadata plus the uploads playlist ID step 3 needs —
// YouTube bills per call, not per part, so merging beats two separate calls.

interface ChannelFull extends ChannelMeta {
  uploadsPlaylistId: string | null;
}

async function fetchChannelFull(channelId: string): Promise<ChannelFull> {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: channelId,
    key: KEY,
  });
  const res = await fetch(`${YT}/channels?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status}`);
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error(`Channel not found for ID: ${channelId}`);

  return {
    channelId,
    channelName: (ch.snippet?.title ?? "") as string,
    subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0"),
    videoCount: parseInt(ch.statistics?.videoCount ?? "0"),
    publishedAt: (ch.snippet?.publishedAt ?? "") as string,
    thumbnailUrl: (ch.snippet?.thumbnails?.high?.url ?? ch.snippet?.thumbnails?.default?.url ?? "") as string,
    uploadsPlaylistId: (ch.contentDetails?.relatedPlaylists?.uploads ?? null) as string | null,
  };
}

// ── Step 3 — recent uploads via playlistItems.list + videos.list ────────

async function fetchUploadsPlaylistVideoIdsForMonth(
  playlistId: string,
  month: number,
  year: number
): Promise<string[]> {
  const { start, end } = monthBounds(month, year);
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: String(PLAYLIST_PAGE_SIZE),
      key: KEY,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${YT}/playlistItems?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube playlistItems.list failed: ${res.status}`);
    const data = await res.json();
    const items = (data.items ?? []) as {
      snippet?: { publishedAt?: string };
      contentDetails?: { videoId?: string };
    }[];

    let pastTargetMonth = false;
    for (const item of items) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.snippet?.publishedAt;
      if (!videoId || !publishedAt) continue;
      const publishedDate = new Date(publishedAt);
      if (publishedDate > end) continue; // still newer than the target month — keep paging
      if (publishedDate < start) { pastTargetMonth = true; break; } // playlist is newest-first — nothing further can match
      videoIds.push(videoId);
      if (videoIds.length >= MAX_UPLOADS_PER_MONTH) return videoIds;
    }

    if (pastTargetMonth) break;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return videoIds;
}

async function fetchRecentUploads(uploadsPlaylistId: string, month: number, year: number): Promise<RecentUpload[]> {
  const videoIds = await fetchUploadsPlaylistVideoIdsForMonth(uploadsPlaylistId, month, year);
  if (!videoIds.length) return [];

  const params = new URLSearchParams({ part: "snippet,statistics", id: videoIds.join(","), key: KEY });
  const res = await fetch(`${YT}/videos?${params.toString()}`);
  if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
  const data = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploads = ((data.items ?? []) as any[]).map((v) => {
    const viewCount = parseInt(v.statistics?.viewCount ?? "0");
    const publishedAt = (v.snippet?.publishedAt ?? "") as string;
    return {
      videoId: v.id as string,
      title: (v.snippet?.title ?? "") as string,
      viewCount,
      publishedAt,
      viewsPerDay: Math.round(viewsPerDay({ viewCount, publishedAt })),
      tags: (v.snippet?.tags ?? []) as string[],
    };
  });

  return uploads.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// ── Step 4 — niche detection from titles ─────────────────────────────────
// Matches against every lane's display_name + aliases (the closest thing
// this codebase has to an "artist watchlist" — see lib/lanes/types.ts) via
// lib/lanes/nicheMatch.ts's fetchLaneMatchers/matchKnownLane, shared with
// lib/reports/channelTracking.ts (Phase 1's channel snapshot history) so
// both callers detect niches identically. Titles that don't match any known
// lane still get bucketed under a best-effort extracted artist name so they
// show up as an "untracked niche" in the report instead of silently
// vanishing (see brief step 4 & 5).

// Fallback extraction for a title that doesn't match any known lane — pulls
// the leading artist name out of the usual "{Artist} Type Beat" shape so the
// upload still lands in a bucket (an "untracked niche") instead of being
// dropped entirely. Strips a leading bracketed/parenthesized tag first
// ("[FREE FOR PROFIT]", "(FREE)") since those commonly contain words beyond
// "free" that would otherwise block the match entirely.
const LEADING_TAG_RE = /^\s*[[(][^\])]*[\])]\s*[-–—]?\s*/;
const LEADING_ARTIST_RE = /^\s*([a-z0-9$&.'\- ]{2,40}?)\s*(?:x\s+.+?)?\s*type\s*beat/i;

function extractFallbackArtist(title: string): string | null {
  const stripped = title.replace(LEADING_TAG_RE, "");
  const m = stripped.match(LEADING_ARTIST_RE);
  if (!m) return null;
  const cleaned = cleanArtistName(m[1]);
  return cleaned || null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Fix 1 — a title mentioning several known artists ("Boldy James x Larry June
// x Roc Marciano Type Beat") counts toward every one of them, not just
// whichever matches first. Each video can land in multiple groups below —
// videos[] on two different niches can (and should) contain the same
// videoId when a title co-mentions both. This is also what feeds Fix 1's
// downstream effects for free: buildStylisticNeighborhood already iterates
// detectedNiches and excludes the channel's OWN niches from expansion
// candidates, and scoreNiches already scores every niche with a laneId — so
// once every co-mentioned artist actually lands in detectedNiches, the
// neighborhood and exclusion set are automatically correct without any
// further change there.
function detectNiches(uploads: RecentUpload[], matchers: LaneMatcher[]): DetectedNiche[] {
  const groups = new Map<string, DetectedNiche>();

  for (const video of uploads) {
    const known = matchAllKnownLanes(video.title, matchers);
    const fallbackArtist = known.length ? null : extractFallbackArtist(video.title);
    if (!known.length && !fallbackArtist) continue; // nothing recognizable in this title

    const matches: { key: string; matcher: LaneMatcher | null }[] = known.length
      ? known.map((m) => ({ key: `lane:${m.laneId}`, matcher: m }))
      : [{ key: `untracked:${fallbackArtist}`, matcher: null }];

    for (const { key, matcher } of matches) {
      let group = groups.get(key);
      if (!group) {
        group = matcher
          ? {
              artistName: matcher.displayName,
              laneId: matcher.laneId,
              slug: matcher.slug,
              genreHint: matcher.genreHint,
              uploadCount: 0,
              totalViewsPerDay: 0,
              avgViewsPerDay: 0,
              videos: [],
            }
          : {
              artistName: titleCase(fallbackArtist!),
              laneId: null,
              slug: null,
              genreHint: null,
              uploadCount: 0,
              totalViewsPerDay: 0,
              avgViewsPerDay: 0,
              videos: [],
            };
        groups.set(key, group);
      }
      group.uploadCount += 1;
      group.totalViewsPerDay += video.viewsPerDay;
      group.videos.push({ videoId: video.videoId, title: video.title, viewsPerDay: video.viewsPerDay });
    }
  }

  return [...groups.values()]
    .map((g) => ({ ...g, avgViewsPerDay: Math.round(g.totalViewsPerDay / g.uploadCount) }))
    .sort((a, b) => b.totalViewsPerDay - a.totalViewsPerDay);
}

// Fix 1 (re-check) — now that a co-mention title counts toward every artist
// it names, a channel that only ever posts "X x Y x Z Type Beat" ends up
// with 3 DetectedNiche entries, not 1 — MONO_NICHE_MAX_COUNT's raw niche
// count alone would call that "not mono-niche" and skip expansion, even
// though X/Y/Z aren't 3 independent strategies, they're one bundle wearing
// 3 labels. avgNichesPerUpload catches that: >= 2 means uploads routinely
// land in more than one niche at once, i.e. a tight cluster whose fate rises
// and falls together regardless of how many distinct niches it counts as.
const TIGHT_CLUSTER_MIN_AVG_NICHES_PER_UPLOAD = 2;

function isTightCluster(detectedNiches: DetectedNiche[], uploads: RecentUpload[]): boolean {
  if (!uploads.length || detectedNiches.length < 2) return false;
  const totalNicheHits = detectedNiches.reduce((sum, n) => sum + n.uploadCount, 0);
  return totalNicheHits / uploads.length >= TIGHT_CLUSTER_MIN_AVG_NICHES_PER_UPLOAD;
}

/** Shared by expansionRecommended (analyzeChannel) and the diagnosis engine's
 * concentration rule (Step 8) — both need the identical definition of
 * "mono-niche" so they always agree on when the channel is concentrated,
 * rather than silently drifting into two different thresholds. */
function computeIsMonoNiche(detectedNiches: DetectedNiche[], uploads: RecentUpload[]): boolean {
  const countBased = detectedNiches.length > 0 && detectedNiches.length <= MONO_NICHE_MAX_COUNT;
  return countBased || isTightCluster(detectedNiches, uploads);
}

// ── Step 5 — score tracked niches off the shared niche cache ────────────
// Usually zero new YouTube calls — scoreLane reads through
// lib/reports/nicheCache.ts's getNicheData, a Postgres read for any niche
// whose cached lane_analyses row is still fresh (<7 days by default). Only
// a stale or never-analyzed niche spends real quota, via the existing
// lib/lanes/pipeline.ts analysis pipeline getNicheData calls internally.

interface TopVideoLike {
  subscriberCount?: number;
  viewCount?: number;
  publishedAt?: string;
}

/** < 1K / < 10K / < 50K subs, per the brief's tiers — null means the channel
 * is bigger than any defined tier, so there's no meaningful "comparable
 * channel" cohort and the benchmark falls back to the full winner set. */
function subscriberTierCeiling(channelSubs: number): number | null {
  if (channelSubs < 1_000) return 1_000;
  if (channelSubs < 10_000) return 10_000;
  if (channelSubs < 50_000) return 50_000;
  return null;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeBenchmark(topVideos: unknown[], channelSubs: number): BenchmarkComparison | null {
  const videos = (topVideos as TopVideoLike[]).filter(
    (v) => typeof v.subscriberCount === "number" && typeof v.viewCount === "number" && typeof v.publishedAt === "string"
  );
  if (!videos.length) return null;

  const ceiling = subscriberTierCeiling(channelSubs);
  const comparable = ceiling !== null ? videos.filter((v) => (v.subscriberCount as number) < ceiling) : [];
  const useComparable = comparable.length >= MIN_COMPARABLE_VIDEOS;
  const pool = useComparable ? comparable : videos;

  const vpd = pool.map((v) => viewsPerDay({ viewCount: v.viewCount as number, publishedAt: v.publishedAt as string }));
  return {
    medianViewsPerDay: Math.round(median(vpd)),
    sampleSize: pool.length,
    isComparableSet: useComparable,
  };
}

/** Shared by scoreNiches (the channel's own detected niches), Fix 2's
 * expansion picks, and Step 10's niche-picker candidates — all just need
 * "the current cached score for this niche," so all go through one
 * lookup+shape instead of duplicating it. Reads through
 * lib/reports/nicheCache.ts's getNicheData rather than a direct
 * getLatestAnalysis call — this IS the accuracy-build wiring: a report's
 * niche data comes from the shared, freshness-checked cache (re-analyzing
 * on demand when stale/missing), never a plain unconditional read of
 * whatever's sitting in lane_analyses no matter how old. Takes an artist
 * name + genre rather than a pre-resolved laneId/slug — getOrCreateLane
 * (inside getNicheData) resolves those the same way for an existing lane or
 * a brand-new one, so every caller gets identical behavior whether the
 * niche has been seen before or not. */
async function scoreLane(
  supabase: SupabaseClient,
  artistName: string,
  genreHint: string | null,
  channelSubs: number
): Promise<NicheScore | null> {
  const result = await getNicheData(supabase, artistName, genreHint, {});
  if (!result) return null;
  const { lane, analysis, stale } = result;
  const prior = await getPriorAnalysis(supabase, lane.id);
  const topVideos = analysis.top_videos ?? [];
  return {
    laneId: lane.id,
    artistName,
    slug: lane.slug,
    opportunity: analysis.opportunity,
    saturation: analysis.saturation,
    demand: analysis.demand,
    winnability: analysis.winnability,
    status: computeStatus(analysis.opportunity),
    topVideos,
    patterns: (analysis.patterns as Record<string, unknown>) ?? {},
    rawMetrics: (analysis.raw_metrics as Record<string, unknown>) ?? {},
    priorOpportunity: prior?.opportunity ?? null,
    priorSaturation: prior?.saturation ?? null,
    analyzedAt: analysis.created_at,
    benchmark: computeBenchmark(topVideos, channelSubs),
    stale,
  };
}

async function scoreNiches(
  supabase: SupabaseClient,
  niches: DetectedNiche[],
  channelSubs: number
): Promise<NicheScore[]> {
  const withLane = niches.filter((n): n is DetectedNiche & { laneId: string; slug: string } => !!n.laneId);
  const scores = await Promise.all(
    withLane.map((n) => scoreLane(supabase, n.artistName, n.genreHint, channelSubs))
  );
  return scores.filter((s): s is NicheScore => s !== null);
}

// ── Fix 2 — expansion recommendations for mono-niche/saturated channels ──
// Ranked by co-mention proximity to the channel's own niches, not raw
// genre-bucket opportunity — a prior version reused the "Best Open Lane"
// recommender (lib/lanes/recommendLane), which silently falls back to an
// UNSCOPED (any-genre) search the moment its genre-scoped search comes up
// empty. That's how a country lane (Jelly Roll) and later an off-neighborhood
// pick (YG) surfaced purely on opportunity score, with no real stylistic
// relation to the channel. This version only ever recommends artists the
// channel's own winner data (or its genre neighbors' winner data) already
// shows co-occurring with what the channel makes.

// Only boom bap's adjacency is defined per the current brief. A genre with
// no entry here defaults to itself only (no adjacency) — the conservative
// choice, since an unlisted genre's neighbors are unknown and guessing
// risks repeating the Jelly Roll leak for a different genre. Kept as a final
// safety net on top of the co-mention ranking below (Step 4 of the brief) —
// it should now almost never trigger, since co-mentions and same-genre
// fallback are both already genre-honest, but it catches data anomalies
// (a mis-tagged lane, a garbled co-mention name that happens to slug-match
// something in a different genre).
const GENRE_ADJACENCY: Record<string, string[]> = {
  boombap: ["boombap", "eastcoast", "westcoast", "trap", "drill", "rb", "lofi"],
};

/** Case/punctuation/spacing-insensitive key for genre_hint comparisons —
 * "R&B", "r&b", "R & B" and "Boom Bap" / "boom-bap" should all compare equal. */
function genreKey(g: string | null | undefined): string | null {
  const key = g?.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  return key || null;
}

function allowedExpansionGenres(channelGenre: string | null): Set<string> | null {
  const key = genreKey(channelGenre);
  if (!key) return null; // no genre to anchor on — can't verify adjacency, so don't guess
  return new Set(GENRE_ADJACENCY[key] ?? [key]);
}

/** Fix 1 — the expansion/genre-open sources need a genre to anchor on, but
 * anchoring on detectedNiches[0] ("bestNiche," ranked by total upload
 * velocity — see analyzeChannel) picks whichever niche got the most views
 * this month, not whichever niche actually carries a genre_hint. A channel
 * whose top-velocity niche happens to be an untracked/unclassified lane
 * (genreHint null) still has other niches with a real, shared genre — e.g.
 * Ray Mickey's Earl Sweatshirt lane has no genre_hint, but 4 of the
 * channel's other 5 niches are all "boom bap." Picking bestNiche's genre
 * alone silenced expansion/genre-open entirely for that channel even though
 * a perfectly good anchor genre was sitting right there. This instead takes
 * the most common non-null genre_hint across every detected niche — the
 * channel's actual stylistic majority, not just its single fastest niche. */
function resolveAnchorGenre(detectedNiches: DetectedNiche[]): string | null {
  const counts = new Map<string, { raw: string; count: number }>();
  for (const n of detectedNiches) {
    const key = genreKey(n.genreHint);
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { raw: n.genreHint as string, count: 1 });
  }
  let best: { raw: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.raw ?? null;
}

async function getLaneGenre(supabase: SupabaseClient, laneId: string): Promise<string | null> {
  const { data } = await supabase.from("lanes").select("genre_hint").eq("id", laneId).maybeSingle();
  return genreKey((data as { genre_hint?: string | null } | null)?.genre_hint);
}

interface NeighborhoodCandidate {
  /** cleanArtistName'd + title-cased, for slug lookup and display. */
  displayName: string;
  /** Aggregated co-mention weight across both sources (Step 1). */
  frequencyScore: number;
  /** % of one of the channel's OWN niches' winner titles that co-mention
   * this candidate, and which niche — only Source A (direct) carries this,
   * since it's a per-niche stat. null when the candidate was only reinforced
   * by Source B's genre-wide aggregate, which has no single-niche percentage
   * to report. Step 4's report line shows the real number when present and
   * says so plainly when it isn't, rather than fabricating one. */
  receipt: { pct: number; nicheName: string } | null;
}

// Step 1 — the channel's stylistic neighborhood: who co-occurs with what it
// already makes. Both sources can introduce a candidate name; Source A
// (direct, per-niche) is the only one that can also attach a real
// percentage for Step 4's receipt line.
//
// Fix 1 — this is the actual artist-name discovery mechanism (co-mentions
// pulled from real winning titles, via each niche's own stored patterns.
// topCoMentions plus trending.ts's genre-wide aggregation over every lane
// checked in this genre) — candidates introduced here are NOT required to
// already have a lanes row; rankNeighborhoodCandidates (below) is what turns
// a name into a scored candidate, creating+analyzing a brand-new lane on
// demand when one doesn't exist yet, capped per report.
async function buildStylisticNeighborhood(
  supabase: SupabaseClient,
  detectedNiches: DetectedNiche[],
  nicheScores: NicheScore[]
): Promise<Map<string, NeighborhoodCandidate>> {
  const ownNicheKeys = new Set(detectedNiches.map((n) => normalizeForMatch(cleanArtistName(n.artistName))));
  const neighborhood = new Map<string, NeighborhoodCandidate>();

  // Fix 1 — cleanCoMention, not the bare cleanArtistName normalizer: a raw
  // co-mention capture (or an already-stored one predating the reject-filter
  // fix — see nicheMatch.ts's buildWinningTitleFormat doc comment) can be a
  // genre/style word, a banned phrase like "sample"/"type beat"/"ft", or a
  // garbled multi-"x" chain-capture. cleanArtistName only normalizes/
  // collapses those — it never rejects — so a dirty candidate would have
  // sailed straight into the neighborhood and, after this fix removes the
  // lanes-table boundary below, become a real analyzed "candidate artist."
  // primaryArtistName is empty for Source B (genre-wide, no single owning
  // niche) — cleanCoMention's self-match check is a no-op on an empty
  // string, so only the genre-word/banned-phrase/plausibility checks apply
  // there, same as they always did for Source A.
  const upsert = (
    rawName: string,
    weight: number,
    receipt: { pct: number; nicheName: string } | null,
    primaryArtistName: string
  ) => {
    const cleaned = cleanCoMention(rawName, primaryArtistName);
    if (!cleaned) return;
    const key = normalizeForMatch(cleaned);
    if (!key || ownNicheKeys.has(key)) return; // exclude the channel's own niches

    const existing = neighborhood.get(key);
    if (!existing) {
      neighborhood.set(key, { displayName: titleCase(cleaned), frequencyScore: weight, receipt });
      return;
    }
    existing.frequencyScore += weight;
    if (receipt && (!existing.receipt || receipt.pct > existing.receipt.pct)) existing.receipt = receipt;
  };

  // Source A — direct co-mentions from the channel's own tracked niches.
  for (const niche of detectedNiches) {
    const score = niche.laneId ? nicheScores.find((s) => s.laneId === niche.laneId) : undefined;
    if (!score) continue;
    const topCoMentions =
      (score.patterns?.topCoMentions as { artist: string; count: number; pct: number }[] | undefined) ?? [];
    for (const c of topCoMentions) {
      upsert(c.artist, c.count, { pct: c.pct, nicheName: niche.artistName }, niche.artistName);
    }
  }

  // Source B — genre-wide co-mention signal (lib/lanes/trending.ts's raw
  // aggregation, NOT its already-laned-artist-excluding export, since laned
  // artists are exactly who we want here). No per-niche pct, so candidates
  // introduced (or reinforced) here get a null receipt unless Source A also
  // grounded them in a real percentage. No single owning niche either, so
  // "" for the self-match check (see upsert's doc comment above).
  const genres = [...new Set(detectedNiches.map((n) => n.genreHint).filter((g): g is string => !!g))];
  for (const genre of genres) {
    const counts = await getGenreCoMentionCounts(supabase, genre);
    for (const c of counts) upsert(c.artist, c.count, null, "");
  }

  return neighborhood;
}

/** Fix 1 — one report's budget for analyzing brand-new (never-seeded)
 * artists discovered via co-mentions. Each one costs a real niche analysis
 * (~200 units, see ESTIMATED_UNITS_PER_ANALYSIS) that a request-time report
 * can't spend unbounded — 3 new artists per report keeps a single report's
 * worst case bounded while still being enough to meaningfully widen the
 * picker beyond the seeded lane set. Shared across one getExpansionRecommendations
 * call (which itself runs once per report — see analyzeChannel) via a single
 * mutable object; already-existing (cache-warm) candidates never touch it. */
const MAX_NEW_ARTIST_ANALYSES_PER_REPORT = 3;

interface NewArtistBudget {
  remaining: number;
}

function newArtistBudget(): NewArtistBudget {
  return { remaining: MAX_NEW_ARTIST_ANALYSES_PER_REPORT };
}

// Step 2 — score every neighborhood candidate and rank by co_mention_frequency
// × opportunity_score, each normalized to 0-1 first so neither term dominates
// purely from scale.
//
// Fix 1 — no longer intersected against the lanes table first: a candidate
// name discovered via co-mentions is scored via scoreLane regardless of
// whether it already has a lane row. scoreLane -> getNicheData ->
// getOrCreateLane creates one on demand and analyzeLane fills it in — this
// IS the mechanism that lets the picker surface an artist nobody seeded.
// Candidates are processed highest-frequency-first so the limited new-artist
// budget (above) is spent on the highest-signal discoveries; an
// already-existing lane is always scored regardless of budget (scoring it is
// just a normal cache read/refresh, not a "new artist" spend), which is what
// makes an already-cached candidate implicitly preferred whenever the budget
// would otherwise force a tie — it's simply never gated by it.
async function rankNeighborhoodCandidates(
  supabase: SupabaseClient,
  neighborhood: Map<string, NeighborhoodCandidate>,
  excludeLaneIds: Set<string>,
  channelSubs: number,
  anchorGenre: string | null,
  budget: NewArtistBudget
): Promise<{ score: NicheScore; receipt: { pct: number; nicheName: string } | null }[]> {
  const candidates = [...neighborhood.values()].sort((a, b) => b.frequencyScore - a.frequencyScore);
  if (!candidates.length) return [];

  const slugs = candidates.map((c) => normalizeLaneSlug(c.displayName)).filter(Boolean);
  const { data: laneRows } = await supabase.from("lanes").select("id, slug, display_name").in("slug", slugs);
  const laneBySlug = new Map(
    ((laneRows ?? []) as { id: string; slug: string; display_name: string }[]).map((l) => [l.slug, l])
  );

  const maxFrequency = Math.max(0, ...candidates.map((c) => c.frequencyScore));

  const ranked: { score: NicheScore; receipt: { pct: number; nicheName: string } | null; rank: number }[] = [];
  for (const candidate of candidates) {
    const slug = normalizeLaneSlug(candidate.displayName);
    if (!slug) continue;
    const existingLane = laneBySlug.get(slug);
    if (existingLane && excludeLaneIds.has(existingLane.id)) continue;

    if (!existingLane) {
      if (budget.remaining <= 0) continue; // new-artist cap reached this report — skip, don't spend quota
      budget.remaining -= 1;
    }

    // A brand-new lane only ever gets the channel's own anchor genre as its
    // starting classification — an already-existing lane keeps whatever
    // genre it was actually classified with (null here means "don't touch
    // it"; getOrCreateLane only overwrites when a caller passes a truthy
    // hint). Also what lets getExpansionRecommendations's genre-whitelist
    // safety net (getLaneGenre) recognize a freshly-created lane at all —
    // an ungenred new lane would otherwise fail that check every time.
    const score = await scoreLane(
      supabase,
      candidate.displayName,
      existingLane ? null : anchorGenre,
      channelSubs
    );
    if (!score) continue; // quota exhausted and never analyzed before — no rank to give it
    if (excludeLaneIds.has(score.laneId)) continue; // defensive: a slug collision resolved to an excluded lane

    const normFreq = maxFrequency > 0 ? candidate.frequencyScore / maxFrequency : 0;
    const normOpportunity = score.opportunity / 100;
    ranked.push({ score, receipt: candidate.receipt, rank: normFreq * normOpportunity });
  }

  return ranked.sort((a, b) => b.rank - a.rank).map(({ score, receipt }) => ({ score, receipt }));
}

// Step 3(a) — same-genre fallback (exact match, never the adjacency
// whitelist) ranked purely by opportunity, only used to fill slots the
// co-mention neighborhood couldn't.
async function fillFromSameGenre(
  supabase: SupabaseClient,
  genre: string | null,
  excludeLaneIds: Set<string>,
  channelSubs: number,
  needed: number
): Promise<NicheScore[]> {
  if (!genre?.trim() || needed <= 0) return [];

  const { data: genreLanes } = await supabase
    .from("lanes")
    .select("id, slug, display_name")
    .ilike("genre_hint", genre.trim());
  const candidates = ((genreLanes ?? []) as { id: string; slug: string; display_name: string }[]).filter(
    (l) => !excludeLaneIds.has(l.id)
  );
  if (!candidates.length) return [];

  const scored = (
    await Promise.all(candidates.map((l) => scoreLane(supabase, l.display_name, genre, channelSubs)))
  )
    .filter((s): s is NicheScore => s !== null)
    .sort((a, b) => b.opportunity - a.opportunity);

  return scored.slice(0, needed);
}

async function getExpansionRecommendations(
  supabase: SupabaseClient,
  detectedNiches: DetectedNiche[],
  nicheScores: NicheScore[],
  genre: string | null,
  excludeLaneIds: string[],
  channelSubs: number,
  // Step 10 (picker) needs a deeper pool than Section 4's Action Plan does —
  // callers that only want the report's display list pass
  // MAX_EXPANSION_RECOMMENDATIONS; the picker passes NICHE_CANDIDATE_LIMIT so
  // a saturated mono-cluster channel (few/no viable "own" candidates) still
  // has enough expansion picks to fill up to 5 slots.
  maxPicks: number = MAX_EXPANSION_RECOMMENDATIONS
): Promise<ExpansionPick[]> {
  const allowedGenres = allowedExpansionGenres(genre);
  if (!allowedGenres) return []; // channel's own genre is unknown — nothing to safely expand into

  const excluded = new Set(excludeLaneIds);
  const picks: ExpansionPick[] = [];

  // Step 1 + 2 — Fix 1's new-artist analysis budget lives here, scoped to
  // this one call (getExpansionRecommendations runs exactly once per report
  // — see analyzeChannel), so it needs no cross-call plumbing.
  const neighborhood = await buildStylisticNeighborhood(supabase, detectedNiches, nicheScores);
  const ranked = await rankNeighborhoodCandidates(supabase, neighborhood, excluded, channelSubs, genre, newArtistBudget());
  for (const r of ranked) {
    if (picks.length >= maxPicks) break;
    const candidateGenre = await getLaneGenre(supabase, r.score.laneId); // whitelist safety net
    if (!candidateGenre || !allowedGenres.has(candidateGenre)) continue;
    excluded.add(r.score.laneId);
    picks.push({ score: r.score, receipt: r.receipt });
  }

  // Step 3(a) — fill remaining slots from same-genre lanes only.
  if (picks.length < maxPicks) {
    const fillers = await fillFromSameGenre(supabase, genre, excluded, channelSubs, maxPicks - picks.length);
    for (const score of fillers) {
      const candidateGenre = await getLaneGenre(supabase, score.laneId); // whitelist safety net
      if (!candidateGenre || !allowedGenres.has(candidateGenre)) continue;
      picks.push({ score, receipt: null }); // no co-mention data to cite for a genre-fallback pick
      excluded.add(score.laneId);
    }
  }

  // Step 3(b) — no further fallback. Neither source filling anything means
  // an empty return, and the caller renders the plan without expansion picks.
  return picks;
}

// ── Step 10 — niche picker candidates ────────────────────────────────────
// Curator model: instead of auto-computing the action plan, the admin picks
// 2 priority niches from a ranked shortlist, each with real supporting data.
// Blended from three sources, ranked by opportunity, deduplicated by laneId,
// capped at 5:
//   (a) ALL of the channel's own detected niches, saturated ones included —
//       hard-culling a saturated niche here would leave nothing to blend for
//       a saturated mono-cluster channel, exactly the case expansion (b)/(c)
//       exist for. Saturation only affects rank (opportunity-sorted) and the
//       client-side "Saturated" label, never inclusion.
//   (b) co-mention proximity expansion picks (Fix 2's getExpansionRecommendations,
//       above) — called with maxPicks = NICHE_CANDIDATE_LIMIT here (deeper
//       than Section 4's MAX_EXPANSION_RECOMMENDATIONS-capped display list),
//       so expansion can fill most/all of the shortlist when (a) is thin or
//       entirely saturated.
//   (c) top open niches (opportunity >= 40) in the channel's genre from lane_analyses
// Fix 3 — Priority 3 is now assigned from this SAME 5-candidate pool (no
// separate auto-filled slot outside it), so the channel's own
// highest-opportunity niche (the sensible default for Priority 3) is no
// longer excluded from the shortlist — it's guaranteed a spot in it instead
// (see the guaranteeLaneId handling at the end of buildNicheCandidates), so
// there's always something valid to pre-select into Priority 3 on the client.

const NICHE_CANDIDATE_LIMIT = 5;
// Matches computeStatus's "yellow" floor — the same "not weak" bar used
// everywhere else in this file, so "not saturated" means the same thing
// here that it means in the diagnosis engine and the badge logic. Only
// gates source (c) (genre-open picks, "open" by definition) — source (a)
// is never filtered by this (see comment above).
const NICHE_CANDIDATE_MIN_OPPORTUNITY = 40;
const CO_MENTION_DISPLAY_LIMIT = 3;

/** Top co-mentions "performing well right now," cleaned and self-match-
 * filtered the same way buildWinningTitleFormat is (see
 * lib/lanes/nicheMatch.ts) — a display list can't show "Joey Bada$$" as its
 * own co-mention any more than a title format can be built from it.
 *
 * Uses cleanCoMention (the full reject filter — genre/style words, banned
 * phrases like "sample"/"type beat"/"ft", the primary artist itself), not
 * the bare cleanArtistName normalizer this used to call: this doc comment
 * already claimed reject-filtered parity with buildWinningTitleFormat, but
 * the implementation only normalized, never rejected — a stored
 * topCoMentions entry that predates the reject-filter fix (see
 * scripts/reclean-lanes.ts) could show a genre word as a "clean co-mention"
 * on a candidate card even though the title-format builder correctly
 * excluded it. Manual Curation mode's score-artists route is what surfaced
 * this — its whole premise is "clean co-mentions," so the gap couldn't
 * stand. */
function buildCoMentionDisplay(score: NicheScore): { artist: string; pct: number }[] {
  const raw = (score.patterns?.topCoMentions as { artist: string; pct: number }[] | undefined) ?? [];
  const seen = new Set<string>();
  const out: { artist: string; pct: number }[] = [];
  for (const c of raw) {
    const cleaned = cleanCoMention(c.artist, score.artistName);
    if (!cleaned) continue;
    const norm = normalizeForMatch(cleaned);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ artist: titleCase(cleaned), pct: c.pct });
    if (out.length >= CO_MENTION_DISPLAY_LIMIT) break;
  }
  return out;
}

function toCandidate(score: NicheScore, source: NicheCandidate["source"]): NicheCandidate {
  const patterns = score.patterns as { topCoMentions?: { artist: string }[]; freePrefixPct?: number };
  const titleFormatExample = buildWinningTitleFormat(score.artistName, patterns.topCoMentions, patterns.freePrefixPct);
  const example = findSmallChannelExample(score.topVideos);
  return {
    score,
    source,
    topCoMentions: buildCoMentionDisplay(score),
    titleFormatExample,
    realExampleTitle: example?.title ?? null,
  };
}

// ── Manual Curation mode — score-artists route's scoring primitive ──────
// Lets a producer supply their own researched artist names instead of
// relying on the auto-picker; each one is scored through the exact same
// real pipeline (scoreLane -> getNicheData -> getOrCreateLane/analyzeLane)
// as every other candidate source, so the picks the admin chooses from are
// real numbers, not guesses. Shares Fix 1's new-artist budget/genre-on-
// creation mechanics — a manual name with no existing lane is exactly as
// "new" as a co-mention-discovered one, and must be bounded by the same
// per-request cap for the same quota reason.

export const MAX_MANUAL_ARTISTS = 5;

export interface ManualArtistScoreResult {
  /** The name as the admin typed it — echoed back so the client can
   * correlate a result (or an error) to the input row that produced it. */
  artistName: string;
  /** null only when scoring failed — see error. */
  candidate: NicheCandidate | null;
  /** True when this name had no existing lane and therefore spent one slot
   * of this request's new-artist budget (see MAX_NEW_ARTIST_ANALYSES_PER_REPORT). */
  isNewArtist: boolean;
  error: string | null;
}

/** Scores up to MAX_MANUAL_ARTISTS producer-supplied names. Processes them
 * in the order given — that order IS the admin's own priority signal here
 * (unlike the auto-picker's frequency-ranked neighborhood), so an
 * already-cached name never "steals" another cached name's slot, and the
 * budget is spent on new names strictly in the order the admin listed
 * them. */
export async function scoreManualArtists(
  supabase: SupabaseClient,
  artistNames: string[],
  anchorGenre: string | null,
  channelSubs: number
): Promise<ManualArtistScoreResult[]> {
  const names = artistNames
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, MAX_MANUAL_ARTISTS);

  const budget = newArtistBudget();
  const results: ManualArtistScoreResult[] = [];

  for (const artistName of names) {
    // Matches exactly what getOrCreateLane (inside scoreLane -> getNicheData)
    // will itself compute the slug as — anything else risks this pre-check
    // disagreeing with what actually gets created/found, miscounting the
    // budget.
    const slug = normalizeLaneSlug(artistName);
    const { data: existingLane } = slug
      ? await supabase.from("lanes").select("id").eq("slug", slug).maybeSingle()
      : { data: null };
    const isNewArtist = !existingLane;

    if (isNewArtist && budget.remaining <= 0) {
      results.push({
        artistName,
        candidate: null,
        isNewArtist: true,
        error: `New-artist analysis cap reached for this request (max ${MAX_NEW_ARTIST_ANALYSES_PER_REPORT}) — already-tracked artists still scored fine above; try this one in a separate request.`,
      });
      continue;
    }
    if (isNewArtist) budget.remaining -= 1;

    // Same rule as rankNeighborhoodCandidates: only a brand-new lane gets
    // the anchor genre as its starting classification — an existing lane
    // keeps whatever it was actually classified with.
    const score = await scoreLane(supabase, artistName, isNewArtist ? anchorGenre : null, channelSubs);
    if (!score) {
      results.push({
        artistName,
        candidate: null,
        isNewArtist,
        error: "Could not analyze this artist — YouTube quota exhausted and no cached data on file.",
      });
      continue;
    }

    results.push({ artistName, candidate: toCandidate(score, "manual"), isNewArtist, error: null });
  }

  return results;
}

async function buildNicheCandidates(
  supabase: SupabaseClient,
  nicheScores: NicheScore[],
  expansionRecommendations: ExpansionPick[],
  genre: string | null,
  channelSubs: number,
  // Fix 3 — no longer an exclusion: guaranteed a slot in the final list
  // instead (see the end of this function), so it's always present for the
  // client to pre-select into Priority 3.
  guaranteeLaneId: string | null
): Promise<NicheCandidate[]> {
  const byLaneId = new Map<string, NicheCandidate>();

  const consider = (score: NicheScore, source: NicheCandidate["source"]) => {
    if (byLaneId.has(score.laneId)) return; // first source to introduce a lane keeps its label
    byLaneId.set(score.laneId, toCandidate(score, source));
  };

  // (a) the channel's own detected niches — never hard-culled by opportunity.
  // A saturated current niche is still a real, pickable option (the producer
  // may deliberately choose to hold it); saturation should inform its rank
  // and its "Saturated" label (score.saturation, rendered client-side), not
  // whether it shows up at all. Excluding it here is exactly what left the
  // picker with a single candidate for a saturated mono-cluster channel.
  for (const s of nicheScores) {
    consider(s, "own");
  }

  // (b) co-mention proximity expansion picks — already computed above
  for (const pick of expansionRecommendations) consider(pick.score, "expansion");

  // (c) top open niches in the channel's genre from lane_analyses
  if (genre?.trim()) {
    const { data: genreLanes } = await supabase
      .from("lanes")
      .select("id, slug, display_name")
      .ilike("genre_hint", genre.trim());
    const candidates = ((genreLanes ?? []) as { id: string; slug: string; display_name: string }[]).filter(
      (l) => !byLaneId.has(l.id)
    );
    const scored = (
      await Promise.all(candidates.map((l) => scoreLane(supabase, l.display_name, genre, channelSubs)))
    ).filter((s): s is NicheScore => s !== null);
    for (const s of scored) {
      if (s.opportunity >= NICHE_CANDIDATE_MIN_OPPORTUNITY) consider(s, "genre");
    }
  }

  const ranked = [...byLaneId.values()].sort((a, b) => b.score.opportunity - a.score.opportunity);
  if (!guaranteeLaneId) return ranked.slice(0, NICHE_CANDIDATE_LIMIT);

  const guaranteedIndex = ranked.findIndex((c) => c.score.laneId === guaranteeLaneId);
  if (guaranteedIndex === -1 || guaranteedIndex < NICHE_CANDIDATE_LIMIT) {
    // Either it isn't a candidate at all (shouldn't happen — it's one of
    // nicheScores, always considered under source (a)), or it already
    // naturally makes the cut — nothing special to do.
    return ranked.slice(0, NICHE_CANDIDATE_LIMIT);
  }

  // Fix 3 — outranked by enough expansion/genre picks to fall outside the
  // top N: keep it anyway, in place of the lowest-ranked entry, so the
  // Priority 3 default is always among the candidates the client can
  // actually select it from.
  const top = ranked.slice(0, NICHE_CANDIDATE_LIMIT - 1);
  top.push(ranked[guaranteedIndex]);
  return top;
}

// ── Step 6 — rising windows ────────────────────────────────────────────
// Wired to the real Phase 1 momentum engine (lib/momentum/rising.ts's
// detectRisingWindows over public.watchlist_artists / artist_momentum_snapshots)
// instead of the old placeholder query, which read a table shape
// (artist/genre/momentum_pct/description columns) that was never actually
// built — that version could never return real data even once the momentum
// tables shipped. detectRisingWindows itself already degrades to an empty
// array gracefully (single-snapshot or no-snapshot artists are excluded, not
// errored) while the momentum snapshot cron's weekly history accumulates —
// this wiring is what lets the section light up automatically once that
// history exists, with no further code change needed here.
//
// A channel with multiple detected genres has no single genre to scope the
// query to; rather than guess or run N separate queries, this only passes a
// genre filter when the channel's niches agree on exactly one, and otherwise
// asks for the top-ranked windows across every tracked genre — still ranked
// by the same rising-momentum + open-lane logic, just unscoped.
async function getRisingWindows(
  supabase: SupabaseClient,
  genres: string[]
): Promise<{ windows: RisingWindow[]; available: boolean }> {
  const genreList = [...new Set(genres.filter(Boolean))];
  const genre = genreList.length === 1 ? genreList[0] : undefined;

  try {
    const results = await detectRisingWindows(supabase, { genre, limit: MAX_RISING_WINDOWS });
    return {
      windows: results.map((r) => ({
        artist: r.artist,
        genre: genre ?? null,
        momentumPct: r.pctChange,
        description: r.sentence,
      })),
      available: true,
    };
  } catch (err) {
    console.error("[channelAnalyzer] getRisingWindows failed:", err);
    return { windows: [], available: false };
  }
}

// Title rewrite (formerly Step 7) was removed — the curator-picked action
// plan's title formats (Step 10/report route) already show the right
// structure, so a separate rewrite suggestion was redundant. QUOTED_NAME_RE/
// FREE_PREFIX_RE stay: the diagnosis engine's titleHasWinnerPattern below
// still needs both.
const QUOTED_NAME_RE = /["'“”‘’](.+?)["'“”‘’]/;
const FREE_PREFIX_RE = /\[\s*free\s*\]/i;

/** Used by Step 9's experiment text builder for the discoverability bet's
 * co-mention suggestion. Delegates the actual "find a valid, non-self
 * co-mention" lookup to lib/lanes/nicheMatch.ts's pickTitleFormatCoMention
 * (shared with Step 10's title-format builder, and where the self-match bug
 * fix lives) and adds its own fallback on top: the channel's own second
 * niche, when there's no stored co-mention data to point to at all. Takes
 * just the baseline niche's artist name (Fix 2 — the baseline is no longer
 * necessarily bestNiche, so this no longer requires a full DetectedNiche). */
function pickCoMentionPartner(
  baselineArtistName: string,
  baselineScore: NicheScore | undefined,
  niches: DetectedNiche[]
): string | null {
  const patterns = baselineScore?.patterns as { topCoMentions?: { artist: string }[] } | undefined;
  const coMention = pickTitleFormatCoMention(baselineArtistName, patterns?.topCoMentions);
  return coMention ?? niches[1]?.artistName ?? null;
}

// ── Step 8 — diagnosis engine ────────────────────────────────────────────
// The report headline: a rules ladder, first match wins, rendered above
// Section 1 as one root cause instead of a wall of stats. Reuses data
// already computed above (detectedNiches, nicheScores/benchmark from Step 5,
// the same FREE_PREFIX_RE/QUOTED_NAME_RE above) rather than recomputing any
// of it.

export type DiagnosisType = "expansion" | "concentration" | "discoverability" | "positioning" | "consistency" | "scale";

export interface Diagnosis {
  type: DiagnosisType;
  /** Coach-phrased root cause — the report's headline. Plain text, no HTML;
   * the renderer owns markup/escaping (see app/api/admin/report-builder/report). */
  headline: string;
  /** One supporting sentence citing the real numbers behind the headline. */
  detail: string;
}

// Consistency threshold doubles as rule 3/5's "consistent uploads"
// precondition and rule 4's own trigger — see buildDiagnosis below.
const MIN_CONSISTENT_UPLOADS = 4;

/** A title "has a winner pattern" if it uses any of the three signals real
 * winning titles in this genre lean on — [FREE], a co-mention, or a quoted
 * beat name. Channel-wide (every upload, not scoped to one niche's specific
 * top co-mention) — a coarser, whole-channel signal for the discoverability
 * rule below. */
function titleHasWinnerPattern(title: string): boolean {
  return FREE_PREFIX_RE.test(title) || QUOTED_NAME_RE.test(title) || extractCoMention(title) !== null;
}

function buildDiagnosis(
  uploads: RecentUpload[],
  detectedNiches: DetectedNiche[],
  nicheScores: NicheScore[],
  bestNiche: DetectedNiche | null,
  bestScore: NicheScore | undefined
): Diagnosis {
  const uploadCount = uploads.length;
  const isConsistent = uploadCount >= MIN_CONSISTENT_UPLOADS;
  const benchmark = bestScore?.benchmark;

  // Rule 0 — expansion: every tracked niche the channel currently makes is
  // itself low-opportunity (status "red", < 40/100) — not just one crowded
  // lane (rule 1 below), all of them. More uploads across the board can't
  // fix a ceiling every one of them shares, so this outranks the narrower
  // mono-niche/saturation rule when it applies. Requires at least one scored
  // niche — "no data" isn't the same claim as "confirmed all-weak."
  const allNichesWeak = nicheScores.length > 0 && nicheScores.every((s) => s.status === "red");
  if (allNichesWeak) {
    return {
      type: "expansion",
      headline: "All your current niches are saturated or low-opportunity — your growth path is expansion, not more of the same.",
      detail: `Every niche you posted in this month — ${nicheScores.length === 1 ? nicheScores[0].artistName : `all ${nicheScores.length} of them`} — is scoring under 40/100 opportunity. More volume in these lanes won't raise a shared ceiling; the plan below leads with fresh niches your own co-mentions already point to.`,
    };
  }

  // Rule 1 — concentration: mono-niche (or a tight X-x-Y-x-Z cluster wearing
  // several niche labels — see computeIsMonoNiche) AND the top niche is saturated.
  const isMonoNiche = computeIsMonoNiche(detectedNiches, uploads);
  const topSaturation = bestScore?.saturation ?? null;
  if (isMonoNiche && topSaturation !== null && topSaturation >= SATURATED_THRESHOLD && bestNiche) {
    return {
      type: "concentration",
      headline: "You're stuck in one crowded lane.",
      detail: `${detectedNiches.length} niche${detectedNiches.length === 1 ? "" : "s"} detected this month, and your top niche — ${bestNiche.artistName} — is sitting at ${topSaturation}/100 saturation. Doubling down here means competing against everyone already in it; the fix is opening a second lane, not posting more in this one.`,
    };
  }

  // Rule 2 — discoverability: majority of titles skip every winning signal.
  const withPattern = uploads.filter((u) => titleHasWinnerPattern(u.title)).length;
  if (uploadCount > 0 && withPattern / uploadCount < 0.5) {
    const missingPct = Math.round(((uploadCount - withPattern) / uploadCount) * 100);
    return {
      type: "discoverability",
      headline: "Your videos aren't giving YouTube a reason to surface them.",
      detail: `${missingPct}% of this month's uploads skip every winning signal — no [FREE] tag, no co-mention, no quoted beat name. Those are exactly what small-channel winners in this genre use to get found; fix the titles before anything else.`,
    };
  }

  // Rule 3 — positioning: consistent volume, but velocity trails the peer median.
  if (isConsistent && bestNiche && benchmark && benchmark.medianViewsPerDay > 0 && bestNiche.avgViewsPerDay < benchmark.medianViewsPerDay) {
    return {
      type: "positioning",
      headline: "You're uploading consistently, but losing on the video itself.",
      detail: `Your ${bestNiche.artistName} uploads are averaging ${bestNiche.avgViewsPerDay.toLocaleString()} views/day against a peer median of ${benchmark.medianViewsPerDay.toLocaleString()}/day. The volume is right — the packaging isn't winning yet.`,
    };
  }

  // Rule 4 — consistency: not enough uploads to trust a trend at all.
  if (!isConsistent) {
    return {
      type: "consistency",
      headline: "The biggest lever right now is just uploading more.",
      detail: `Only ${uploadCount} upload${uploadCount === 1 ? "" : "s"} logged this month — that's not enough volume for a real trend to show up, in this report or in YouTube's own algorithm. Get to at least ${MIN_CONSISTENT_UPLOADS} uploads a month before anything else will move the needle.`,
    };
  }

  // Rule 5 — scale: velocity at/above the peer median, uploads consistent.
  if (bestNiche && benchmark && benchmark.medianViewsPerDay > 0) {
    return {
      type: "scale",
      headline: "What you're doing is working — the fix is more of it.",
      detail: `Your ${bestNiche.artistName} uploads are averaging ${bestNiche.avgViewsPerDay.toLocaleString()} views/day, at or above the ${benchmark.medianViewsPerDay.toLocaleString()}/day peer median, across ${uploadCount} uploads this month. This is a volume play now, not a strategy pivot.`,
    };
  }

  // Fallback — consistent, clean uploads but no peer benchmark to rank
  // velocity against yet (untracked niche, or a lane with no analysis on
  // file). None of rules 1-5 have enough signal to fire; say that plainly
  // rather than forcing a stat-free rule to match.
  return {
    type: "scale",
    headline: bestNiche
      ? "Keep the volume up while TALLY builds a benchmark for this niche."
      : "Keep the volume up while TALLY catches up to what niche you're in.",
    detail: bestNiche
      ? `You posted ${uploadCount} uploads this month with clean, winning-format titles. There isn't a peer benchmark for ${bestNiche.artistName} yet to compare velocity against — keep the pace up and next month's report will have a real comparison.`
      : `You posted ${uploadCount} uploads this month, but TALLY couldn't confidently match them to a tracked niche. Once titles settle into a consistent "{Artist} Type Beat" pattern, niche detection — and a real peer benchmark — will kick in.`,
  };
}

// ── Step 9 — experiment generation ────────────────────────────────────────
// The experiment isn't a separate idea from the diagnosis — it's the
// diagnosis expressed as a testable bet, filled with this channel's real
// numbers so the client only ever edits, never starts from a blank box.
// Every template ends in the same grading commitment, and every prediction
// carries a machine-readable metric/target pair alongside the prose so next
// month's (not-yet-built) grading loop has something structured to check
// against, not just a sentence to re-parse.

export interface GeneratedExperiment {
  text: string;
  type: DiagnosisType;
  predictedMetric: "views_per_day" | "views_per_day_pct_lift" | "upload_count";
  predictedTarget: number;
}

const GRADE_LINE = "We'll grade this next month.";
// Diagnosis rule 4's own threshold — reused here so the consistency bet asks
// for exactly the volume the diagnosis said was missing, not a different
// number invented separately.
const CONSISTENCY_TARGET_UPLOADS = MIN_CONSISTENT_UPLOADS;
const DISCOVERABILITY_LIFT_PCT = 40; // midpoint of the 30-50% range the copy quotes

function scaleTargetUploads(currentUploads: number): number {
  return Math.max(currentUploads + 2, Math.ceil(currentUploads * 1.5));
}

/** Concentration and expansion (Step 8 rules 0/1) share a bet: test the
 * strongest available pick — a real expansion recommendation if one exists,
 * else the channel's own second niche — against the current top niche's
 * average. */
function pickExpansionOrAdjacent(
  expansionRecommendations: ExpansionPick[],
  detectedNiches: DetectedNiche[]
): string | null {
  return expansionRecommendations[0]?.score.artistName ?? detectedNiches[1]?.artistName ?? null;
}

function assertNeverDiagnosisType(type: never): never {
  throw new Error(`generateExperiment: unhandled diagnosis type "${type}"`);
}

/** Fix 2 — everything the text templates below need, already resolved by
 * the caller: what to test (pick) and what to test it against (baseline).
 * Both entry points below (the analysis-time draft and the post-selection
 * regenerate) build one of these differently, then share this one switch —
 * so the copy can never drift between "what the draft says at analysis
 * time" and "what it says once the admin has actually built a plan." */
interface ExperimentContext {
  /** The niche to test — algorithmically guessed at analysis time,
   * Priority 1's real artist name once the admin has assigned it. */
  pick: string | null;
  /** What `pick` is being tested against — bestNiche at analysis time,
   * Priority 3/hold's niche once assigned (falling back to bestNiche when
   * Priority 3 is an expansion/genre pick the channel has no upload history
   * in yet — see regenerateExperiment). */
  baseline: { artistName: string; avgViewsPerDay: number } | null;
  /** baseline's NicheScore, for the discoverability bet's stored co-mention
   * data — undefined when baseline has no scored analysis on file. */
  baselineScore: NicheScore | undefined;
  detectedNiches: DetectedNiche[];
}

function buildExperimentText(
  diagnosisType: DiagnosisType,
  uploadCount: number,
  ctx: ExperimentContext
): GeneratedExperiment {
  const { pick, baseline, baselineScore, detectedNiches } = ctx;

  switch (diagnosisType) {
    case "expansion":
    case "concentration": {
      const currentAvg = baseline?.avgViewsPerDay ?? 0;
      const text =
        pick && baseline
          ? `Test one upload in ${pick} this month, same title format. Prediction: it outperforms your ${baseline.artistName} average of ${currentAvg.toLocaleString()} views/day. ${GRADE_LINE}`
          : `Test one upload in a new adjacent niche this month. Prediction: it outperforms your current average of ${currentAvg.toLocaleString()} views/day. ${GRADE_LINE}`;
      return { text, type: diagnosisType, predictedMetric: "views_per_day", predictedTarget: currentAvg };
    }

    case "discoverability": {
      const partner = baseline ? pickCoMentionPartner(baseline.artistName, baselineScore, detectedNiches) : null;
      const text =
        baseline && partner
          ? `On your next upload, add a co-mention: ${baseline.artistName} x ${partner}. Prediction: 30–50% more views than your recent average. ${GRADE_LINE}`
          : `On your next upload, add a co-mention and a [FREE] tag${baseline ? ` to your ${baseline.artistName} titles` : ""}. Prediction: 30–50% more views than your recent average. ${GRADE_LINE}`;
      return {
        text,
        type: diagnosisType,
        predictedMetric: "views_per_day_pct_lift",
        predictedTarget: DISCOVERABILITY_LIFT_PCT,
      };
    }

    case "positioning": {
      const currentAvg = baseline?.avgViewsPerDay ?? 0;
      const text = pick
        ? `Test ${pick} once this month. Prediction: it beats your current per-upload average of ${currentAvg.toLocaleString()}/day. ${GRADE_LINE}`
        : `Test one upload with a different title pattern this month. Prediction: it beats your current per-upload average of ${currentAvg.toLocaleString()}/day. ${GRADE_LINE}`;
      return { text, type: diagnosisType, predictedMetric: "views_per_day", predictedTarget: currentAvg };
    }

    case "consistency": {
      const target = CONSISTENCY_TARGET_UPLOADS;
      const nicheName = pick ?? baseline?.artistName ?? "your best niche";
      const text = `Post ${target} uploads this month vs your ${uploadCount} last month, all in ${nicheName}. Prediction: total monthly views up proportionally. ${GRADE_LINE}`;
      return { text, type: diagnosisType, predictedMetric: "upload_count", predictedTarget: target };
    }

    case "scale": {
      const target = scaleTargetUploads(uploadCount);
      const nicheName = pick ?? baseline?.artistName ?? "your best niche";
      const text = `Increase to ${target} uploads in ${nicheName} this month. Prediction: views scale with volume since your per-upload performance is already strong. ${GRADE_LINE}`;
      return { text, type: diagnosisType, predictedMetric: "upload_count", predictedTarget: target };
    }

    default:
      return assertNeverDiagnosisType(diagnosisType);
  }
}

/** Step 9's analysis-time draft — the diagnosis expressed as a testable bet
 * before any priorities are picked, using the same algorithmic guesses the
 * plan itself falls back on (pickExpansionOrAdjacent, bestNiche). Pre-fills
 * the picker's experiment field the moment analysis loads; regenerateExperiment
 * (below) is what refreshes it once the admin actually builds a plan. */
function generateExperiment(
  diagnosis: Diagnosis,
  uploads: RecentUpload[],
  detectedNiches: DetectedNiche[],
  bestNiche: DetectedNiche | null,
  bestScore: NicheScore | undefined,
  expansionRecommendations: ExpansionPick[]
): GeneratedExperiment {
  const pick = pickExpansionOrAdjacent(expansionRecommendations, detectedNiches);
  const baseline = bestNiche ? { artistName: bestNiche.artistName, avgViewsPerDay: bestNiche.avgViewsPerDay } : null;
  return buildExperimentText(diagnosis.type, uploads.length, {
    pick,
    baseline,
    baselineScore: bestScore,
    detectedNiches,
  });
}

/** Fix 2 — a niche/laneId pair from whatever the client currently has
 * assigned to a priority slot; artistName travels with laneId rather than
 * being re-looked-up here since the caller (the picker UI) already has it
 * on hand from the candidate it assigned. */
export interface ExperimentPrioritySelection {
  laneId: string;
  artistName: string;
}

export interface ExperimentSelectionInput {
  priority1?: ExperimentPrioritySelection | null;
  priority3?: ExperimentPrioritySelection | null;
}

/** Step 9 (Fix 2) — regenerates the draft experiment from the admin's actual
 * Priority 1/3 picks instead of the analysis-time algorithmic guess, so the
 * bet tests the real plan the admin just built rather than a niche they may
 * not have selected at all. Pure function of the already-computed analysis
 * plus the current selection — no I/O, safe to call on every picker change.
 * Priority 2 doesn't factor in: like the original draft, the copy only ever
 * names one niche to test (pick) against one baseline, and Priority 2 has no
 * role in either slot. */
export function regenerateExperiment(
  analysis: ChannelAnalysis,
  selection: ExperimentSelectionInput
): GeneratedExperiment {
  const detectedNiches = analysis.detectedNiches;
  const bestNiche = detectedNiches[0] ?? null;

  // Fix 3 — Priority 3 can now be an expansion/genre pick, not just one of
  // the channel's own niches, so it may have no avgViewsPerDay of its own to
  // baseline against (the channel has no upload history in it yet). Falls
  // back to the channel's overall top niche in that case — the same
  // baseline the analysis-time draft always used.
  const p3Detected = selection.priority3
    ? detectedNiches.find((n) => n.laneId === selection.priority3!.laneId)
    : undefined;
  const baseline = p3Detected
    ? { artistName: p3Detected.artistName, avgViewsPerDay: p3Detected.avgViewsPerDay }
    : bestNiche
      ? { artistName: bestNiche.artistName, avgViewsPerDay: bestNiche.avgViewsPerDay }
      : null;
  const baselineLaneId = p3Detected?.laneId ?? bestNiche?.laneId ?? null;
  const baselineScore = baselineLaneId ? analysis.nicheScores.find((s) => s.laneId === baselineLaneId) : undefined;

  // The real plan's top bet once assigned; falls back to the same
  // algorithmic guess the initial draft used so the field still reads
  // sensibly for whichever priority slots aren't assigned yet.
  const pick =
    selection.priority1?.artistName ?? pickExpansionOrAdjacent(analysis.expansionRecommendations, detectedNiches);

  return buildExperimentText(analysis.diagnosis.type, analysis.recentUploads.length, {
    pick,
    baseline,
    baselineScore,
    detectedNiches,
  });
}

// ── Entry point ────────────────────────────────────────────────────────

export async function analyzeChannel(
  supabase: SupabaseClient,
  channelUrl: string,
  month: number,
  year: number
): Promise<ChannelAnalysis> {
  const channelId = await resolveChannelId(channelUrl);
  const { uploadsPlaylistId, ...channel } = await fetchChannelFull(channelId);

  const recentUploads = uploadsPlaylistId ? await fetchRecentUploads(uploadsPlaylistId, month, year) : [];

  if (!recentUploads.length) {
    throw new Error(`No uploads found for ${monthLabel(month, year)} — try a different month.`);
  }

  const matchers = await fetchLaneMatchers(supabase);
  const detectedNiches = detectNiches(recentUploads, matchers);
  const nicheScores = await scoreNiches(supabase, detectedNiches, channel.subscriberCount);

  const genres = [...new Set(detectedNiches.map((n) => n.genreHint).filter((g): g is string => !!g))];
  const { windows: risingWindows, available: risingWindowsAvailable } = await getRisingWindows(supabase, genres);

  const bestNiche = detectedNiches[0] ?? null;
  const bestScore = bestNiche?.laneId ? nicheScores.find((s) => s.laneId === bestNiche.laneId) : undefined;

  // Step 8 — the report headline: one root cause, first rule in the ladder to match.
  const diagnosis = buildDiagnosis(recentUploads, detectedNiches, nicheScores, bestNiche, bestScore);

  // Fix 2 — mono-niche (or a tight co-mention cluster), a saturated best
  // niche, or every tracked niche reading low-opportunity all independently
  // warrant the same move: surface expansion picks instead of doubling down
  // on a crowded/narrow/ceiling-capped lineup. Mirrors buildDiagnosis's rule
  // 0/1 exactly (computeIsMonoNiche, allNichesWeak) so the diagnosis headline
  // and this flag never disagree about when expansion is warranted.
  const isMonoNiche = computeIsMonoNiche(detectedNiches, recentUploads);
  const isSaturated = (bestScore?.saturation ?? 0) >= SATURATED_THRESHOLD;
  const allNichesWeak = nicheScores.length > 0 && nicheScores.every((s) => s.status === "red");
  const expansionRecommended = isMonoNiche || isSaturated || allNichesWeak;

  // Computed unconditionally now (previously gated behind expansionRecommended)
  // — Step 10's niche picker wants co-mention proximity candidates regardless
  // of whether the channel structurally "needs" expansion, and Step 9's
  // experiment generator already consumed this every time too.
  //
  // Fetched at picker depth (NICHE_CANDIDATE_LIMIT), not the report's display
  // depth (MAX_EXPANSION_RECOMMENDATIONS) — a saturated mono-cluster channel
  // is exactly the case where the picker needs to lean hardest on expansion
  // to fill its 5 slots, and 2 picks isn't enough pool for that. Section 4's
  // Action Plan still only ever shows MAX_EXPANSION_RECOMMENDATIONS of them
  // (sliced below); the deeper pool is picker-only.
  const excludeLaneIds = detectedNiches.map((n) => n.laneId).filter((id): id is string => !!id);
  const anchorGenre = resolveAnchorGenre(detectedNiches);
  const expansionCandidatePool = await getExpansionRecommendations(
    supabase,
    detectedNiches,
    nicheScores,
    anchorGenre,
    excludeLaneIds,
    channel.subscriberCount,
    NICHE_CANDIDATE_LIMIT
  );
  const expansionRecommendations = expansionCandidatePool.slice(0, MAX_EXPANSION_RECOMMENDATIONS);

  // Step 9 — the experiment is the diagnosis expressed as a testable bet.
  // Computed after expansionRecommendations so a concentration/positioning
  // bet can point at a real pick rather than a generic one.
  const generatedExperiment = generateExperiment(
    diagnosis,
    recentUploads,
    detectedNiches,
    bestNiche,
    bestScore,
    expansionRecommendations
  );

  // Step 10 — the niche picker's shortlist. Priority 3/hold's DEFAULT
  // (Fix 3 — no longer a separate auto-filled slot; the client pre-selects
  // this laneId into Priority 3 from the same nicheCandidates pool, and the
  // admin can change it) is the channel's highest-OPPORTUNITY niche (not
  // bestNiche, which is ranked by total velocity) — a different, deliberate
  // ranking from everything else in this file, since "what to keep doing"
  // should follow the opportunity score, not raw upload volume.
  const holdScore = [...nicheScores].sort((a, b) => b.opportunity - a.opportunity)[0] ?? null;
  const defaultHoldCandidate = holdScore ? toCandidate(holdScore, "own") : null;
  const nicheCandidates = await buildNicheCandidates(
    supabase,
    nicheScores,
    expansionCandidatePool,
    anchorGenre,
    channel.subscriberCount,
    holdScore?.laneId ?? null // guaranteed a slot in nicheCandidates — see buildNicheCandidates
  );

  return {
    channel,
    reportMonth: month,
    reportYear: year,
    recentUploads,
    detectedNiches,
    nicheScores,
    risingWindows,
    risingWindowsAvailable,
    expansionRecommended: expansionRecommended && expansionRecommendations.length > 0,
    expansionRecommendations,
    nicheCandidates,
    defaultHoldCandidate,
    anchorGenre,
    limitedData: recentUploads.length < MIN_UPLOADS_FOR_FULL_ANALYSIS,
    diagnosis,
    generatedExperiment,
  };
}
