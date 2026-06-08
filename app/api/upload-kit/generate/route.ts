import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractKeywords } from "@/lib/keywords";
import { anthropic } from "@/lib/anthropic";
import type { NicheVideo } from "@/lib/keywords";

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    beat_name,
    genre,
    vibes,
    artist_1,
    artist_2,
    artist_3,
    bpm,
    key,
    notes,
  } = body as {
    beat_name?: string;
    genre: string;
    vibes: string[];
    artist_1?: string;
    artist_2?: string;
    artist_3?: string;
    bpm?: number;
    key?: string;
    notes?: string;
  };

  // Get profile for fallback data
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, genre, top_artist_1, top_artist_2, top_artist_3")
    .eq("id", user.id)
    .single();

  // Get latest channel_data for niche keyword heat map
  const now = new Date();
  const { data: channelData } = await supabase
    .from("channel_data")
    .select("niche_data")
    .eq("producer_id", user.id)
    .eq("month", now.getMonth() + 1)
    .eq("year", now.getFullYear())
    .single();

  const nicheData: NicheVideo[] = channelData?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 12).map((k) => k.tag);

  const artists = [artist_1, artist_2, artist_3].filter(Boolean);
  const artistList = artists.length > 0
    ? artists.join(", ")
    : [profile?.top_artist_1, profile?.top_artist_2, profile?.top_artist_3].filter(Boolean).join(", ") || "various artists";

  const resolvedGenre = genre || profile?.genre || "hip hop";
  const vibeStr = vibes?.length ? vibes.join(", ") : "versatile";
  const beatNameStr = beat_name?.trim() || "";
  const bpmStr = bpm ? `${bpm} BPM` : "tempo not specified";
  const keyStr = key ? `key of ${key}` : "key not specified";
  const notesStr = notes?.trim() || "none";
  const keywordsStr = topKeywords.length
    ? topKeywords.join(", ")
    : `${resolvedGenre} type beat, free type beat`;

  // Top niche videos for pattern analysis
  const topNicheVideos = [...nicheData]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 8);
  const nicheVideoContext = topNicheVideos.length
    ? topNicheVideos
        .map((v) => `- "${v.title}" (${(v.viewCount / 1000).toFixed(0)}K views) — tags: ${v.tags.slice(0, 6).join(", ")}`)
        .join("\n")
    : "- No niche video data available";

  const prompt = `You are an expert YouTube strategist who has studied thousands of beat producer channels. Generate a complete upload kit for the following beat.

Beat details:
- Beat name: ${beatNameStr || "(not provided — suggest one)"}
- Genre: ${resolvedGenre}
- Vibe/feel: ${vibeStr}
- Sounds like artists: ${artistList}
- ${bpmStr}, ${keyStr}
- Additional notes: ${notesStr}

Top-performing videos in this producer's niche (real data — study these titles and tag patterns):
${nicheVideoContext}

Hot niche keywords from this producer's heat map (top 12 by frequency across niche):
${keywordsStr}

DESCRIPTION INSTRUCTIONS: Study the top-performing niche video titles above. Mirror their structure and keyword density. A great beat producer description:
1. Opens with a punchy 1-line hook naming the vibe and artist references (e.g. "Dark cinematic trap beat in the style of [Artist]")
2. Second paragraph: beat specs (BPM if known, key if known, vibe adjectives) + download/license CTA with [LINK] placeholder
3. Third paragraph: 4-6 of the niche keywords woven in naturally as searchable phrases (not just listed)
4. Closes with licensing terms line + copyright
Write 160-200 words. Sound like a real producer, not a template.

THUMBNAIL INSTRUCTIONS: Analyze the genre "${resolvedGenre}" specifically. Different genres have different thumbnail meta:
- Boom Bap / Lo-fi: atmospheric, minimal text, dark moody visuals, single color accent, film grain aesthetic
- Trap / Drill: bold high-contrast text, face/silhouette, aggressive color (red/white on black), text takes 40%+ of frame
- Melodic Rap / R&B: gradient backgrounds, clean sans-serif text, warmer palette (purple/gold)
- Afrobeats / Jersey Club: bright colors, energetic composition, artist name prominent
Generate 3 concepts that reflect what ACTUALLY works in ${resolvedGenre} right now — not generic placeholder concepts.

Respond with ONLY valid JSON. No markdown, no code blocks.

{
  "beat_name_suggestion": "string (ONLY include if beat name was not provided; otherwise omit this field)",
  "titles": [
    {"title": "9-12 word YouTube title with beat name in quotes, artist reference, year 2026", "reason": "1 sentence on why this title works for SEO and clicks in this niche"},
    {"title": "alternative title option", "reason": "reason"},
    {"title": "third title option", "reason": "reason"}
  ],
  "description": "Full 160-200 word YouTube description following the structure above. Sound authentic, not templated.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12"],
  "thumbnail_concepts": [
    {"style": "concept name (e.g. Dark Minimal, Bold Text, Atmospheric)", "background": "specific visual description — colors, textures, imagery", "text_treatment": "exactly what text appears and how it's styled (size, weight, position)", "color_palette": "3-4 specific colors e.g. #0a0a0a, #e8e8e8, #c0392b", "why_it_works": "1 sentence on why this drives clicks specifically in ${resolvedGenre}"},
    {"style": "concept name", "background": "background description", "text_treatment": "text details", "color_palette": "3-4 specific colors", "why_it_works": "reason"},
    {"style": "concept name", "background": "background description", "text_treatment": "text details", "color_palette": "3-4 specific colors", "why_it_works": "reason"}
  ],
  "best_upload_time": {
    "day": "day of week",
    "time": "time with timezone e.g. 6pm EST",
    "reason": "1 sentence reason based on beat producer audience engagement patterns"
  },
  "niche_tip": "One specific, actionable tip based on the niche data above — what is working right now in this exact niche"
}`;

  let generatedKit: Record<string, unknown>;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: "You are a YouTube SEO expert for beat producers. Output only valid JSON with no markdown or code blocks.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    generatedKit = JSON.parse(clean);
  } catch (e) {
    console.error("[upload-kit/generate] Claude parse failed:", e);
    return NextResponse.json({ error: "Failed to generate kit" }, { status: 500 });
  }

  // Save to upload_kits table
  const { data: saved, error: saveErr } = await supabase
    .from("upload_kits")
    .insert({
      producer_id: user.id,
      beat_name: beatNameStr || (generatedKit.beat_name_suggestion as string) || "Untitled",
      genre: resolvedGenre,
      input_data: { beat_name: beatNameStr, genre: resolvedGenre, vibes, artist_1, artist_2, artist_3, bpm, key, notes },
      generated_kit: generatedKit,
    })
    .select()
    .single();

  if (saveErr) {
    console.error("[upload-kit/generate] save error:", saveErr.message);
    // Return the kit even if save fails
    return NextResponse.json(generatedKit);
  }

  return NextResponse.json({ ...generatedKit, id: saved.id, created_at: saved.created_at });
}
