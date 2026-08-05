// Seeds the streaming momentum watchlist (public.watchlist_artists) from
// three sources, deduped via cleanArtistName (the same lanes-table matching
// primitive channelAnalyzer.ts/channelTracking.ts use, so "J. Cole" and
// "J COLE" collapse to one candidate here too):
//   (a) every artist currently in `lanes`
//   (b) co-mention artists lib/lanes/trending.ts surfaces across each genre
//       represented in `lanes`
//   (c) a hardcoded supplementary list of currently-relevant hip-hop/rap/R&B
//       artists, to bring the total into the brief's 300-500 target range
//
// Each artist is resolved to a Spotify artist ID at seed time (searchArtist)
// so the weekly snapshot cron (lib/momentum/snapshot.ts) never calls
// Spotify's search endpoint — only the batched getSeveralArtists lookup.
// An artist that fails Spotify resolution is still seeded with a null
// spotify_artist_id; Last.fm may still cover it.
//
// Idempotent — safe to re-run; existing artist_name_normalized rows are
// skipped, not duplicated or re-resolved.
//
// Run: node --env-file=.env.local scripts/seed-watchlist.ts
//   (or: npm run seed-watchlist)

import { createClient } from "@supabase/supabase-js";
import { cleanArtistName } from "../lib/lanes/patterns.ts";
import { getTrendingCoMentionedArtists } from "../lib/lanes/trending.ts";
import { searchArtist } from "../lib/momentum/spotify.ts";

