// Seeds the initial lane list into `lanes`.
// Run: node --env-file=.env.local scripts/seed-lanes.ts
//   (or: npm run seed-lanes)
//
// Idempotent — safe to re-run; existing slugs are skipped, not duplicated.

import { createClient } from "@supabase/supabase-js";
import { getOrCreateLane } from "../lib/lanes/db.ts";

// Artists that appear in more than one category above (Lil Durk, Roddy Ricch)
// are seeded once, under their first-listed genre — a lane is keyed by artist
// slug, so a second genreHint would just overwrite the first, not create a
// second lane.
const SEED_LANES: { artist: string; genreHint?: string }[] = [
  // Boom Bap / Underground
  { artist: "MF DOOM", genreHint: "Boom Bap" },
  { artist: "Nas", genreHint: "Boom Bap" },
  { artist: "Griselda", genreHint: "Boom Bap" },
  { artist: "Westside Gunn", genreHint: "Boom Bap" },
  { artist: "Conway the Machine", genreHint: "Boom Bap" },
  { artist: "Benny the Butcher", genreHint: "Boom Bap" },
  { artist: "Boldy James", genreHint: "Boom Bap" },
  { artist: "Alchemist", genreHint: "Boom Bap" },
  { artist: "Madlib", genreHint: "Boom Bap" },
  { artist: "J Dilla", genreHint: "Boom Bap" },
  { artist: "Joey Bada$$", genreHint: "Boom Bap" },
  { artist: "Big L", genreHint: "Boom Bap" },
  { artist: "Wu-Tang Clan", genreHint: "Boom Bap" },
  { artist: "Roc Marciano", genreHint: "Boom Bap" },
  { artist: "Rome Streetz", genreHint: "Boom Bap" },
  { artist: "Mach-Hommy", genreHint: "Boom Bap" },

  // Trap
  { artist: "Travis Scott", genreHint: "Trap" },
  { artist: "Future", genreHint: "Trap" },
  { artist: "Young Thug", genreHint: "Trap" },
  { artist: "Gunna", genreHint: "Trap" },
  { artist: "Lil Baby", genreHint: "Trap" },
  { artist: "21 Savage", genreHint: "Trap" },
  { artist: "Playboi Carti", genreHint: "Trap" },
  { artist: "Ken Carson", genreHint: "Trap" },
  { artist: "Destroy Lonely", genreHint: "Trap" },
  { artist: "Lil Uzi Vert", genreHint: "Trap" },
  { artist: "Yeat", genreHint: "Trap" },
  { artist: "Metro Boomin", genreHint: "Trap" },
  { artist: "Southside", genreHint: "Trap" },
  { artist: "EST Gee", genreHint: "Trap" },
  { artist: "Hunxho", genreHint: "Trap" },

  // Drill (US)
  { artist: "Pop Smoke", genreHint: "Drill" },
  { artist: "Fivio Foreign", genreHint: "Drill" },
  { artist: "Lil Durk", genreHint: "Drill" },
  { artist: "King Von", genreHint: "Drill" },
  { artist: "Kay Flock", genreHint: "Drill" },
  { artist: "Sheff G", genreHint: "Drill" },
  { artist: "Sleepy Hallow", genreHint: "Drill" },
  { artist: "Dthang", genreHint: "Drill" },
  { artist: "41", genreHint: "Drill" },
  { artist: "Bloodie", genreHint: "Drill" },

  // UK Drill
  { artist: "Central Cee", genreHint: "UK Drill" },
  { artist: "Digga D", genreHint: "UK Drill" },
  { artist: "Headie One", genreHint: "UK Drill" },
  { artist: "Russ Millions", genreHint: "UK Drill" },
  { artist: "ArrDee", genreHint: "UK Drill" },
  { artist: "K-Trap", genreHint: "UK Drill" },
  { artist: "Nemzzz", genreHint: "UK Drill" },
  { artist: "Clavish", genreHint: "UK Drill" },

  // Melodic
  { artist: "Drake", genreHint: "Melodic" },
  { artist: "Juice WRLD", genreHint: "Melodic" },
  { artist: "Lil Tjay", genreHint: "Melodic" },
  { artist: "Polo G", genreHint: "Melodic" },
  { artist: "Rod Wave", genreHint: "Melodic" },
  { artist: "Roddy Ricch", genreHint: "Melodic" },
  { artist: "NBA YoungBoy", genreHint: "Melodic" },
  { artist: "Toosii", genreHint: "Melodic" },
  { artist: "Jelly Roll", genreHint: "Melodic" },

  // R&B
  { artist: "The Weeknd", genreHint: "R&B" },
  { artist: "Bryson Tiller", genreHint: "R&B" },
  { artist: "Summer Walker", genreHint: "R&B" },
  { artist: "SZA", genreHint: "R&B" },
  { artist: "Brent Faiyaz", genreHint: "R&B" },
  { artist: "PartyNextDoor", genreHint: "R&B" },
  { artist: "Giveon", genreHint: "R&B" },
  { artist: "6LACK", genreHint: "R&B" },
  { artist: "Tems", genreHint: "R&B" },
  { artist: "Chris Brown", genreHint: "R&B" },

  // West Coast
  { artist: "Kendrick Lamar", genreHint: "West Coast" },
  { artist: "YG", genreHint: "West Coast" },
  { artist: "Nipsey Hussle", genreHint: "West Coast" },
  { artist: "Blxst", genreHint: "West Coast" },
  { artist: "Dom Kennedy", genreHint: "West Coast" },
  { artist: "Mozzy", genreHint: "West Coast" },
  { artist: "Larry June", genreHint: "West Coast" },
  { artist: "Kalan.FrFr", genreHint: "West Coast" },

  // Afrobeats
  { artist: "Burna Boy", genreHint: "Afrobeats" },
  { artist: "Wizkid", genreHint: "Afrobeats" },
  { artist: "Davido", genreHint: "Afrobeats" },
  { artist: "Rema", genreHint: "Afrobeats" },
  { artist: "Asake", genreHint: "Afrobeats" },
  { artist: "Ayra Starr", genreHint: "Afrobeats" },
  { artist: "Omah Lay", genreHint: "Afrobeats" },
  { artist: "Tyla", genreHint: "Afrobeats" },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local.");
  }
  const supabase = createClient(url, key);

  let created = 0;
  let existing = 0;

  for (const { artist, genreHint } of SEED_LANES) {
    const { lane, created: wasCreated } = await getOrCreateLane(supabase, artist, genreHint ?? null);
    if (wasCreated) created++; else existing++;
    console.log(`  ${wasCreated ? "created" : "exists "} — ${lane.slug} (${lane.id})`);
  }

  console.log(`\nDone. ${created} created, ${existing} already existed. Total seeded: ${SEED_LANES.length}.`);
}

main().catch((err) => {
  console.error("[seed-lanes] failed:", err);
  process.exit(1);
});
