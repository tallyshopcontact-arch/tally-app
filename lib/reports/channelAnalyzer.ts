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
import { getLatestAnalysis, getPriorAnalysis, normalizeLaneSlug } from "@/lib/lanes/db";
import { viewsPerDay, computeStatus, type LaneStatus } from "@/lib/lanes/scoring";
import { cleanArtistName } from "@/lib/lanes/insights";
import { getGenreCoMentionCounts } from "@/lib/lanes/trending";
import { fetchLaneMatchers, matchAllKnownLanes, normalizeForMatch, type LaneMatcher } from "@/lib/lanes/nicheMatch";
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

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function monthBounds(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this month
  return { start, end };
}

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
  status: LaneStatus;
  topVideos: unknown[];
  patterns: Record<string, unknown>;
  rawMetrics: Record<string, unknown>;
  priorOpportunity: number | null;
  priorSaturation: number | null;
  analyzedAt: string;
  benchmark: BenchmarkComparison | null;
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

export interface TitleRewrite {
  originalTitle: string;
  rewrittenTitle: string;
  bestNicheName: string;
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
  titleRewrite: TitleRewrite | null;
  /** Fix 4 — false when the majority of the best niche's uploads already use
   * [FREE], the artist name, and a co-mention: the title box would be
   * cosmetic, so the report shows a different message ("gap is niche
   * selection, not titles") instead of a rewrite suggestion. */
  titleRewriteNeeded: boolean;
  /** Fix 2 — true when the channel is mono-niche (≤ MONO_NICHE_MAX_COUNT
   * detected niches) or its best niche is saturated (≥ SATURATED_THRESHOLD).
   * Report's Action Plan leads with expansionRecommendations instead of the
   * current (crowded) niche when this is true. */
  expansionRecommended: boolean;
  expansionRecommendations: ExpansionPick[];
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

// ── Step 5 — score tracked niches off already-persisted lane_analyses ────
// Zero new YouTube calls — getLatestAnalysis/getPriorAnalysis are Postgres
// reads over data the lane pipeline already computed.

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

/** Shared by scoreNiches (the channel's own detected niches) and Fix 2's
 * expansion picks (lanes recommendLane surfaces outside those niches) —
 * both just need "the latest stored score for this lane_id", so both go
 * through one lookup+shape instead of duplicating it. */
async function scoreLane(
  supabase: SupabaseClient,
  laneId: string,
  artistName: string,
  slug: string,
  channelSubs: number
): Promise<NicheScore | null> {
  const analysis = await getLatestAnalysis(supabase, laneId);
  if (!analysis) return null;
  const prior = await getPriorAnalysis(supabase, laneId);
  const topVideos = analysis.top_videos ?? [];
  return {
    laneId,
    artistName,
    slug,
    opportunity: analysis.opportunity,
    saturation: analysis.saturation,
    demand: analysis.demand,
    status: computeStatus(analysis.opportunity),
    topVideos,
    patterns: (analysis.patterns as Record<string, unknown>) ?? {},
    rawMetrics: (analysis.raw_metrics as Record<string, unknown>) ?? {},
    priorOpportunity: prior?.opportunity ?? null,
    priorSaturation: prior?.saturation ?? null,
    analyzedAt: analysis.created_at,
    benchmark: computeBenchmark(topVideos, channelSubs),
  };
}

async function scoreNiches(
  supabase: SupabaseClient,
  niches: DetectedNiche[],
  channelSubs: number
): Promise<NicheScore[]> {
  const withLane = niches.filter((n): n is DetectedNiche & { laneId: string; slug: string } => !!n.laneId);
  const scores = await Promise.all(
    withLane.map((n) => scoreLane(supabase, n.laneId, n.artistName, n.slug, channelSubs))
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
async function buildStylisticNeighborhood(
  supabase: SupabaseClient,
  detectedNiches: DetectedNiche[],
  nicheScores: NicheScore[]
): Promise<Map<string, NeighborhoodCandidate>> {
  const ownNicheKeys = new Set(detectedNiches.map((n) => normalizeForMatch(cleanArtistName(n.artistName))));
  const neighborhood = new Map<string, NeighborhoodCandidate>();

  const upsert = (rawName: string, weight: number, receipt: { pct: number; nicheName: string } | null) => {
    const cleaned = cleanArtistName(rawName);
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
      upsert(c.artist, c.count, { pct: c.pct, nicheName: niche.artistName });
    }
  }

  // Source B — genre-wide co-mention signal (lib/lanes/trending.ts's raw
  // aggregation, NOT its already-laned-artist-excluding export, since laned
  // artists are exactly who we want here). No per-niche pct, so candidates
  // introduced (or reinforced) here get a null receipt unless Source A also
  // grounded them in a real percentage.
  const genres = [...new Set(detectedNiches.map((n) => n.genreHint).filter((g): g is string => !!g))];
  for (const genre of genres) {
    const counts = await getGenreCoMentionCounts(supabase, genre);
    for (const c of counts) upsert(c.artist, c.count, null);
  }

  return neighborhood;
}

// Step 2 — intersect the neighborhood with tracked lanes (a current analysis
// is required to have an opportunity score to rank by at all) and rank by
// co_mention_frequency × opportunity_score, each normalized to 0-1 first so
// neither term dominates purely from scale.
async function rankNeighborhoodCandidates(
  supabase: SupabaseClient,
  neighborhood: Map<string, NeighborhoodCandidate>,
  excludeLaneIds: Set<string>,
  channelSubs: number
): Promise<{ score: NicheScore; receipt: { pct: number; nicheName: string } | null }[]> {
  const candidates = [...neighborhood.values()];
  if (!candidates.length) return [];

  const slugs = candidates.map((c) => normalizeLaneSlug(c.displayName)).filter(Boolean);
  const { data: laneRows } = await supabase.from("lanes").select("id, slug, display_name").in("slug", slugs);
  const laneBySlug = new Map(
    ((laneRows ?? []) as { id: string; slug: string; display_name: string }[]).map((l) => [l.slug, l])
  );

  const maxFrequency = Math.max(0, ...candidates.map((c) => c.frequencyScore));

  const ranked: { score: NicheScore; receipt: { pct: number; nicheName: string } | null; rank: number }[] = [];
  for (const candidate of candidates) {
    const lane = laneBySlug.get(normalizeLaneSlug(candidate.displayName));
    if (!lane || excludeLaneIds.has(lane.id)) continue;

    const score = await scoreLane(supabase, lane.id, lane.display_name, lane.slug, channelSubs);
    if (!score) continue; // "with a current analysis" — no lane_analyses row means no rank

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
    await Promise.all(candidates.map((l) => scoreLane(supabase, l.id, l.display_name, l.slug, channelSubs)))
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
  channelSubs: number
): Promise<ExpansionPick[]> {
  const allowedGenres = allowedExpansionGenres(genre);
  if (!allowedGenres) return []; // channel's own genre is unknown — nothing to safely expand into

  const excluded = new Set(excludeLaneIds);
  const picks: ExpansionPick[] = [];

  // Step 1 + 2
  const neighborhood = await buildStylisticNeighborhood(supabase, detectedNiches, nicheScores);
  const ranked = await rankNeighborhoodCandidates(supabase, neighborhood, excluded, channelSubs);
  for (const r of ranked) {
    if (picks.length >= MAX_EXPANSION_RECOMMENDATIONS) break;
    const candidateGenre = await getLaneGenre(supabase, r.score.laneId); // whitelist safety net
    if (!candidateGenre || !allowedGenres.has(candidateGenre)) continue;
    excluded.add(r.score.laneId);
    picks.push({ score: r.score, receipt: r.receipt });
  }

  // Step 3(a) — fill remaining slots from same-genre lanes only.
  if (picks.length < MAX_EXPANSION_RECOMMENDATIONS) {
    const fillers = await fillFromSameGenre(
      supabase,
      genre,
      excluded,
      channelSubs,
      MAX_EXPANSION_RECOMMENDATIONS - picks.length
    );
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

// ── Step 7 — title rewrite ────────────────────────────────────────────
// Deterministic string manipulation only, no LLM: takes the worst-performing
// recent upload and rewrites it into the winning format for the channel's
// best-performing detected niche.

const QUOTED_NAME_RE = /["'“”‘’](.+?)["'“”‘’]/;

function extractBeatName(title: string): string {
  const quoted = title.match(QUOTED_NAME_RE);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const stripped = title
    .replace(/\[?free\]?/gi, "")
    .replace(/\btype\s*beat\b/gi, "")
    .replace(/\bx\b/gi, "")
    .replace(/[-–—|[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "Untitled";
}

/** Shared by buildTitleRewrite and Step 9's generateExperiment — both need
 * "who does this niche's own winner data pair best with," and both should
 * fall back the same way (the channel's own second niche) when there's no
 * stored co-mention data to point to, rather than each picking differently. */
function pickCoMentionPartner(
  best: DetectedNiche,
  bestScore: NicheScore | undefined,
  niches: DetectedNiche[]
): string | null {
  const topCoMention = (bestScore?.patterns?.topCoMentions as { artist: string }[] | undefined)?.[0];
  return topCoMention ? titleCase(cleanArtistName(topCoMention.artist)) : niches[1]?.artistName ?? null;
}

function buildTitleRewrite(
  uploads: RecentUpload[],
  niches: DetectedNiche[],
  nicheScores: NicheScore[]
): TitleRewrite | null {
  if (!uploads.length || !niches.length) return null;

  const worst = [...uploads].sort((a, b) => a.viewsPerDay - b.viewsPerDay)[0];
  const best = niches[0]; // already sorted by totalViewsPerDay desc

  const bestScore = best.laneId ? nicheScores.find((s) => s.laneId === best.laneId) : undefined;
  const coMention = pickCoMentionPartner(best, bestScore, niches);

  const beatName = extractBeatName(worst.title);
  const rewrittenTitle = coMention
    ? `[FREE] ${best.artistName} x ${coMention} Type Beat "${beatName}"`
    : `[FREE] ${best.artistName} Type Beat "${beatName}"`;

  return { originalTitle: worst.title, rewrittenTitle, bestNicheName: best.artistName };
}

// Fix 4 — before generating a rewrite, check whether the best niche's own
// uploads already follow the winning format ([FREE] + artist name +
// co-mention with the niche's top co-mentioned artist). If a majority
// already do, a rewrite suggestion would be cosmetic — the real gap is
// niche selection, not titling, so the caller should say that instead.
const FREE_PREFIX_RE = /\[\s*free\s*\]/i;

function computeTitleRewriteNeeded(bestNiche: DetectedNiche, bestScore: NicheScore | undefined): boolean {
  if (!bestNiche.videos.length) return true;

  const topCoMention = (bestScore?.patterns?.topCoMentions as { artist: string }[] | undefined)?.[0];
  const coMentionNorm = topCoMention ? normalizeForMatch(cleanArtistName(topCoMention.artist)) : null;
  const artistNorm = normalizeForMatch(bestNiche.artistName);

  const matches = bestNiche.videos.filter((v) => {
    const titleNorm = normalizeForMatch(v.title);
    const hasFree = FREE_PREFIX_RE.test(v.title);
    const hasArtist = titleNorm.includes(artistNorm);
    const hasCoMention = coMentionNorm ? titleNorm.includes(coMentionNorm) : false;
    return hasFree && hasArtist && hasCoMention;
  }).length;

  return matches / bestNiche.videos.length <= 0.5;
}

// ── Step 8 — diagnosis engine ────────────────────────────────────────────
// The report headline: a rules ladder, first match wins, rendered above
// Section 1 as one root cause instead of a wall of stats. Reuses data
// already computed above (detectedNiches, nicheScores/benchmark from Step 5,
// the same FREE_PREFIX_RE/QUOTED_NAME_RE Step 7 uses) rather than
// recomputing any of it.

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
 * beat name. Channel-wide (every upload, not just the best niche's), unlike
 * Fix 4's computeTitleRewriteNeeded, which is deliberately scoped to one
 * niche's specific top co-mention — this is a coarser, whole-channel signal
 * for the discoverability rule below. */
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

function generateExperiment(
  diagnosis: Diagnosis,
  uploads: RecentUpload[],
  detectedNiches: DetectedNiche[],
  bestNiche: DetectedNiche | null,
  bestScore: NicheScore | undefined,
  expansionRecommendations: ExpansionPick[]
): GeneratedExperiment {
  const uploadCount = uploads.length;

  switch (diagnosis.type) {
    case "expansion":
    case "concentration": {
      const pick = pickExpansionOrAdjacent(expansionRecommendations, detectedNiches);
      const currentAvg = bestNiche?.avgViewsPerDay ?? 0;
      const text =
        pick && bestNiche
          ? `Test one upload in ${pick} this month, same title format. Prediction: it outperforms your ${bestNiche.artistName} average of ${currentAvg.toLocaleString()} views/day. ${GRADE_LINE}`
          : `Test one upload in a new adjacent niche this month. Prediction: it outperforms your current average of ${currentAvg.toLocaleString()} views/day. ${GRADE_LINE}`;
      return { text, type: diagnosis.type, predictedMetric: "views_per_day", predictedTarget: currentAvg };
    }

    case "discoverability": {
      const partner = bestNiche ? pickCoMentionPartner(bestNiche, bestScore, detectedNiches) : null;
      const text =
        bestNiche && partner
          ? `On your next upload, add a co-mention: ${bestNiche.artistName} x ${partner}. Prediction: 30–50% more views than your recent average. ${GRADE_LINE}`
          : `On your next upload, add a co-mention and a [FREE] tag${bestNiche ? ` to your ${bestNiche.artistName} titles` : ""}. Prediction: 30–50% more views than your recent average. ${GRADE_LINE}`;
      return {
        text,
        type: diagnosis.type,
        predictedMetric: "views_per_day_pct_lift",
        predictedTarget: DISCOVERABILITY_LIFT_PCT,
      };
    }

    case "positioning": {
      const pick = pickExpansionOrAdjacent(expansionRecommendations, detectedNiches);
      const currentAvg = bestNiche?.avgViewsPerDay ?? 0;
      const text = pick
        ? `Test ${pick} once this month. Prediction: it beats your current per-upload average of ${currentAvg.toLocaleString()}/day. ${GRADE_LINE}`
        : `Test one upload with a different title pattern this month. Prediction: it beats your current per-upload average of ${currentAvg.toLocaleString()}/day. ${GRADE_LINE}`;
      return { text, type: diagnosis.type, predictedMetric: "views_per_day", predictedTarget: currentAvg };
    }

    case "consistency": {
      const target = CONSISTENCY_TARGET_UPLOADS;
      const nicheName = bestNiche?.artistName ?? "your best niche";
      const text = `Post ${target} uploads this month vs your ${uploadCount} last month, all in ${nicheName}. Prediction: total monthly views up proportionally. ${GRADE_LINE}`;
      return { text, type: diagnosis.type, predictedMetric: "upload_count", predictedTarget: target };
    }

    case "scale": {
      const target = scaleTargetUploads(uploadCount);
      const nicheName = bestNiche?.artistName ?? "your best niche";
      const text = `Increase to ${target} uploads in ${nicheName} this month. Prediction: views scale with volume since your per-upload performance is already strong. ${GRADE_LINE}`;
      return { text, type: diagnosis.type, predictedMetric: "upload_count", predictedTarget: target };
    }

    default:
      return assertNeverDiagnosisType(diagnosis.type);
  }
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

  // Fix 4 — skip the rewrite suggestion when the channel's titles already win.
  const titleRewriteNeeded = bestNiche ? computeTitleRewriteNeeded(bestNiche, bestScore) : true;
  const titleRewrite = titleRewriteNeeded ? buildTitleRewrite(recentUploads, detectedNiches, nicheScores) : null;

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

  let expansionRecommendations: ExpansionPick[] = [];
  if (expansionRecommended) {
    const excludeLaneIds = detectedNiches.map((n) => n.laneId).filter((id): id is string => !!id);
    expansionRecommendations = await getExpansionRecommendations(
      supabase,
      detectedNiches,
      nicheScores,
      bestNiche?.genreHint ?? null,
      excludeLaneIds,
      channel.subscriberCount
    );
  }

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

  return {
    channel,
    reportMonth: month,
    reportYear: year,
    recentUploads,
    detectedNiches,
    nicheScores,
    risingWindows,
    risingWindowsAvailable,
    titleRewrite,
    titleRewriteNeeded,
    expansionRecommended: expansionRecommended && expansionRecommendations.length > 0,
    expansionRecommendations,
    limitedData: recentUploads.length < MIN_UPLOADS_FOR_FULL_ANALYSIS,
    diagnosis,
    generatedExperiment,
  };
}
