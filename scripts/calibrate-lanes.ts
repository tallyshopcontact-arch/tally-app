// Runs the full lane analysis pipeline against named calibration lanes and
// prints every sub-score + raw metric behind it, so the placeholder constants
// in lib/lanes/scoring.ts (SCORE_CALIBRATION) can be tuned before any UI or
// API routes are built.
//
// Run: node --env-file=.env.local scripts/calibrate-lanes.ts
//   (or: npm run calibrate-lanes)
//
// Each run performs real YouTube API calls (~204 quota units/lane) and inserts
// a real lane_analyses row (never overwritten — see lib/lanes/pipeline.ts).

import { createClient } from "@supabase/supabase-js";
import { getOrCreateLane } from "../lib/lanes/db.ts";
import { analyzeLane } from "../lib/lanes/pipeline.ts";
import { SCORE_CALIBRATION } from "../lib/lanes/scoring.ts";

const CALIBRATION_LANES: { artist: string; genreHint?: string }[] = [
  { artist: "MF DOOM", genreHint: "boom bap" },
  { artist: "Drake" },
  { artist: "Alchemist", genreHint: "boom bap" },
];

function rule(char = "-", n = 74): string {
  return char.repeat(n);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local.");
  }
  const supabase = createClient(url, key);

  for (const { artist, genreHint } of CALIBRATION_LANES) {
    console.log("\n" + rule("="));
    console.log(`LANE: ${artist}${genreHint ? ` (genre hint: ${genreHint})` : ""}`);
    console.log(rule("="));

    const { lane } = await getOrCreateLane(supabase, artist, genreHint ?? null);
    const result = await analyzeLane(supabase, lane);

    console.log(`Query used: "${result.query}"`);
    console.log(rule());
    console.log("SCORES");
    console.log(
      `  Demand:       ${result.demand.score.toFixed(1)} / 100   ` +
      `(median ${result.demand.medianViewsPerDay} views/day across top ${result.demand.sampleSize} performers)`
    );
    console.log(
      `  Saturation:   ${result.saturation.score.toFixed(1)} / 100   ` +
      `(~${result.saturation.uploadsLast30d.toLocaleString()} total matches in last 30 days, ` +
      `via pageInfo.totalResults — YouTube's estimate, not exact)`
    );
    console.log(
      `  Winnability:  ${result.winnability.score.toFixed(1)} / 100   ` +
      `(${result.winnability.smallChannelCount}/${result.winnability.sampleSize} top performers from channels < ${SCORE_CALIBRATION.smallChannelSubThreshold.toLocaleString()} subs)`
    );
    console.log(
      `  Momentum:     ${result.momentum === null ? "new lane — no trend yet" : (result.momentum >= 0 ? "+" : "") + result.momentum}`
    );
    console.log(`  Opportunity:  ${result.opportunity.toFixed(1)} / 100   [${result.status.toUpperCase()}]`);

    console.log(rule());
    console.log("PATTERNS (small-channel winners only)");
    if (result.patterns.empty) {
      console.log(`  No small channels cracked this lane in the last 60 days.`);
    } else {
      console.log(`  Winner videos found:      ${result.patterns.winnerCount}`);
      console.log(`  [FREE]-prefixed titles:   ${result.patterns.freePrefixPct}%`);
      console.log(`  Quoted beat name:         ${result.patterns.quotedNamePct}%`);
      console.log(`  Co-mentions a 2nd artist: ${result.patterns.coMentionPct}%`);
      if (result.patterns.topCoMentions.length) {
        console.log(`  Top co-mentioned artists:`);
        for (const c of result.patterns.topCoMentions.slice(0, 8)) {
          console.log(`    - ${c.artist}: ${c.pct}% (${c.count})`);
        }
      }
      console.log(`  Median title length:      ${result.patterns.medianTitleLength} chars`);
      console.log(`  Median duration:          ${formatDuration(result.patterns.medianDurationSeconds)}`);
      console.log(`  Median tag count:         ${result.patterns.medianTagCount}`);
      if (result.patterns.topTags.length) {
        console.log(`  Top tags: ${result.patterns.topTags.map((t) => `${t.tag} (${t.count})`).join(", ")}`);
      }
    }

    console.log(rule());
    console.log(`Top performer videos found:        ${result.topVideos.length}`);
    console.log(`Small-channel winner videos found:  ${result.winnerVideos.length} (after max ${result.winnerVideos.length ? "2" : "-"}/channel cap)`);
    if (result.winnerVideos.length) {
      console.log(`Winner video list (title — channel — subs — views):`);
      for (const v of result.winnerVideos) {
        console.log(`    - "${v.title}" — ${v.channelTitle} (${v.subscriberCount.toLocaleString()} subs, ${v.viewCount.toLocaleString()} views)`);
      }
    }
    console.log(`Analysis row inserted: ${result.analysisRow.id}`);
  }

  console.log("\n" + rule("="));
  console.log("Calibration run complete.");
}

main().catch((err) => {
  console.error("[calibrate-lanes] failed:", err);
  process.exit(1);
});
