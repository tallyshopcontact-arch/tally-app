import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractChannelId, getChannelStats, getRecentVideos } from "@/lib/youtube";
import { anthropic } from "@/lib/anthropic";

async function generateCompetitorInsight(
  channelName: string,
  subscriberCount: number,
  videosThisMonth: number,
  topVideo: { title: string; views: number } | null,
  topTags: string[],
  avgViews: number,
  producerGenre: string | null
): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "You are a YouTube analyst for beat producers. Output only a plain-text insight sentence — no JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Give a 1-2 sentence insight about this competitor beat channel for a ${producerGenre ?? "hip hop"} producer to act on.

Channel: ${channelName} (${subscriberCount.toLocaleString()} subscribers)
Videos this month: ${videosThisMonth}
Avg views per video: ${avgViews.toLocaleString()}
Top video: "${topVideo?.title ?? "N/A"}" (${(topVideo?.views ?? 0).toLocaleString()} views)
Top tags: ${topTags.join(", ") || "none"}

Focus on what this competitor is doing that the producer could learn from or differentiate against. Be specific about their tag strategy, upload volume, or title patterns.`,
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("genre")
    .eq("id", user.id)
    .single();

  const [stats, recentVideos] = await Promise.all([
    getChannelStats(channelId),
    getRecentVideos(channelId, 10),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const videosThisMonth = recentVideos.filter(
    (v) => new Date(v.publishedAt) >= monthStart
  );

  const topVideo = recentVideos.reduce<typeof recentVideos[0] | null>(
    (best, v) => (!best || v.viewCount > best.viewCount ? v : best),
    null
  );

  const tagCounts: Record<string, number> = {};
  for (const v of recentVideos) {
    for (const tag of v.tags) {
      tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  const avgViews =
    recentVideos.length > 0
      ? Math.round(recentVideos.reduce((s, v) => s + v.viewCount, 0) / recentVideos.length)
      : 0;

  const topVideoData = topVideo
    ? { title: topVideo.title, views: topVideo.viewCount, videoId: topVideo.videoId }
    : null;

  const insight = await generateCompetitorInsight(
    stats.channelName,
    stats.subscriberCount,
    videosThisMonth.length,
    topVideoData,
    topTags,
    avgViews,
    profileRow?.genre ?? null
  );

  const lastData = {
    videos_this_month: videosThisMonth.length,
    top_video: topVideoData,
    top_tags: topTags,
    avg_views: avgViews,
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
