// Spotify Web API client — client-credentials flow (app-only auth, no user
// login/OAuth redirect needed, since we only ever read public artist stats).
// No relative imports of other lib files here (unlike lib/lanes/db.ts's own
// note on this), so this file loads cleanly both through the Next.js
// bundler (API routes) and directly via `node scripts/*.ts`
// (scripts/seed-watchlist.ts calls searchArtist to resolve seed artists).

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

// Module-memory cache — one token shared across every call in this process
// for as long as it's valid, so a snapshot run touching hundreds of artists
// authenticates once, not per request.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment variables.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);
  const data = await res.json();

  const accessToken = data.access_token as string;
  const expiresInMs = (data.expires_in as number) * 1000;
  // Refresh a minute early so a call in flight never races an expiring token.
  cachedToken = { accessToken, expiresAt: Date.now() + expiresInMs - 60_000 };
  return accessToken;
}

async function spotifyGet(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify API ${path} failed: ${res.status}`);
  return res.json();
}

export interface SpotifyArtistMatch {
  id: string;
  name: string;
  // Null, not 0 — Spotify's Feb 2026 platform changes strip these fields
  // from artist responses entirely for Development Mode apps (Extended Quota
  // Mode apps are unaffected). "Field absent" must not be conflated with
  // "value is 0": a real 0-follower artist and "we can't see this field
  // right now" need to stay distinguishable downstream (e.g.
  // lib/momentum/rising.ts's pct-change math already treats null/<=0 as "no
  // signal," which is correct for null but would be actively wrong if a
  // missing field were silently coerced to a fabricated 0).
  followers: number | null;
  popularity: number | null;
}

/** Used only at seed time (scripts/seed-watchlist.ts) — the weekly snapshot
 * run never calls search, only the batched getSeveralArtists lookup below. */
export async function searchArtist(name: string): Promise<SpotifyArtistMatch | null> {
  const params = new URLSearchParams({ q: name, type: "artist", limit: "5" });
  const data = (await spotifyGet(`/search?${params.toString()}`)) as {
    artists?: { items?: { id: string; name: string; followers?: { total?: number }; popularity?: number }[] };
  };
  const items = data.artists?.items ?? [];
  if (!items.length) return null;

  // Prefer an exact (case-insensitive) name match over Spotify's own
  // relevance ranking — a search result ranked first by popularity/plays
  // can be a cover/tribute act rather than the artist we asked for.
  const normalized = name.trim().toLowerCase();
  const best = items.find((a) => a.name.trim().toLowerCase() === normalized) ?? items[0];

  return {
    id: best.id,
    name: best.name,
    followers: best.followers?.total ?? null,
    popularity: best.popularity ?? null,
  };
}

export interface SpotifyArtistStats {
  id: string;
  followers: number | null;
  popularity: number | null;
}

export async function getArtist(id: string): Promise<SpotifyArtistStats> {
  const data = (await spotifyGet(`/artists/${id}`)) as {
    id: string;
    followers?: { total?: number };
    popularity?: number;
  };
  return { id: data.id, followers: data.followers?.total ?? null, popularity: data.popularity ?? null };
}

// Spotify removed "Get Several Artists" (GET /v1/artists?ids=...) platform-
// wide in their February 2026 API changes — confirmed live: GET /artists/{id}
// (singular) returns 200, GET /artists?ids=<single-id> 403s, so this isn't a
// per-app access-tier gap, the endpoint is just gone. getSeveralArtists keeps
// its original name/signature (snapshot.ts's caller shouldn't need to know
// or care) but is now N sequential singular calls with a small throttle
// instead of N/50 batched ones — the "500 artists = ~10 calls" design this
// was originally built to is no longer achievable through Spotify's API.
const ARTIST_CALL_DELAY_MS = 60;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** IDs Spotify can't resolve (deleted/merged artist) are silently dropped
 * from the result, same contract as the old batch endpoint had for a null
 * entry — the caller treats a missing ID the same as any other Spotify miss. */
export async function getSeveralArtists(ids: string[]): Promise<SpotifyArtistStats[]> {
  const results: SpotifyArtistStats[] = [];
  for (const id of ids) {
    try {
      results.push(await getArtist(id));
    } catch (err) {
      console.error(`[spotify] getArtist(${id}) failed, dropping from batch:`, err);
    }
    await sleep(ARTIST_CALL_DELAY_MS);
  }
  return results;
}
