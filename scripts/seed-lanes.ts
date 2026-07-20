// Seeds the initial lane list into `lanes`.
// Run: node --env-file=.env.local scripts/seed-lanes.ts
//   (or: npm run seed-lanes)
//
// Idempotent — safe to re-run; existing slugs are skipped, not duplicated.

import { createClient } from "@supabase/supabase-js";
import { getOrCreateLane } from "../lib/lanes/db.ts";

// OWNER: replace with your curated 80–100 artist list before running
const SEED_LANES: { artist: string; genreHint?: string }[] = [
  { artist: "MF DOOM" },
  { artist: "Griselda" },
  { artist: "Mach-Hommy" },
  { artist: "Roc Marciano" },
  { artist: "Ka" },
  { artist: "Earl Sweatshirt" },
  { artist: "Freddie Gibbs" },
  { artist: "Alchemist" },
  { artist: "J Dilla" },
  { artist: "Westside Gunn" },
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
