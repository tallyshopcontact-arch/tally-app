// Queues lane_jobs for every lane that isn't already fresh or pending, capped
// per run to spread pre-warming across ~2 days (see MAX_LANES_PER_RUN below).
// Run: node --env-file=.env.local scripts/prewarm-lanes.ts
//   (or: npm run prewarm-lanes)
//
// This script only ENQUEUES jobs — it does not call the YouTube API itself.
// The job processor (Vercel cron, build-order step 3) drains the queue.

import { createClient } from "@supabase/supabase-js";
import { enqueueLaneJob, hasPendingJob, isLaneFresh } from "../lib/lanes/db.ts";
import type { Lane } from "../lib/lanes/types.ts";

// Fresh analysis is ~205 quota units/lane; daily free quota is 10K. This cap
// leaves headroom for live diagnostic/lane-check traffic on the same key.
const MAX_LANES_PER_RUN = 40;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local.");
  }
  const supabase = createClient(url, key);

  const { data: lanes, error } = await supabase
    .from("lanes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list lanes: ${error.message}`);

  let queued = 0;
  let skippedFresh = 0;
  let skippedPending = 0;

  for (const lane of (lanes ?? []) as Lane[]) {
    if (queued >= MAX_LANES_PER_RUN) break;
    if (isLaneFresh(lane.last_analyzed_at)) { skippedFresh++; continue; }
    if (await hasPendingJob(supabase, lane.id)) { skippedPending++; continue; }

    await enqueueLaneJob(supabase, lane.id, { priority: 0 });
    queued++;
    console.log(`  queued — ${lane.slug}`);
  }

  const total = lanes?.length ?? 0;
  const remaining = total - queued - skippedFresh - skippedPending;
  console.log(`\nDone. Queued ${queued} job(s). Skipped ${skippedFresh} fresh, ${skippedPending} already pending.`);
  if (remaining > 0) {
    console.log(`${remaining} lane(s) left uncapped — run again to continue pre-warming (cap: ${MAX_LANES_PER_RUN}/run).`);
  }
}

main().catch((err) => {
  console.error("[prewarm-lanes] failed:", err);
  process.exit(1);
});
