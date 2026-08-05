// Rising-window detection over the streaming momentum snapshot history (see
// lib/momentum/snapshot.ts). Deliberately tolerant of thin history: this
// will return empty/low-confidence results for the collector's first month
// — that's expected and correct, not a bug, since it takes ~28 days of
// weekly snapshots to have a real comparison window. The report already
// hides this section when data is absent.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestAnalysis } from "../lanes/db";

const TARGET_WINDOW_DAYS = 28;
// How close to the 28-day target a comparison snapshot has to be to count as
// a real window (confidence: "high") rather than a best-effort fallback to
// whatever's oldest (confidence: "low") — generous enough to tolerate a
// missed weekly run without silently downgrading every artist to "low".
const WINDOW_TOLERANCE_DAYS = 7;
const SATURATION_RISING_MAX = 60;
// Saturation-below-threshold bonus, applied in the same 0-100-ish space as
// pctChange so it can meaningfully move an artist up the ranking without
// swamping a genuinely large pctChange swing.
const OPEN_LANE_RANK_BONUS = 25;
const DEFAULT_LIMIT = 20;

interface WatchlistRow {
  id: string;
  artist_name: string;
  genre: string | null;
  lane_id: string | null;
}

interface SnapshotRow {
  watchlist_artist_id: string;
  spotify_followers: number | null;
  lastfm_listeners: number | null;
  snapshot_date: string;
}

export type Confidence = "high" | "low";

export interface RisingWindow {
  artist: string;
  pctChange: number;
  confidence: Confidence;
  saturation: number | null;
  /** True when the artist has no lane_id — "rising, but not a lane TALLY
   * already tracks" is itself a useful signal, so these are still returned
   * rather than dropped. */
  emergingUntracked: boolean;
  sentence: string;
}

function daysBetween(a: string, b: Date): number {
  return Math.abs(new Date(a).getTime() - b.getTime()) / 86_400_000;
}

function pctChangeOf(oldVal: number | null, newVal: number | null): number | null {
  if (oldVal === null || newVal === null || oldVal <= 0) return null;
  return ((newVal - oldVal) / oldVal) * 100;
}

/** Picks the comparison snapshot for a "~28 days ago" window: the snapshot
 * closest to that target date. If nothing lands within tolerance, falls back
 * to the single oldest snapshot available and flags the result low-confidence
 * rather than silently comparing against a window that isn't really ~28 days. */
function pickComparisonSnapshot(
  older: SnapshotRow[],
  latestDate: string
): { snapshot: SnapshotRow; confidence: Confidence } {
  const target = new Date(latestDate);
  target.setUTCDate(target.getUTCDate() - TARGET_WINDOW_DAYS);

  let closest = older[0];
  let closestDiff = daysBetween(closest.snapshot_date, target);
  for (const s of older) {
    const diff = daysBetween(s.snapshot_date, target);
    if (diff < closestDiff) {
      closest = s;
      closestDiff = diff;
    }
  }

  if (closestDiff <= WINDOW_TOLERANCE_DAYS) {
    return { snapshot: closest, confidence: "high" };
  }

  const oldest = [...older].sort(
    (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
  )[0];
  return { snapshot: oldest, confidence: "low" };
}

function buildSentence(
  artistName: string,
  pctChange: number,
  confidence: Confidence,
  saturation: number | null,
  emergingUntracked: boolean
): string {
  const direction = pctChange >= 0 ? "up" : "down";
  const pctStr = `${Math.abs(Math.round(pctChange))}%`;
  const confidenceNote = confidence === "low" ? " (early read — limited history so far)" : "";
  let sentence = `${artistName} is ${direction} ${pctStr} over the last ~${TARGET_WINDOW_DAYS} days${confidenceNote}.`;

  if (saturation !== null) {
    sentence +=
      saturation < SATURATION_RISING_MAX
        ? " That lane is still open."
        : " That lane is already crowded, though.";
  } else if (emergingUntracked) {
    sentence += " Not yet a lane TALLY tracks — worth a look.";
  }

  return sentence;
}

export interface DetectRisingWindowsOptions {
  genre?: string;
  limit?: number;
}

export async function detectRisingWindows(
  supabase: SupabaseClient,
  opts: DetectRisingWindowsOptions = {}
): Promise<RisingWindow[]> {
  let query = supabase.from("watchlist_artists").select("id, artist_name, genre, lane_id").eq("active", true);
  if (opts.genre?.trim()) query = query.ilike("genre", opts.genre.trim());

  const { data: artistRows, error: artistErr } = await query;
  if (artistErr) throw new Error(`detectRisingWindows artist query failed: ${artistErr.message}`);

  const artists = (artistRows ?? []) as WatchlistRow[];
  if (!artists.length) return [];

  const artistIds = artists.map((a) => a.id);
  const { data: snapshotRows, error: snapErr } = await supabase
    .from("artist_momentum_snapshots")
    .select("watchlist_artist_id, spotify_followers, lastfm_listeners, snapshot_date")
    .in("watchlist_artist_id", artistIds)
    .order("snapshot_date", { ascending: false });
  if (snapErr) throw new Error(`detectRisingWindows snapshot query failed: ${snapErr.message}`);

  const snapshotsByArtist = new Map<string, SnapshotRow[]>();
  for (const row of (snapshotRows ?? []) as SnapshotRow[]) {
    const list = snapshotsByArtist.get(row.watchlist_artist_id) ?? [];
    list.push(row);
    snapshotsByArtist.set(row.watchlist_artist_id, list);
  }

  const results: (RisingWindow & { rankScore: number })[] = [];

  for (const artist of artists) {
    // Already sorted newest-first from the query above.
    const snapshots = snapshotsByArtist.get(artist.id) ?? [];
    if (snapshots.length < 2) continue; // only one snapshot — exclude entirely, nothing to compare

    const [latest, ...older] = snapshots;
    const { snapshot: comparison, confidence } = pickComparisonSnapshot(older, latest.snapshot_date);

    const spotifyPct = pctChangeOf(comparison.spotify_followers, latest.spotify_followers);
    const lastfmPct = pctChangeOf(comparison.lastfm_listeners, latest.lastfm_listeners);
    const signals = [spotifyPct, lastfmPct].filter((n): n is number => n !== null);
    if (!signals.length) continue; // neither metric has two comparable readings — no momentum signal to report

    const pctChange = signals.reduce((sum, n) => sum + n, 0) / signals.length;

    let saturation: number | null = null;
    if (artist.lane_id) {
      const analysis = await getLatestAnalysis(supabase, artist.lane_id);
      saturation = analysis?.saturation ?? null;
    }
    const emergingUntracked = !artist.lane_id;

    const openLaneBonus = saturation !== null && saturation < SATURATION_RISING_MAX ? OPEN_LANE_RANK_BONUS : 0;
    const rankScore = pctChange + openLaneBonus;

    results.push({
      artist: artist.artist_name,
      pctChange: Math.round(pctChange * 10) / 10,
      confidence,
      saturation,
      emergingUntracked,
      sentence: buildSentence(artist.artist_name, pctChange, confidence, saturation, emergingUntracked),
      rankScore,
    });
  }

  return results
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, opts.limit ?? DEFAULT_LIMIT)
    .map((r) => ({
      artist: r.artist,
      pctChange: r.pctChange,
      confidence: r.confidence,
      saturation: r.saturation,
      emergingUntracked: r.emergingUntracked,
      sentence: r.sentence,
    }));
}
