import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import {
  extractChannelId,
  getChannelStats,
  getMonthlyStats,
  searchNicheVideos,
} from "@/lib/youtube";

export async function POST(_req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("youtube_channel_url, genre")
    .eq("id", user.id)
    .single();

  if (!profile?.youtube_channel_url) {
    return NextResponse.json(
      { error: "No YouTube channel URL found in your profile" },
      { status: 400 }
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const channelId = await extractChannelId(profile.youtube_channel_url);

    const [channelStats, monthlyStats, nicheVideos] = await Promise.all([
      getChannelStats(channelId),
      getMonthlyStats(channelId, year, month),
      searchNicheVideos(profile.genre ?? "hip hop", 50),
    ]);

    const monthlyLikes = monthlyStats.videosPosted.reduce(
      (sum, v) => sum + v.likeCount,
      0
    );

    const record = {
      producer_id: user.id,
      channel_id: channelId,
      channel_name: channelStats.channelName,
      subscriber_count: channelStats.subscriberCount,
      total_views: channelStats.totalViews,
      video_count: channelStats.videoCount,
      monthly_views: monthlyStats.totalMonthlyViews,
      monthly_subscribers: 0, // Requires YouTube Analytics API (OAuth); not available via API key
      monthly_videos: monthlyStats.videosPosted.length,
      monthly_likes: monthlyLikes,
      best_video_title: monthlyStats.bestVideo?.title ?? null,
      best_video_views: monthlyStats.bestVideo?.viewCount ?? null,
      best_video_id: monthlyStats.bestVideo?.videoId ?? null,
      niche_data: nicheVideos,
      month,
      year,
    };

    const { data, error } = await supabase
      .from("channel_data")
      .upsert(record, { onConflict: "producer_id,month,year" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
