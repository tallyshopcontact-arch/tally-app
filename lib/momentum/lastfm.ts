// Last.fm API client — simple API-key GET, no OAuth (unlike Spotify's
// client-credentials flow). No relative imports of other lib files, so this
// loads directly under plain `node scripts/*.ts` as well as the Next.js
// bundler — see lib/momentum/spotify.ts's header for why that matters.

const API = "https://ws.audioscrobbler.com/2.0/";

export interface LastfmArtistInfo {
  listeners: number;
  playcount: number;
}

/** Returns null for an unknown/unmatched artist (Last.fm error code 6)
 * rather than throwing — that's an expected outcome for a niche or
 * newly-listed artist, not a failure the caller needs to log loudly. */
export async function getArtistInfo(name: string): Promise<LastfmArtistInfo | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) throw new Error("Missing LASTFM_API_KEY in environment variables.");

  const params = new URLSearchParams({
    method: "artist.getinfo",
    artist: name,
    api_key: apiKey,
    format: "json",
    autocorrect: "1",
  });
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Last.fm artist.getinfo failed: ${res.status}`);
  const data = (await res.json()) as {
    error?: number;
    artist?: { stats?: { listeners?: string; playcount?: string } };
  };
  if (data.error) return null;

  const stats = data.artist?.stats;
  if (!stats) return null;

  return {
    listeners: parseInt(stats.listeners ?? "0", 10),
    playcount: parseInt(stats.playcount ?? "0", 10),
  };
}
