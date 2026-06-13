import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractChannelId } from "@/lib/youtube";
import type { NicheVideo } from "@/lib/keywords";
import { analyzeChannel, computeTallyScoreFromAnalysis } from "@/lib/channel-analysis";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";

interface StealThis {
  tactic: string;
  reason: string;
}

function buildStealThis(
  analysis: Awaited<ReturnType<typeof analyzeChannel>>,
  producerGenre: string
): StealThis[] {
  const items: StealThis[] = [];

  // Winner title formula
  if (analysis.titleFormula.formula) {
    items.push({
      tactic: `Title formula: "${analysis.titleFormula.formula}"`,
      reason: `Their top videos use this exact structure — their formula match score: ${analysis.titleFormula.producerScore}/100`,
    });
  }

  // Best upload day
  if (analysis.timingIntelligence.bestDayInNiche) {
    items.push({
      tactic: `Upload on ${analysis.timingIntelligence.bestDayInNiche}`,
      reason: `They get ${analysis.timingIntelligence.bestDayMultiplier}x more views on that day`,
    });
  }

  // Top artist they target
  const topArtistAssoc = analysis.artistAssociations
    .filter((a) => a.videoCount > 0)
    .sort((a, b) => b.avgViews - a.avgViews)[0];
  if (topArtistAssoc) {
    items.push({
      tactic: `Make beats for ${topArtistAssoc.name}`,
      reason: `Their "${topArtistAssoc.name}" videos average ${topArtistAssoc.avgViews.toLocaleString()} views — highest on their channel`,
    });
  }

  // Description depth
  const descTip =
    analysis.descriptionDepth.producerAvgWordCount > 40
      ? `Write longer descriptions (they average ${analysis.descriptionDepth.producerAvgWordCount} words)`
      : null;
  if (descTip) {
    items.push({
      tactic: descTip,
      reason: `Their detailed descriptions help with YouTube search — their score: ${analysis.descriptionDepth.score}/100`,
    });
  }

  // Missing keyword opportunity
  const topMissing = analysis.missingKeywords[0];
  if (topMissing) {
    items.push({
      tactic: `Add "${topMissing.keyword}" to your tags`,
      reason: `This keyword appears in ${topMissing.nicheFrequency} of their top videos but you're not using it in your ${producerGenre} uploads`,
    });
  }

  return items.slice(0, 4);
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "/api/competitors/track", 10);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached. Resets at midnight.", resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const { channel_url: rawUrl } = await req.json() as { channel_url: string };
  const channel_url = sanitizeInput(rawUrl ?? "", 200);
  if (!channel_url) return NextResponse.json({ error: "channel_url is required" }, { status: 400 });

  let channelId: string;
  try {
    channelId = await extractChannelId(channel_url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not resolve channel" }, { status: 400 });
  }

  const now = new Date();

  const [profileRes, channelDataRes] = await Promise.all([
    supabase.from("profiles").select("genre, top_artist_1, top_artist_2, top_artist_3").eq("id", user.id).single(),
    supabase.from("channel_data")
      .select("niche_data")
      .eq("producer_id", user.id)
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear())
      .single(),
  ]);

  const producerGenre = profileRes.data?.genre ?? "hip hop";
  const nicheData: NicheVideo[] = channelDataRes.data?.niche_data ?? [];
  const nicheAvgViews = nicheData.length > 0
    ? Math.round(nicheData.reduce((s, v) => s + v.viewCount, 0) / nicheData.length)
    : 0;

  // Run deep analysis on the competitor channel
  let analysis: Awaited<ReturnType<typeof analyzeChannel>>;
  try {
    analysis = await analyzeChannel(channelId, "", producerGenre, [], {
      preloadedNicheVideos: nicheData.length > 0 ? nicheData : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to analyze competitor channel" },
      { status: 500 }
    );
  }

  const tallyResult = computeTallyScoreFromAnalysis(analysis);

  const topVideo = analysis.recentVideos.reduce<typeof analysis.recentVideos[0] | null>(
    (best, v) => (!best || v.views > best.views ? v : best),
    null
  );
  const topVideoData = topVideo
    ? { title: topVideo.title, views: topVideo.views, videoId: topVideo.videoId }
    : null;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const videosThisMonth = analysis.recentVideos.filter(
    (v) => new Date(v.publishedAt) >= monthStart
  ).length;

  const stealThis = buildStealThis(analysis, producerGenre);

  const lastData = {
    videos_this_month: videosThisMonth,
    top_video: topVideoData,
    avg_views: analysis.avgViewsLast30Days,
    niche_avg_views: nicheAvgViews,
    tally_score: tallyResult.total,
    score_breakdown: tallyResult.breakdown,
    steal_this: stealThis,
    timing: {
      best_day: analysis.timingIntelligence.bestDayInNiche,
      best_day_multiplier: analysis.timingIntelligence.bestDayMultiplier,
    },
    title_formula: analysis.titleFormula.formula,
    top_artists: analysis.artistAssociations.slice(0, 3).map((a) => a.name),
    key_gap: analysis.winnersVsLosers.keyGap,
    pulled_at: now.toISOString(),
  };

  const { data: existing } = await supabase
    .from("competitors")
    .select("id")
    .eq("producer_id", user.id)
    .eq("channel_id", channelId)
    .single();

  if (existing) {
    await supabase
      .from("competitors")
      .update({
        channel_url: channel_url.trim(),
        channel_name: analysis.channelName,
        subscriber_count: analysis.subscriberCount,
        last_data: lastData,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("competitors").insert({
      producer_id: user.id,
      channel_url: channel_url.trim(),
      channel_id: channelId,
      channel_name: analysis.channelName,
      subscriber_count: analysis.subscriberCount,
      last_data: lastData,
    });
  }

  return NextResponse.json({
    channel_id: channelId,
    channel_name: analysis.channelName,
    subscriber_count: analysis.subscriberCount,
    total_views: analysis.totalViews,
    last_data: lastData,
  });
}
