import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractChannelId, getChannelStats, getRecentVideos } from "@/lib/youtube";
import type { VideoData } from "@/lib/youtube";
import type { NicheVideo } from "@/lib/keywords";
import { anthropic } from "@/lib/anthropic";

interface ScoreBreakdownItem {
  category: string;
  score: number;
  max: number;
}

function calcCompetitorTallyScore(
  videos: VideoData[],
  videosThisMonth: number,
  nicheAvgViews: number
): { score: number; breakdown: ScoreBreakdownItem[] } {
  if (videos.length === 0) return { score: 0, breakdown: [] };

  const avgViews = Math.round(videos.reduce((s, v) => s + v.viewCount, 0) / videos.length);
  const avgTitleWords = videos.reduce((s, v) => s + v.title.split(/\s+/).filter(Boolean).length, 0) / videos.length;
  const avgDescLen = videos.reduce((s, v) => s + (v.description?.length ?? 0), 0) / videos.length;
  const avgTags = videos.reduce((s, v) => s + (v.tags?.length ?? 0), 0) / videos.length;

  // Views vs niche (30pts)
  let viewScore = 0;
  if (nicheAvgViews > 0) {
    const ratio = avgViews / nicheAvgViews;
    viewScore = ratio >= 2 ? 30 : ratio >= 1 ? 20 : ratio >= 0.5 ? 10 : 0;
  } else {
    viewScore = avgViews >= 10000 ? 30 : avgViews >= 5000 ? 20 : avgViews >= 1000 ? 10 : 0;
  }

  // Title length (20pts)
  const titleScore = avgTitleWords >= 9 && avgTitleWords <= 12 ? 20
    : avgTitleWords >= 7 ? 12
    : avgTitleWords >= 5 ? 6 : 0;

  // Description length (20pts)
  const descScore = avgDescLen > 300 ? 20 : avgDescLen > 150 ? 12 : avgDescLen > 50 ? 6 : 0;

  // Tags (15pts)
  const tagScore = avgTags > 8 ? 15 : avgTags > 4 ? 10 : avgTags > 0 ? 5 : 0;

  // Upload frequency (15pts)
  const freqScore = videosThisMonth >= 8 ? 15 : videosThisMonth >= 4 ? 10 : videosThisMonth >= 2 ? 5 : 0;

  return {
    score: Math.min(100, viewScore + titleScore + descScore + tagScore + freqScore),
    breakdown: [
      { category: "Views vs Niche", score: viewScore, max: 30 },
      { category: "Title Length", score: titleScore, max: 20 },
      { category: "Description", score: descScore, max: 20 },
      { category: "Tags", score: tagScore, max: 15 },
      { category: "Upload Frequency", score: freqScore, max: 15 },
    ],
  };
}

async function generateCompetitorInsight(
  channelName: string,
  subscriberCount: number,
  videosThisMonth: number,
  topVideo: { title: string; views: number } | null,
  tallyScore: number,
  breakdown: ScoreBreakdownItem[],
  producerGenre: string | null
): Promise<string> {
  try {
    const breakdownStr = breakdown.map(b => `${b.category}: ${b.score}/${b.max}`).join(", ");
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "You are a YouTube analyst for beat producers. Output only a plain-text insight sentence — no JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Give a 1-2 sentence insight about this competitor beat channel for a ${producerGenre ?? "hip hop"} producer to act on.

Channel: ${channelName} (${subscriberCount.toLocaleString()} subscribers)
TALLY Score: ${tallyScore}/100
Score breakdown: ${breakdownStr}
Videos this month: ${videosThisMonth}
Top video: "${topVideo?.title ?? "N/A"}" (${(topVideo?.views ?? 0).toLocaleString()} views)

Focus on which score categories they're strongest in and what the producer could learn or do differently. Be specific about title strategy, upload volume, or description quality.`,
      }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { channel_url } = await req.json() as { channel_url: string };
  if (!channel_url?.trim()) return NextResponse.json({ error: "channel_url is required" }, { status: 400 });

  let channelId: string;
  try {
    channelId = await extractChannelId(channel_url.trim());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not resolve channel" }, { status: 400 });
  }

  const now = new Date();

  // Fetch profile genre + producer's niche data for view comparison
  const [profileRes, channelDataRes] = await Promise.all([
    supabase.from("profiles").select("genre").eq("id", user.id).single(),
    supabase.from("channel_data")
      .select("niche_data")
      .eq("producer_id", user.id)
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear())
      .single(),
  ]);

  const nicheData: NicheVideo[] = channelDataRes.data?.niche_data ?? [];
  const nicheAvgViews = nicheData.length > 0
    ? Math.round(nicheData.reduce((s, v) => s + v.viewCount, 0) / nicheData.length)
    : 0;

  console.log(`[competitors/track] niche_avg_views=${nicheAvgViews} from ${nicheData.length} niche videos`);

  const [stats, recentVideos] = await Promise.all([
    getChannelStats(channelId),
    getRecentVideos(channelId, 20),
  ]);

  console.log(`[competitors/track] ${stats.channelName}: fetched ${recentVideos.length} recent videos`);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const videosThisMonth = recentVideos.filter(v => new Date(v.publishedAt) >= monthStart);

  const topVideo = recentVideos.reduce<typeof recentVideos[0] | null>(
    (best, v) => (!best || v.viewCount > best.viewCount ? v : best),
    null
  );

  const avgViews = recentVideos.length > 0
    ? Math.round(recentVideos.reduce((s, v) => s + v.viewCount, 0) / recentVideos.length)
    : 0;

  const topVideoData = topVideo
    ? { title: topVideo.title, views: topVideo.viewCount, videoId: topVideo.videoId }
    : null;

  const competitorScore = calcCompetitorTallyScore(recentVideos, videosThisMonth.length, nicheAvgViews);
  console.log(`[competitors/track] ${stats.channelName}: TALLY score=${competitorScore.score}`);

  const insight = await generateCompetitorInsight(
    stats.channelName,
    stats.subscriberCount,
    videosThisMonth.length,
    topVideoData,
    competitorScore.score,
    competitorScore.breakdown,
    profileRes.data?.genre ?? null
  );

  const lastData = {
    videos_this_month: videosThisMonth.length,
    top_video: topVideoData,
    avg_views: avgViews,
    tally_score: competitorScore.score,
    score_breakdown: competitorScore.breakdown,
    ai_insight: insight,
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
        channel_name: stats.channelName,
        subscriber_count: stats.subscriberCount,
        last_data: lastData,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("competitors").insert({
      producer_id: user.id,
      channel_url: channel_url.trim(),
      channel_id: channelId,
      channel_name: stats.channelName,
      subscriber_count: stats.subscriberCount,
      last_data: lastData,
    });
  }

  return NextResponse.json({
    channel_id: channelId,
    channel_name: stats.channelName,
    subscriber_count: stats.subscriberCount,
    total_views: stats.totalViews,
    last_data: lastData,
  });
}