// Keeps a ~300-500 artist sequential Spotify-search run well under rate
// limits (client-credentials search is generously limited, but there's no
// reason to hammer it when this only runs once per new artist).
const SPOTIFY_CALL_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── (c) Hardcoded supplementary list ────────────────────────────────────
// Currently-relevant hip-hop/rap/R&B artists not guaranteed to already be a
// lane or a co-mention hit — brings the watchlist into the brief's 300-500
// target range alongside sources (a) and (b). genre is a rough bucket for
// the rising-window genre filter, not an authoritative classification —
// artists that already exist as a lane (source a) keep that lane's
// genre_hint instead (see upsertCandidate below).
const SUPPLEMENTARY_ARTISTS: { artist: string; genre: string }[] = [
  // Mainstream / Trap
  { artist: "Cardi B", genre: "Trap" },
  { artist: "Nicki Minaj", genre: "Trap" },
  { artist: "Megan Thee Stallion", genre: "Trap" },
  { artist: "Lil Wayne", genre: "Trap" },
  { artist: "Rick Ross", genre: "Trap" },
  { artist: "2 Chainz", genre: "Trap" },
  { artist: "Gucci Mane", genre: "Trap" },
  { artist: "Quavo", genre: "Trap" },
  { artist: "Offset", genre: "Trap" },
  { artist: "Takeoff", genre: "Trap" },
  { artist: "Migos", genre: "Trap" },
  { artist: "Lil Yachty", genre: "Trap" },
  { artist: "Trippie Redd", genre: "Trap" },
  { artist: "Rae Sremmurd", genre: "Trap" },
  { artist: "Swae Lee", genre: "Trap" },
  { artist: "Jeezy", genre: "Trap" },
  { artist: "T.I.", genre: "Trap" },
  { artist: "DaBaby", genre: "Trap" },
  { artist: "Moneybagg Yo", genre: "Trap" },
  { artist: "GloRilla", genre: "Trap" },
  { artist: "Sexyy Red", genre: "Trap" },
  { artist: "Ice Spice", genre: "Trap" },
  { artist: "Latto", genre: "Trap" },
  { artist: "BossMan Dlow", genre: "Trap" },
  { artist: "Veeze", genre: "Trap" },
  { artist: "BabyTron", genre: "Trap" },
  { artist: "Rob49", genre: "Trap" },
  { artist: "NLE Choppa", genre: "Trap" },
  { artist: "Lil Baby", genre: "Trap" },
  { artist: "42 Dugg", genre: "Trap" },
  { artist: "Big Sean", genre: "Trap" },
  { artist: "French Montana", genre: "Trap" },
  { artist: "Tyga", genre: "Trap" },
  { artist: "Fivio Foreign", genre: "Trap" },
  { artist: "Coi Leray", genre: "Trap" },
  { artist: "Flo Milli", genre: "Trap" },
  { artist: "Saweetie", genre: "Trap" },

  // Drill (US, expanding beyond original seed lanes)
  { artist: "Fredo Bang", genre: "Drill" },
  { artist: "OMB Peezy", genre: "Drill" },
  { artist: "Rylo Rodriguez", genre: "Drill" },
  { artist: "Est Gee", genre: "Drill" },
  { artist: "Rob49", genre: "Drill" },
  { artist: "Cash Cobain", genre: "Drill" },
  { artist: "Bandmanrill", genre: "Drill" },
  { artist: "Ice Spice", genre: "Drill" },
  { artist: "Cardo", genre: "Drill" },
  { artist: "Dougie B", genre: "Drill" },

  // UK Drill / UK Rap (expanding beyond original seed lanes)
  { artist: "Stormzy", genre: "UK Drill" },
  { artist: "Dave", genre: "UK Drill" },
  { artist: "AJ Tracey", genre: "UK Drill" },
  { artist: "Aitch", genre: "UK Drill" },
  { artist: "Meekz", genre: "UK Drill" },
  { artist: "Fredo", genre: "UK Drill" },
  { artist: "Skepta", genre: "UK Drill" },
  { artist: "Ghetts", genre: "UK Drill" },
  { artist: "Unknown T", genre: "UK Drill" },
  { artist: "Backroad Gee", genre: "UK Drill" },
  { artist: "M24", genre: "UK Drill" },
  { artist: "Central Cee", genre: "UK Drill" },

  // Melodic / Emo rap / Alt
  { artist: "Lil Peep", genre: "Melodic" },
  { artist: "XXXTentacion", genre: "Melodic" },
  { artist: "Lil Skies", genre: "Melodic" },
  { artist: "iann dior", genre: "Melodic" },
  { artist: "Trippie Redd", genre: "Melodic" },
  { artist: "Lil Tecca", genre: "Melodic" },
  { artist: "Central Cee", genre: "Melodic" },
  { artist: "Don Toliver", genre: "Melodic" },
  { artist: "Baby Keem", genre: "Melodic" },
  { artist: "Ken Carson", genre: "Melodic" },
  { artist: "Yeat", genre: "Melodic" },
  { artist: "Lucki", genre: "Melodic" },
  { artist: "Cochise", genre: "Melodic" },
  { artist: "Autumn!", genre: "Melodic" },
  { artist: "Summrs", genre: "Melodic" },
  { artist: "Lil Gnar", genre: "Melodic" },
  { artist: "Nettspend", genre: "Melodic" },
  { artist: "Cochise", genre: "Melodic" },

  // R&B / Neo-soul
  { artist: "Frank Ocean", genre: "R&B" },
  { artist: "H.E.R.", genre: "R&B" },
  { artist: "Kehlani", genre: "R&B" },
  { artist: "Jhene Aiko", genre: "R&B" },
  { artist: "Daniel Caesar", genre: "R&B" },
  { artist: "Snoh Aalegra", genre: "R&B" },
  { artist: "Ari Lennox", genre: "R&B" },
  { artist: "Kali Uchis", genre: "R&B" },
  { artist: "Lucky Daye", genre: "R&B" },
  { artist: "Ella Mai", genre: "R&B" },
  { artist: "Muni Long", genre: "R&B" },
  { artist: "Coco Jones", genre: "R&B" },
  { artist: "Victoria Monet", genre: "R&B" },
  { artist: "Summer Walker", genre: "R&B" },
  { artist: "Jorja Smith", genre: "R&B" },
  { artist: "Sabrina Claudio", genre: "R&B" },
  { artist: "UMI", genre: "R&B" },
  { artist: "Ravyn Lenae", genre: "R&B" },
  { artist: "Xavier Omar", genre: "R&B" },
  { artist: "Queen Naija", genre: "R&B" },
  { artist: "Jacquees", genre: "R&B" },
  { artist: "Tank", genre: "R&B" },
  { artist: "Trey Songz", genre: "R&B" },
  { artist: "Usher", genre: "R&B" },
  { artist: "Ne-Yo", genre: "R&B" },

  // West Coast (expanding beyond original seed lanes)
  { artist: "Vince Staples", genre: "West Coast" },
  { artist: "Schoolboy Q", genre: "West Coast" },
  { artist: "Ab-Soul", genre: "West Coast" },
  { artist: "Jay Rock", genre: "West Coast" },
  { artist: "Problem", genre: "West Coast" },
  { artist: "Buddy", genre: "West Coast" },
  { artist: "AzChike", genre: "West Coast" },
  { artist: "1TakeJay", genre: "West Coast" },
  { artist: "RJmrLA", genre: "West Coast" },
  { artist: "BlueBucksClan", genre: "West Coast" },
  { artist: "OhGeesy", genre: "West Coast" },
  { artist: "Roddy Ricch", genre: "West Coast" },
  { artist: "Tyler the Creator", genre: "West Coast" },
  { artist: "Earl Sweatshirt", genre: "West Coast" },
  { artist: "Domo Genesis", genre: "West Coast" },
  { artist: "Boogie", genre: "West Coast" },

  // Southern / Atlanta / Memphis / Houston
  { artist: "21 Savage", genre: "Southern" },
  { artist: "Young Nudy", genre: "Southern" },
  { artist: "Zaytoven", genre: "Southern" },
  { artist: "Key Glock", genre: "Southern" },
  { artist: "Duke Deuce", genre: "Southern" },
  { artist: "GloRilla", genre: "Southern" },
  { artist: "Big Boogie", genre: "Southern" },
  { artist: "Pooh Shiesty", genre: "Southern" },
  { artist: "BlocBoy JB", genre: "Southern" },
  { artist: "Sauce Walka", genre: "Southern" },
  { artist: "Maxo Kream", genre: "Southern" },
  { artist: "Don Toliver", genre: "Southern" },
  { artist: "Sheck Wes", genre: "Southern" },
  { artist: "Erica Banks", genre: "Southern" },
  { artist: "Slim Thug", genre: "Southern" },
  { artist: "Paul Wall", genre: "Southern" },
  { artist: "Big Krit", genre: "Southern" },

  // East Coast (veterans + rising, beyond original boom bap seed lanes)
  { artist: "A$AP Rocky", genre: "East Coast" },
  { artist: "A$AP Ferg", genre: "East Coast" },
  { artist: "Dave East", genre: "East Coast" },
  { artist: "French Montana", genre: "East Coast" },
  { artist: "Fabolous", genre: "East Coast" },
  { artist: "Jadakiss", genre: "East Coast" },
  { artist: "Styles P", genre: "East Coast" },
  { artist: "Cam'ron", genre: "East Coast" },
  { artist: "Jim Jones", genre: "East Coast" },
  { artist: "Dyce Payso", genre: "East Coast" },
  { artist: "Ice Spice", genre: "East Coast" },
  { artist: "Rah Swish", genre: "East Coast" },
  { artist: "Che Noir", genre: "East Coast" },
  { artist: "Skyzoo", genre: "East Coast" },
  { artist: "Elzhi", genre: "East Coast" },
  { artist: "Your Old Droog", genre: "East Coast" },
  { artist: "Ka", genre: "East Coast" },

  // Afrobeats / Amapiano-adjacent (expanding beyond original seed lanes)
  { artist: "Fireboy DML", genre: "Afrobeats" },
  { artist: "Joeboy", genre: "Afrobeats" },
  { artist: "CKay", genre: "Afrobeats" },
  { artist: "Ruger", genre: "Afrobeats" },
  { artist: "Adekunle Gold", genre: "Afrobeats" },
  { artist: "Kizz Daniel", genre: "Afrobeats" },
  { artist: "Black Sherif", genre: "Afrobeats" },
  { artist: "Shatta Wale", genre: "Afrobeats" },
  { artist: "Focalistic", genre: "Afrobeats" },
  { artist: "Uncle Waffles", genre: "Afrobeats" },
  { artist: "Kabza De Small", genre: "Afrobeats" },
  { artist: "DJ Maphorisa", genre: "Afrobeats" },

  // Legacy / Veteran (still culturally relevant, still uploaded-over often)
  { artist: "Jay-Z", genre: "Legacy" },
  { artist: "Eminem", genre: "Legacy" },
  { artist: "Snoop Dogg", genre: "Legacy" },
  { artist: "Dr. Dre", genre: "Legacy" },
  { artist: "50 Cent", genre: "Legacy" },
  { artist: "Ludacris", genre: "Legacy" },
  { artist: "Common", genre: "Legacy" },
  { artist: "Talib Kweli", genre: "Legacy" },
  { artist: "Mos Def", genre: "Legacy" },
  { artist: "Big Sean", genre: "Legacy" },
  { artist: "Pusha T", genre: "Legacy" },
  { artist: "Freddie Gibbs", genre: "Legacy" },
  { artist: "Curren$y", genre: "Legacy" },
  { artist: "Wiz Khalifa", genre: "Legacy" },
  { artist: "ScHoolboy Q", genre: "Legacy" },
  { artist: "Logic", genre: "Legacy" },
  { artist: "J. Cole", genre: "Legacy" },
  { artist: "Kendrick Lamar", genre: "Legacy" },
  { artist: "Rapsody", genre: "Legacy" },
  { artist: "Little Brother", genre: "Legacy" },
  { artist: "9th Wonder", genre: "Legacy" },

  // Underground / Alternative
  { artist: "Denzel Curry", genre: "Underground" },
  { artist: "JPEGMafia", genre: "Underground" },
  { artist: "Danny Brown", genre: "Underground" },
  { artist: "Injury Reserve", genre: "Underground" },
  { artist: "Death Grips", genre: "Underground" },
  { artist: "Armand Hammer", genre: "Underground" },
  { artist: "Billy Woods", genre: "Underground" },
  { artist: "Navy Blue", genre: "Underground" },
  { artist: "MIKE", genre: "Underground" },
  { artist: "Redveil", genre: "Underground" },
  { artist: "Wiki", genre: "Underground" },
  { artist: "Maxo", genre: "Underground" },
  { artist: "Pink Siifu", genre: "Underground" },
  { artist: "Mavi", genre: "Underground" },
  { artist: "Ovrkast.", genre: "Underground" },

  // Producers-turned-featured-artists (frequently co-mentioned in beat titles)
  { artist: "Metro Boomin", genre: "Trap" },
  { artist: "Southside", genre: "Trap" },
  { artist: "Wheezy", genre: "Trap" },
  { artist: "TM88", genre: "Trap" },
  { artist: "Turbo", genre: "Trap" },
  { artist: "DY Krazy", genre: "Trap" },
  { artist: "OZ", genre: "Trap" },
  { artist: "Pierre Bourne", genre: "Trap" },
  { artist: "Cardo", genre: "Trap" },
  { artist: "Murda Beatz", genre: "Trap" },
  { artist: "Tay Keith", genre: "Drill" },
  { artist: "Zaytoven", genre: "Trap" },
  { artist: "808 Mafia", genre: "Trap" },

  // Rising / breakout (2024-2025 era)
  { artist: "Doechii", genre: "Trap" },
  { artist: "Skilla Baby", genre: "Trap" },
  { artist: "Hunxho", genre: "Trap" },
  { artist: "OsamaSon", genre: "Melodic" },
  { artist: "Xaviersobased", genre: "Melodic" },
  { artist: "Sha Ek", genre: "Drill" },
  { artist: "SleazyWorld Go", genre: "Drill" },
  { artist: "DDG", genre: "Trap" },
  { artist: "NLE Choppa", genre: "Drill" },
  { artist: "Lakeyah", genre: "Trap" },
  { artist: "BIA", genre: "Trap" },
  { artist: "Rob49", genre: "Southern" },
  { artist: "Foolio", genre: "Southern" },
  { artist: "Real Boston Richey", genre: "Southern" },
  { artist: "Loe Shimmy", genre: "Southern" },
  { artist: "Teejayx6", genre: "Trap" },
];

