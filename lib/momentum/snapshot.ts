// Weekly momentum snapshot — writes one artist_momentum_snapshots row per
// active watchlist_artists row (see supabase/phase1-collectors-migration.sql).
// Spotify is batched via getSeveralArtists (up to 50 IDs/call, so 500
// artists is ~10 calls, not 500); Last.fm has no batch endpoint so it's
// looked up per artist. Per-artist failure isolation: an artist failing on
// one source still writes a row with the other source's fields populated —
// partial data beats no data.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeveralArtists } from "./spotify";
import { getArtistInfo } from "./lastfm";

interface WatchlistRow {
  id: string;
  artist_name: string;
  spotify_artist_id: string | null;
  lastfm_name: string | null;
}

export interface SnapshotAllArtistsResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export async function snapshotAllArtists(supabase: SupabaseClient): Promise<SnapshotAllArtistsResult> {
  const { data: artists, error } = await supabase
    .from("watchlist_artists")
    .select("id, artist_name, spotify_artist_id, lastfm_name")
    .eq("active", true);
  if (error) throw new Error(`snapshotAllArtists query failed: ${error.message}`);

  const rows = (artists ?? []) as WatchlistRow[];

  // One batched Spotify pass up front — a single artist's Spotify failure
  // must not be able to take the whole batch down, so a batch-level error is
  // caught here and every artist just falls back to Last.fm-only for this run.
  const spotifyIds = rows.map((r) => r.spotify_artist_id).filter((id): id is string => !!id);
  const spotifyStats = new Map<string, { followers: number | null; popularity: number | null }>();
  if (spotifyIds.length) {
    try {
      for (const s of await getSeveralArtists(spotifyIds)) {
        spotifyStats.set(s.id, { followers: s.followers, popularity: s.popularity });
      }
    } catch (err) {
      console.error("[momentum/snapshot] Spotify batch fetch failed, continuing Last.fm-only:", err);
    }
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  let succeeded = 0;
  let failed = 0;

  for (const artist of rows) {
    const spotify = artist.spotify_artist_id ? spotifyStats.get(artist.spotify_artist_id) ?? null : null;

    let lastfm: { listeners: number; playcount: number } | null = null;
    try {
      lastfm = await getArtistInfo(artist.lastfm_name ?? artist.artist_name);
    } catch (err) {
      console.error(`[momentum/snapshot] Last.fm lookup failed for "${artist.artist_name}":`, err);
    }

    // Field-level, not just object-level — a Spotify Development Mode app
    // gets back an artist object with followers/popularity both stripped
    // (see lib/momentum/spotify.ts), which must count as "no signal" here
    // too, not as success just because the fetch didn't throw. Writing an
    // all-null row would be worse than not writing one: it's indistinguishable
    // from a real snapshot in the table but carries no data.
    const hasSpotifySignal = spotify !== null && (spotify.followers !== null || spotify.popularity !== null);
    if (!hasSpotifySignal && !lastfm) {
      // Neither source had anything to report for this artist this run.
      // Not counted as a hard failure (it may just be a niche/new artist
      // with no Last.fm page yet, or Spotify access not yet extended), but
      // also not a success.
      failed++;
      continue;
    }

    const { error: insertErr } = await supabase.from("artist_momentum_snapshots").upsert(
      {
        watchlist_artist_id: artist.id,
        spotify_followers: spotify?.followers ?? null,
        spotify_popularity: spotify?.popularity ?? null,
        lastfm_listeners: lastfm?.listeners ?? null,
        lastfm_playcount: lastfm?.playcount ?? null,
        snapshot_date: snapshotDate,
      },
      { onConflict: "watchlist_artist_id,snapshot_date" }
    );
    if (insertErr) {
      console.error(`[momentum/snapshot] insert failed for "${artist.artist_name}":`, insertErr.message);
      failed++;
      continue;
    }
    succeeded++;
  }

  return { processed: rows.length, succeeded, failed };
}
