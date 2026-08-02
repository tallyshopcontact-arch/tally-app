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
import { getLatestAnalysis, getPriorAnalysis } from "@/lib/lanes/db";
import { viewsPerDay, computeStatus, type LaneStatus } from "@/lib/lanes/scoring";
import { cleanArtistName } from "@/lib/lanes/insights";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

const MIN_UPLOADS_FOR_FULL_ANALYSIS = 5;
const MAX_RISING_WINDOWS = 5;

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
  /** Fewer than MIN_UPLOADS_FOR_FULL_ANALYSIS recent uploads were found —
   * callers should show a "limited data" note rather than a thin, overconfident report. */
  limitedData: boolean;
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
// this codebase has to an "artist watchlist" — see lib/lanes/types.ts).
// Titles that don't match any known lane still get bucketed under a
// best-effort extracted artist name so they show up as an "untracked niche"
// in the report instead of silently vanishing (see brief step 4 & 5).

interface LaneRow {
  id: string;
  slug: string;
  display_name: string;
  aliases: string[] | null;
  genre_hint: string | null;
}

interface LaneMatcher {
  laneId: string;
  slug: string;
  displayName: string;
  genreHint: string | null;
  regex: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips punctuation real titles frequently drop or vary ("J. Cole" vs
 * "J COLE", "Joey Bada$$" vs "Joey Badass") so matching isn't sensitive to
 * it — verified against a real channel during testing where every "J. Cole"
 * lane match silently failed against "J COLE" titles until this normalized
 * both sides the same way. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[.'’]/g, "").replace(/\s+/g, " ").trim();
}

async function fetchLaneMatchers(supabase: SupabaseClient): Promise<LaneMatcher[]> {
  const { data, error } = await supabase.from("lanes").select("id, slug, display_name, aliases, genre_hint");
  if (error) throw new Error(`fetchLaneMatchers query failed: ${error.message}`);

  const matchers: LaneMatcher[] = [];
  for (const lane of (data ?? []) as LaneRow[]) {
    const names = [lane.display_name, ...(lane.aliases ?? [])].filter((n) => n && n.trim().length >= 3);
    for (const name of names) {
      matchers.push({
        laneId: lane.id,
        slug: lane.slug,
        displayName: lane.display_name,
        genreHint: lane.genre_hint,
        regex: new RegExp(`\\b${escapeRegExp(normalizeForMatch(name))}\\b`, "i"),
      });
    }
  }
  // Longest display name first — a multi-word artist name should win over a
  // shorter name that happens to be one of its substrings.
  return matchers.sort((a, b) => b.displayName.length - a.displayName.length);
}

function matchKnownLane(title: string, matchers: LaneMatcher[]): LaneMatcher | null {
  const normalizedTitle = normalizeForMatch(title);
  let best: { matcher: LaneMatcher; index: number } | null = null;
  for (const m of matchers) {
    const match = m.regex.exec(normalizedTitle);
    if (match && (best === null || match.index < best.index)) {
      best = { matcher: m, index: match.index };
    }
  }
  return best?.matcher ?? null;
}

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

function detectNiches(uploads: RecentUpload[], matchers: LaneMatcher[]): DetectedNiche[] {
  const groups = new Map<string, DetectedNiche>();

  for (const video of uploads) {
    const known = matchKnownLane(video.title, matchers);
    const fallbackArtist = known ? null : extractFallbackArtist(video.title);
    if (!known && !fallbackArtist) continue; // nothing recognizable in this title

    const key = known ? `lane:${known.laneId}` : `untracked:${fallbackArtist}`;
    let group = groups.get(key);
    if (!group) {
      group = known
        ? {
            artistName: known.displayName,
            laneId: known.laneId,
            slug: known.slug,
            genreHint: known.genreHint,
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

  return [...groups.values()]
    .map((g) => ({ ...g, avgViewsPerDay: Math.round(g.totalViewsPerDay / g.uploadCount) }))
    .sort((a, b) => b.totalViewsPerDay - a.totalViewsPerDay);
}

// ── Step 5 — score tracked niches off already-persisted lane_analyses ────
// Zero new YouTube calls — getLatestAnalysis/getPriorAnalysis are Postgres
// reads over data the lane pipeline already computed.

async function scoreNiches(supabase: SupabaseClient, niches: DetectedNiche[]): Promise<NicheScore[]> {
  const withLane = niches.filter((n): n is DetectedNiche & { laneId: string; slug: string } => !!n.laneId);

  const scores = await Promise.all(
    withLane.map(async (n): Promise<NicheScore | null> => {
      const analysis = await getLatestAnalysis(supabase, n.laneId);
      if (!analysis) return null;
      const prior = await getPriorAnalysis(supabase, n.laneId);
      return {
        laneId: n.laneId,
        artistName: n.artistName,
        slug: n.slug,
        opportunity: analysis.opportunity,
        saturation: analysis.saturation,
        demand: analysis.demand,
        status: computeStatus(analysis.opportunity),
        topVideos: analysis.top_videos ?? [],
        patterns: (analysis.patterns as Record<string, unknown>) ?? {},
        rawMetrics: (analysis.raw_metrics as Record<string, unknown>) ?? {},
        priorOpportunity: prior?.opportunity ?? null,
        priorSaturation: prior?.saturation ?? null,
        analyzedAt: analysis.created_at,
      };
    })
  );

  return scores.filter((s): s is NicheScore => s !== null);
}

// ── Step 6 — rising windows ────────────────────────────────────────────
// No lib/momentum/rising.ts and no artist_momentum_snapshots table exist yet
// in this codebase (the Spotify/Last.fm momentum engine is explicitly out of
// scope for this brief) — this queries the table directly and degrades to
// risingWindowsAvailable:false the moment that query fails, rather than
// importing a module that doesn't exist (which would break the build).

async function getRisingWindows(
  supabase: SupabaseClient,
  genres: string[]
): Promise<{ windows: RisingWindow[]; available: boolean }> {
  const genreList = [...new Set(genres.filter(Boolean))];
  if (!genreList.length) return { windows: [], available: false };

  try {
    const { data, error } = await supabase
      .from("artist_momentum_snapshots")
      .select("artist, genre, momentum_pct, description")
      .in("genre", genreList)
      .order("momentum_pct", { ascending: false })
      .limit(MAX_RISING_WINDOWS);
    if (error) throw error;

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      windows: ((data ?? []) as any[]).map((r) => ({
        artist: r.artist as string,
        genre: (r.genre as string) ?? null,
        momentumPct: Number(r.momentum_pct ?? 0),
        description: (r.description as string) ?? null,
      })),
      available: true,
    };
  } catch {
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

function buildTitleRewrite(
  uploads: RecentUpload[],
  niches: DetectedNiche[],
  nicheScores: NicheScore[]
): TitleRewrite | null {
  if (!uploads.length || !niches.length) return null;

  const worst = [...uploads].sort((a, b) => a.viewsPerDay - b.viewsPerDay)[0];
  const best = niches[0]; // already sorted by totalViewsPerDay desc

  const bestScore = best.laneId ? nicheScores.find((s) => s.laneId === best.laneId) : undefined;
  const topCoMention = (bestScore?.patterns?.topCoMentions as { artist: string }[] | undefined)?.[0];
  const coMention = topCoMention
    ? titleCase(cleanArtistName(topCoMention.artist))
    : niches[1]?.artistName ?? null;

  const beatName = extractBeatName(worst.title);
  const rewrittenTitle = coMention
    ? `[FREE] ${best.artistName} x ${coMention} Type Beat "${beatName}"`
    : `[FREE] ${best.artistName} Type Beat "${beatName}"`;

  return { originalTitle: worst.title, rewrittenTitle, bestNicheName: best.artistName };
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
  const nicheScores = await scoreNiches(supabase, detectedNiches);

  const genres = [...new Set(detectedNiches.map((n) => n.genreHint).filter((g): g is string => !!g))];
  const { windows: risingWindows, available: risingWindowsAvailable } = await getRisingWindows(supabase, genres);

  const titleRewrite = buildTitleRewrite(recentUploads, detectedNiches, nicheScores);

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
    limitedData: recentUploads.length < MIN_UPLOADS_FOR_FULL_ANALYSIS,
  };
}
