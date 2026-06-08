import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";
import { extractKeywords } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";

interface ThumbnailStyle {
  style: string;
  color: string;
  text_preference: string;
  producer_tag: boolean;
  producer_tag_name?: string;
}

interface ThumbnailConcept {
  style_name: string;
  visual_brief: string;
  color_palette: string[];
  canva_instructions: string;
  why_it_fits: string;
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { beat_name, vibe, ideas } = await req.json() as {
    beat_name: string;
    vibe: string;
    ideas?: string;
  };

  const [profileRes, channelRes] = await Promise.all([
    supabase.from("profiles").select("genre, thumbnail_style").eq("id", user.id).single(),
    supabase.from("channel_data").select("niche_data").eq("producer_id", user.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(1).single(),
  ]);

  const genre = profileRes.data?.genre ?? "hip hop";
  const thumbnailStyle = profileRes.data?.thumbnail_style as ThumbnailStyle | null;
  const nicheData: NicheVideo[] = channelRes.data?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 8).map((k) => k.tag).join(", ");

  const topNicheVideos = [...nicheData]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v) => `"${v.title}" (${Math.round(v.viewCount / 1000)}K views)`);

  const styleContext = thumbnailStyle
    ? `Producer's style preferences:
- Visual style: ${thumbnailStyle.style}
- Color palette preference: ${thumbnailStyle.color}
- Text usage: ${thumbnailStyle.text_preference}
- Producer tag: ${thumbnailStyle.producer_tag ? `Yes — "${thumbnailStyle.producer_tag_name}"` : "No"}`
    : "No style preferences set — use genre defaults.";

  const prompt = `You are a YouTube thumbnail strategist for beat producers. Generate 3 thumbnail concepts for this beat.

Beat details:
- Beat name: ${beat_name}
- Vibe/mood: ${vibe}
- Genre: ${genre}
- Additional ideas: ${ideas || "none"}

${styleContext}

Top niche videos for reference:
${topNicheVideos.length ? topNicheVideos.join("\n") : "No niche data available"}

Hot keywords in niche: ${topKeywords || "N/A"}

For each of the 3 concepts, think about what visually performs in this specific niche. Each concept must be distinct in style.

Respond with ONLY valid JSON. No markdown no code blocks.
{"concepts":[{"style_name":"string","visual_brief":"detailed description of the full visual — background, composition, lighting, mood, any text overlay","color_palette":["#hex1","#hex2","#hex3"],"canva_instructions":"step-by-step instructions for recreating this in Canva (3-5 steps)","why_it_fits":"why this works for ${genre} right now"},{"style_name":"string","visual_brief":"string","color_palette":["#hex1","#hex2","#hex3"],"canva_instructions":"string","why_it_fits":"string"},{"style_name":"string","visual_brief":"string","color_palette":["#hex1","#hex2","#hex3"],"canva_instructions":"string","why_it_fits":"string"}],"niche_inspiration":["observation about top video 1","observation about top video 2","observation about top video 3","observation about top video 4","observation about top video 5"]}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: "You are a YouTube thumbnail strategist for beat producers. Output only valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  try {
    const parsed = JSON.parse(stripJson(raw)) as {
      concepts: ThumbnailConcept[];
      niche_inspiration: string[];
    };
    return NextResponse.json({
      concepts: parsed.concepts,
      niche_inspiration: parsed.niche_inspiration,
      niche_thumbnails: [...nicheData].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5),
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }
}
