import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { openai } from "@/lib/openai";
import { anthropic } from "@/lib/anthropic";
import { generateThumbnailPrompts } from "@/lib/thumbnail-prompts";
import type { NicheVideo } from "@/lib/keywords";

interface ThumbnailStyle {
  style: string;
  color: string;
  text_preference: string;
  producer_tag: boolean;
  producer_tag_name?: string;
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

async function analyzeNicheThumbnails(
  topVideos: { videoId: string; title: string; viewCount: number; thumbnailUrl: string }[],
  genre: string
): Promise<string> {
  if (!topVideos.length) return `No niche data available — use ${genre} genre best practices.`;
  try {
    const imageBlocks = topVideos.map((v) => ({
      type: "image" as const,
      source: { type: "url" as const, url: v.thumbnailUrl },
    }));
    const videoList = topVideos
      .map((v, i) => `${i + 1}. "${v.title}" — ${Math.round(v.viewCount / 1000)}K views`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: "You analyze YouTube thumbnail visual trends. Be specific and concise.",
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `Analyze these top ${topVideos.length} ${genre} beat producer thumbnails (ordered by view count):\n${videoList}\n\nIn 3-4 sentences, describe the dominant visual patterns: color palette, composition style, use of text vs no text, dark vs bright, atmospheric vs bold. Focus on what visual choices appear most in the highest-performing videos. Be specific.`,
          },
        ],
      }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  } catch {
    return `Dark atmospheric visuals dominate ${genre} thumbnails — minimal text, moody lighting, strong contrast.`;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    beat_name: string;
    genre?: string;
    vibe?: string[];
    artists?: string[];
  };

  const { beat_name, vibe = [], artists = [] } = body;
  if (!beat_name?.trim()) return NextResponse.json({ error: "beat_name is required" }, { status: 400 });

  const [profileRes, channelRes] = await Promise.all([
    supabase.from("profiles")
      .select("genre, top_artist_1, top_artist_2, top_artist_3, thumbnail_style")
      .eq("id", user.id).single(),
    supabase.from("channel_data")
      .select("niche_data")
      .eq("producer_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1).single(),
  ]);

  const genre = body.genre?.trim() || profileRes.data?.genre || "hip hop";
  const thumbnailStyle = profileRes.data?.thumbnail_style as ThumbnailStyle | null;
  const profileArtists = artists.length > 0 ? artists : [
    profileRes.data?.top_artist_1,
    profileRes.data?.top_artist_2,
    profileRes.data?.top_artist_3,
  ].filter(Boolean) as string[];

  const nicheData: NicheVideo[] = channelRes.data?.niche_data ?? [];
  const topVideos = [...nicheData]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v) => ({ videoId: v.videoId, title: v.title, viewCount: v.viewCount, thumbnailUrl: v.thumbnailUrl }));

  // Analyze niche thumbnails with Claude vision
  const nicheInsights = await analyzeNicheThumbnails(topVideos, genre);

  // Generate DALL-E prompts via Claude
  const promptResults = await generateThumbnailPrompts({
    beatName: beat_name.trim(),
    genre,
    vibe,
    artists: profileArtists,
    producerStyle: thumbnailStyle
      ? { style: thumbnailStyle.style, color: thumbnailStyle.color, text_preference: thumbnailStyle.text_preference }
      : null,
    nicheInsights,
  });

  // Generate all 3 images in parallel with gpt-image-1
  const imageResults = await Promise.all(
    promptResults.map(async (p) => {
      try {
        const response = await openai.images.generate({
          model: "gpt-image-1",
          prompt: p.prompt,
          size: "1024x1024",
          output_format: "png",
          n: 1,
        } as Parameters<typeof openai.images.generate>[0]) as { data: Array<{ b64_json?: string | null }> };
        const b64 = response.data?.[0]?.b64_json ?? null;
        return {
          label: p.label,
          description: p.description,
          prompt: p.prompt,
          url: b64 ? `data:image/png;base64,${b64}` : null,
          error: null,
        };
      } catch (e) {
        return {
          label: p.label,
          description: p.description,
          prompt: p.prompt,
          url: null,
          error: e instanceof Error ? e.message : "Generation failed",
        };
      }
    })
  );

  // Save to thumbnail_generations
  await supabase.from("thumbnail_generations").insert({
    producer_id: user.id,
    beat_name: beat_name.trim(),
    prompts: promptResults,
    image_urls: imageResults.map((r) => r.url),
  });

  return NextResponse.json({
    beat_name: beat_name.trim(),
    genre,
    images: imageResults,
    niche_insights: nicheInsights,
  });
}