interface Candidate {
  artistName: string;
  genre: string | null;
  laneId: string | null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local.");
  }
  const supabase = createClient(url, key);

  // Keyed by cleanArtistName's normalized form so all three sources dedupe
  // against each other and against themselves.
  const candidates = new Map<string, Candidate>();

  const upsertCandidate = (rawName: string, genre: string | null, laneId: string | null) => {
    const normalized = cleanArtistName(rawName);
    if (!normalized) return;
    const existing = candidates.get(normalized);
    if (existing) {
      // A lane_id from source (a) is more authoritative than a genre-only
      // hit from (b)/(c) — let it win if this candidate didn't have one yet.
      if (laneId && !existing.laneId) {
        existing.laneId = laneId;
        existing.genre = genre ?? existing.genre;
      }
      return;
    }
    candidates.set(normalized, { artistName: titleCase(normalized), genre, laneId });
  };

  // (a) every artist in lanes
  const { data: lanes, error: lanesErr } = await supabase.from("lanes").select("id, display_name, genre_hint");
  if (lanesErr) throw new Error(`Failed to list lanes: ${lanesErr.message}`);
  const laneRows = (lanes ?? []) as { id: string; display_name: string; genre_hint: string | null }[];
  for (const lane of laneRows) upsertCandidate(lane.display_name, lane.genre_hint, lane.id);
  console.log(`(a) lanes: ${laneRows.length} artists`);

  // (b) co-mention artists across every genre represented in lanes
  const genres = [...new Set(laneRows.map((l) => l.genre_hint).filter((g): g is string => !!g))];
  let coMentionCount = 0;
  for (const genre of genres) {
    const trending = await getTrendingCoMentionedArtists(supabase, genre);
    for (const t of trending) {
      upsertCandidate(t.artist, genre, null);
      coMentionCount++;
    }
  }
  console.log(`(b) trending co-mentions across ${genres.length} genre(s): ${coMentionCount} candidate(s)`);

  // (c) hardcoded supplementary list
  for (const { artist, genre } of SUPPLEMENTARY_ARTISTS) upsertCandidate(artist, genre, null);
  console.log(`(c) supplementary list: ${SUPPLEMENTARY_ARTISTS.length} candidate(s)`);

  console.log(`\nTotal deduped candidates: ${candidates.size}\n`);

  let created = 0;
  let existing = 0;
  let resolved = 0;
  let unresolved = 0;

  for (const [normalized, candidate] of candidates) {
    const { data: existingRow, error: findErr } = await supabase
      .from("watchlist_artists")
      .select("id")
      .eq("artist_name_normalized", normalized)
      .maybeSingle();
    if (findErr) {
      console.error(`  lookup failed for "${candidate.artistName}":`, findErr.message);
      continue;
    }
    if (existingRow) {
      existing++;
      continue;
    }

    let spotifyId: string | null = null;
    try {
      const match = await searchArtist(candidate.artistName);
      spotifyId = match?.id ?? null;
    } catch (err) {
      console.error(`  Spotify lookup failed for "${candidate.artistName}":`, err instanceof Error ? err.message : err);
    }
    await sleep(SPOTIFY_CALL_DELAY_MS);
    if (spotifyId) resolved++;
    else unresolved++;

    const { error: insertErr } = await supabase.from("watchlist_artists").insert({
      artist_name: candidate.artistName,
      artist_name_normalized: normalized,
      spotify_artist_id: spotifyId,
      lastfm_name: candidate.artistName,
      genre: candidate.genre,
      lane_id: candidate.laneId,
    });
    if (insertErr) {
      console.error(`  insert failed for "${candidate.artistName}":`, insertErr.message);
      continue;
    }
    created++;
    console.log(`  seeded — ${candidate.artistName}${spotifyId ? "" : " (no Spotify match)"}`);
  }

  console.log(
    `\nDone. ${created} created (${resolved} resolved to a Spotify ID, ${unresolved} not), ${existing} already existed.`
  );
  console.log(`Total watchlist size: ${created + existing}.`);
}

main().catch((err) => {
  console.error("[seed-watchlist] failed:", err);
  process.exit(1);
});
