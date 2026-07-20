// Tests the fully deterministic Lane Check title generator against real
// lanes' stored winner_videos, before any UI wiring touches it. Prints every
// pipeline stage: raw winner titles -> extracted skeletons -> final 5 titles.
// Run: node --env-file=.env.local scripts/test-title-generator.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  generateLaneTitles, scoreGeneratedTitles, extractSkeleton, deriveTopCoMention,
  deriveUsableKeywordTags, type TitleGeneratorInput,
} from "../lib/lanes/titles.ts";

function validateAggregate(titles: string[], input: TitleGeneratorInput): void {
  const topCoMention = deriveTopCoMention(input);
  if (topCoMention) {
    const count = titles.filter((t) => t.toLowerCase().includes(topCoMention.toLowerCase())).length;
    console.log(`    ${count >= 2 ? "✓" : "⚠"} ${count}/5 titles include top co-mention "${topCoMention}" (need >= 2)`);
  } else {
    console.log(`    – no co-mention data for this lane (N/A)`);
  }
  if (input.beatName) {
    const count = titles.filter((t) => t.toLowerCase().includes(input.beatName!.toLowerCase())).length;
    console.log(`    ${count >= 3 ? "✓" : "⚠"} ${count}/5 titles include beat name "${input.beatName}" (need >= 3)`);
  }
  const freeCount = titles.filter((t) => /^(?:\[free\]|\(free\))/i.test(t.trim())).length;
  console.log(`    ${freeCount === 5 ? "✓" : "⚠"} ${freeCount}/5 titles start with a FREE prefix`);
}

function validateUniqueness(scored: { title: string; explanation: string }[]): void {
  const uniqueTitles = new Set(scored.map((s) => s.title)).size;
  console.log(`    ${uniqueTitles === 5 ? "✓" : "⚠"} ${uniqueTitles}/5 titles are unique`);
  const uniqueExplanations = new Set(scored.map((s) => s.explanation)).size;
  console.log(`    ${uniqueExplanations === 5 ? "✓" : "⚠"} ${uniqueExplanations}/5 explanations are unique`);
}

async function runLane(supabase: SupabaseClient, slug: string, beatName?: string) {
  const { data: lane, error: laneErr } = await supabase.from("lanes").select("*").eq("slug", slug).single();
  if (laneErr || !lane) throw new Error(`Could not load ${slug} lane: ${laneErr?.message}`);

  const { data: analysis, error: analysisErr } = await supabase
    .from("lane_analyses")
    .select("patterns, winner_videos")
    .eq("lane_id", lane.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (analysisErr || !analysis) throw new Error(`Could not load latest analysis for ${slug}: ${analysisErr?.message}`);

  const winnerTitles: string[] = (analysis.winner_videos as { title: string }[]).map((v) => v.title);

  const derivedComention = deriveTopCoMention({
    artistName: lane.display_name,
    patterns: analysis.patterns,
    winnerTitles,
  });

  console.log(`\n${"=".repeat(70)}`);
  console.log(`LANE: ${lane.display_name}${beatName ? ` (beat name: "${beatName}")` : " (no beat name)"}`);
  console.log(`patterns.topCoMentions[0] (raw, aggregate field): ${analysis.patterns.topCoMentions[0]?.artist ?? "none"}`);
  console.log(`Derived top co-mention (from winner_videos, what's actually used): ${derivedComention ?? "none"}`);
  console.log(`Top tags: ${analysis.patterns.topTags.slice(0, 4).map((t: { tag: string }) => t.tag).join(", ") || "none"}`);
  console.log("=".repeat(70));

  console.log(`\n  Winner titles (${winnerTitles.length}):`);
  winnerTitles.forEach((t) => console.log(`    - "${t}"`));

  console.log(`\n  Extracted skeletons:`);
  const skeletonCounts = new Map<string, number>();
  for (const t of winnerTitles) {
    const sk = extractSkeleton(t, lane.display_name);
    skeletonCounts.set(sk, (skeletonCounts.get(sk) ?? 0) + 1);
  }
  const rankedSkeletons = [...skeletonCounts.entries()].sort((a, b) => b[1] - a[1]);
  rankedSkeletons.forEach(([sk, count]) => console.log(`    (${count}x) ${sk}`));

  const input: TitleGeneratorInput = {
    artistName: lane.display_name,
    beatName,
    patterns: analysis.patterns,
    winnerTitles,
  };

  console.log(`\n  Stored tags (unfiltered, from patterns.topTags):`);
  console.log(`    ${analysis.patterns.topTags.map((t: { tag: string }) => t.tag).join(", ") || "none"}`);
  console.log(`  Usable keyword tags (after stripping "type beat" + filtering to tags evidenced in real winner titles):`);
  const usableTags = deriveUsableKeywordTags(input);
  console.log(`    ${usableTags.length ? usableTags.join(", ") : "none — no stored tag's text appears in any real winner title"}`);

  const titles = generateLaneTitles(input);
  const scored = scoreGeneratedTitles(titles, input);

  console.log(`\n  5 final titles:`);
  scored.forEach((s, i) => {
    console.log(`    ${i + 1}. "${s.title}" (${s.title.length} chars) — score ${s.score}/100`);
    console.log(`       ${s.explanation}`);
  });

  console.log("\n  Validation:");
  validateAggregate(titles, input);
  validateUniqueness(scored);
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  await runLane(supabase, "alchemist", "Nightcrawler");
  await runLane(supabase, "alchemist");
  await runLane(supabase, "mf-doom", "Nightcrawler");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("[test-title-generator] failed:", err);
  process.exit(1);
});
