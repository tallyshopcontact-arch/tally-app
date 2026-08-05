// One-off cleanup: re-runs the co-mention hard-reject filter (see
// lib/lanes/patterns.ts's cleanCoMention/recomputeCoMentions) over every
// existing lane_analyses row's already-stored winner_videos data, in place.
// No new YouTube calls — this only reparses titles the pipeline already
// fetched and stored. Retroactively kills dirty co-mentions ("West Coast
// 20%", "Kendrick Lamar Sample 20%") in already-warmed lanes without
// spending quota.
//
// Run: node --env-file=.env.local scripts/reclean-lanes.ts
//   (or: npm run reclean-lanes)
//
// Idempotent — safe to re-run; a row whose recomputed topCoMentions already
// matches what's stored is left untouched (no-op write avoided, not just a
// no-op update).

import { createClient } from "@supabase/supabase-js";
import { recomputeCoMentions } from "../lib/lanes/patterns.ts";

interface LaneRow {
  id: string;
  display_name: string;
}

interface LaneAnalysisRow {
  id: string;
  lane_id: string;
  patterns: Record<string, unknown> | null;
  winner_videos: unknown[] | null;
}

interface CoMentionEntry {
  artist: string;
  count: number;
  pct: number;
}

// Order-independent (both list order and per-object key order) — a
// recompute that lands on the exact same {artist, count, pct} entries,
// just serialized with keys in a different order, is not a real change and
// shouldn't count as one.
function coMentionsEqual(a: unknown, b: unknown): boolean {
  const canon = (list: unknown) =>
    ((list ?? []) as CoMentionEntry[])
      .map((e) => `${e.artist}|${e.count}|${e.pct}`)
      .sort()
      .join(",");
  return canon(a) === canon(b);
}

const PAGE_SIZE = 500;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local.");
  }
  const supabase = createClient(url, key);

  const { data: lanes, error: lanesErr } = await supabase.from("lanes").select("id, display_name");
  if (lanesErr) throw new Error(`Failed to list lanes: ${lanesErr.message}`);
  const displayNameByLaneId = new Map(((lanes ?? []) as LaneRow[]).map((l) => [l.id, l.display_name]));
  console.log(`Loaded ${displayNameByLaneId.size} lanes.\n`);

  let offset = 0;
  let processed = 0;
  let changed = 0;
  let skippedNoLane = 0;
  let skippedNoWinners = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("lane_analyses")
      .select("id, lane_id, patterns, winner_videos")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to page lane_analyses at offset ${offset}: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows as LaneAnalysisRow[]) {
      processed++;
      const laneDisplayName = displayNameByLaneId.get(row.lane_id);
      if (!laneDisplayName) {
        skippedNoLane++;
        continue;
      }

      const winnerTitles = ((row.winner_videos ?? []) as { title?: string }[])
        .map((v) => v.title)
        .filter((t): t is string => typeof t === "string");
      if (!winnerTitles.length) {
        skippedNoWinners++;
        continue;
      }

      const { topCoMentions, coMentionPct } = recomputeCoMentions(winnerTitles, laneDisplayName);
      const existingTopCoMentions = (row.patterns as { topCoMentions?: unknown } | null)?.topCoMentions ?? [];

      if (coMentionsEqual(existingTopCoMentions, topCoMentions)) continue; // already clean

      const newPatterns = { ...(row.patterns ?? {}), topCoMentions, coMentionPct };
      const { error: updateErr } = await supabase
        .from("lane_analyses")
        .update({ patterns: newPatterns })
        .eq("id", row.id);
      if (updateErr) {
        console.error(`  update failed for lane_analyses ${row.id} (${laneDisplayName}): ${updateErr.message}`);
        continue;
      }
      changed++;
      console.log(`  cleaned — ${laneDisplayName} (${row.id})`);
      console.log(`    before: ${JSON.stringify(existingTopCoMentions)}`);
      console.log(`    after:  ${JSON.stringify(topCoMentions)}`);
    }

    offset += PAGE_SIZE;
  }

  console.log(
    `\nDone. Processed ${processed} lane_analyses rows — ${changed} changed, ${skippedNoLane} skipped (no matching lane), ${skippedNoWinners} skipped (no winner titles stored).`
  );
}

main().catch((err) => {
  console.error("[reclean-lanes] failed:", err);
  process.exit(1);
});
