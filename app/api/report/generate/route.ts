import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { getTopNicheVideos } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";
import {
  generateChannelSummary,
  generateBenchmarkInsights,
  generateTrendingBreakdowns,
  generateRisingArtists,
  generateWhatToAvoid,
  generateActionPlan,
  generateUploadKit,
  generateTALLYScore,
} from "@/lib/report";

export async function POST(_req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: channelData, error: cdError } = await supabase
    .from("channel_data")
    .select("*")
    .eq("producer_id", user.id)
    .eq("month", month)
    .eq("year", year)
    .single();

  if (cdError || !channelData) {
    return NextResponse.json(
      { error: "No channel data for this month. Pull YouTube data first." },
      { status: 404 }
    );
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("name, genre, youtube_channel_url, top_artist_1, top_artist_2, top_artist_3")
    .eq("id", user.id)
    .single();

  const profile = {
    name: profileRow?.name ?? null,
    genre: profileRow?.genre ?? null,
    youtube_channel_url: profileRow?.youtube_channel_url ?? null,
    top_artist_1: profileRow?.top_artist_1 ?? null,
    top_artist_2: profileRow?.top_artist_2 ?? null,
    top_artist_3: profileRow?.top_artist_3 ?? null,
  };

  const nicheData: NicheVideo[] = channelData.niche_data ?? [];
  const topVideos = getTopNicheVideos(nicheData);

  // Generate all 8 sections in parallel; use allSettled so one failure
  // doesn't abort the whole report.
  const [s0, s1, s2, s3, s4, s5, s6, s7] = await Promise.allSettled([
    generateChannelSummary(channelData, nicheData, profile),
    generateBenchmarkInsights(channelData, nicheData),
    generateTrendingBreakdowns(topVideos),
    generateRisingArtists(nicheData),
    generateWhatToAvoid(nicheData),
    generateActionPlan(channelData, nicheData, profile),
    generateUploadKit(profile, nicheData),
    generateTALLYScore(channelData, nicheData),
  ]);

  console.log(
    "[report/generate] allSettled results:",
    `rising_artists=${s3.status === "fulfilled" ? (s3.value as unknown[]).length : "REJECTED:" + (s3 as PromiseRejectedResult).reason}`,
    `what_to_avoid=${s4.status === "fulfilled" ? (s4.value as unknown[]).length : "REJECTED:" + (s4 as PromiseRejectedResult).reason}`,
    `action_plan=${s5.status === "fulfilled" ? (s5.value as unknown[]).length : "REJECTED:" + (s5 as PromiseRejectedResult).reason}`,
    `upload_kits=${s6.status === "fulfilled" ? (s6.value as unknown[]).length : "REJECTED:" + (s6 as PromiseRejectedResult).reason}`
  );

  const ok = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === "fulfilled" ? r.value : fallback;

  const tallyScore = ok(s7, { total: 0, breakdown: [], tip: "" });

  const report = {
    producer_id: user.id,
    month,
    year,
    channel_summary: ok(s0, ""),
    benchmark_insights: ok(s1, ""),
    trending_breakdowns: ok(s2, []),
    rising_artists: ok(s3, []),
    what_to_avoid: ok(s4, []),
    action_plan: ok(s5, []),
    upload_kits: ok(s6, []),
    tally_score: tallyScore.total,
    score_breakdown: { categories: tallyScore.breakdown, tip: tallyScore.tip },
  };

  const { data: saved, error: saveError } = await supabase
    .from("reports")
    .upsert(report, { onConflict: "producer_id,month,year" })
    .select()
    .single();

  if (saveError) {
    console.error("[report/generate] save error:", saveError.message);
    return NextResponse.json(report);
  }

  // Record score in history table
  if (tallyScore.total > 0) {
    const { error: histError } = await supabase
      .from("scores_history")
      .upsert(
        { producer_id: user.id, month, year, score: tallyScore.total, score_breakdown: tallyScore.breakdown },
        { onConflict: "producer_id,month,year" }
      );
    if (histError) {
      console.error("[report/generate] scores_history upsert error:", histError.message);
    } else {
      console.log(`[report/generate] scores_history saved: score=${tallyScore.total} for ${month}/${year}`);
    }
  } else {
    console.log("[report/generate] skipping scores_history: tallyScore.total=0");
  }

  return NextResponse.json(saved);
}
