import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractChannelId, getChannelStats, getRecentVideos } from "@/lib/youtube";

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

  // Most-used tags across recent 10 videos
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

  const lastData = {
    videos_this_month: videosThisMonth.length,
    top_video: topVideo
      ? { title: topVideo.title, views: topVideo.viewCount, videoId: topVideo.videoId }
      : null,
    top_tags: topTags,
    avg_views: avgViews,
    pulled_at: now.toISOString(),
  };

  // Upsert competitor row
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
