import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractKeywords } from "@/lib/keywords";
import { searchNicheVideos } from "@/lib/youtube";
import { anthropic } from "@/lib/anthropic";
import { scoreTitle } from "@/lib/title-scorer";
import type { NicheVideo } from "@/lib/keywords";

interface ThumbnailNote {
  videoId: string;
  note: string;
}

interface ThumbnailAnalysisResult {
  notes: ThumbnailNote[];
  recommendation: string;
}

async function analyzeThumbnails(
  topVideos: { videoId: string; title: string; viewCount: number; thumbnailUrl: string }[],
  genre: string,
  artists: string[],
  vibes: string[]
): Promise<ThumbnailAnalysisResult | null> {
  if (!topVideos.length) return null;
  try {
    const imageBlocks = topVideos.map((v) => ({
      type: "image" as const,
      source: { type: "url" as const, url: v.thumbnailUrl },
    }));

    const videoList = topVideos
      .map((v, i) => `${i + 1}. "${v.title}" — ${(v.viewCount / 1000).toFixed(0)}K views`)
      .join("\n");

    const beatContext = [
      ...vibes,
      genre,
    ].filter(Boolean).join(", ");
    const artistContext = artists.length > 0
      ? ` with a ${artists.slice(0, 2).join("/")} influence`
      : "";

    const analysisPrompt = `I'm showing you the top ${topVideos.length} highest-performing YouTube beat video thumbnails from the ${genre} niche, ordered by view count (highest first):

${videoList}

Analyze the visual patterns across these thumbnails. Look at:
- Text vs no text (how much text, what size)
- Dark vs light backgrounds
- Minimal vs busy composition
- Color patterns (dominant colors, contrast)
- Whether artist faces/silhouettes appear
- Overall aesthetic (atmospheric, aggressive, clean, etc.)

Write one short sentence per thumbnail describing the key visual choice that likely drives clicks.
Then write one overall recommendation specifically for a producer making ${beatContext} beats${artistContext} — what EXACTLY should they do with their thumbnails right now based on what's working in this niche?

Respond with ONLY valid JSON. No markdown.
{"notes":[{"videoId":"<id>","note":"<1 sentence>"},...],"recommendation":"<1-2 sentences specific to ${beatContext} beats${artistContext}>"}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system:
        "You are a YouTube thumbnail analyst specializing in beat producer channels. Analyze visual patterns. Output only valid JSON with no markdown or code blocks.",
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: analysisPrompt },
          ],
        },
      ],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as ThumbnailAnalysisResult;
    if (!parsed.notes || !parsed.recommendation) throw new Error("invalid shape");
    return parsed;
  } catch (e) {
    console.error("[upload-kit/generate] thumbnail analysis failed:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { beat_name, genre, vibes, artist_1, artist_2, artist_3, bpm, key, notes } = body as {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, genre, top_artist_1, top_artist_2, top_artist_3")
    .eq("id", user.id)
    .single();

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

  const artistsList = [artist_1, artist_2, artist_3].filter((a): a is string => !!a?.trim());
  const artistList =
    artistsList.length > 0
      ? artistsList.join(", ")
      : [profile?.top_artist_1, profile?.top_artist_2, profile?.top_artist_3]
          .filter(Boolean)
          .join(", ") || "various artists";

  const resolvedGenre = genre || profile?.genre || "hip hop";
  const producerName = profile?.name || "Producer";
  const vibeStr = vibes?.length ? vibes.join(", ") : "versatile";
  const beatNameStr = beat_name?.trim() || "";
  const bpmStr = bpm ? `${bpm}` : "";
  const keyStr = key || "";
  const notesStr = notes?.trim() || "none";
  const keywordsStr = topKeywords.length
    ? topKeywords.join(", ")
    : `${resolvedGenre} type beat, free type beat`;

  // Profile genre niche videos for prompt context (title patterns + keywords)
  const topNicheVideos = [...nicheData]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const nicheVideoContext = topNicheVideos.length
    ? topNicheVideos
        .map(
          (v) =>
            `- "${v.title}" (${(v.viewCount / 1000).toFixed(0)}K views) — tags: ${v.tags.slice(0, 6).join(", ")}`
        )
        .join("\n")
    : "- No niche video data available";

  const bpmKeyLine =
    bpmStr && keyStr
      ? `BPM: ${bpmStr} | Key: ${keyStr}`
      : bpmStr
      ? `BPM: ${bpmStr}`
      : keyStr
      ? `Key: ${keyStr}`
      : "";

  const hashtagSuggestions = topKeywords
    .slice(0, 10)
    .map((k) => `#${k.replace(/\s+/g, "")}`)
    .join(" ");

  const prompt = `You are an expert YouTube strategist who has studied thousands of beat producer channels. Generate a complete upload kit for the following beat.

Beat details:
- Beat name: ${beatNameStr || "(not provided — suggest one)"}
- Producer name: ${producerName}
- Genre: ${resolvedGenre}
- Vibe/feel: ${vibeStr}
- Sounds like artists: ${artistList}
- BPM: ${bpmStr || "not specified"}
- Key: ${keyStr || "not specified"}
- Additional notes: ${notesStr}

Top-performing videos in this producer's niche (real data — study these title patterns):
${nicheVideoContext}

Hot niche keywords from this producer's heat map (top 12 by frequency):
${keywordsStr}

DESCRIPTION FORMAT — generate the description in this EXACT format (use real newlines, copy the structure precisely):

[genre-matching emoji] [Beat Name] Type Beat "[Name]" [matching emoji]

Produced by ${producerName}${bpmKeyLine ? `\n${bpmKeyLine}` : ""}

🎵 For Licensing/Leasing: [licensing link]
📲 Free MP3: [free download link]
🛒 Beat Store: [beat store link]
📧 Contact: [contact email]

[2-3 sentences describing the vibe and feel naturally — sound like a real producer, not AI. Reference the artists and genre. Use 2-3 of the niche keywords naturally woven in.]

Perfect for: [comma-separated list of use cases matching this genre and mood]

${hashtagSuggestions || `#${resolvedGenre.replace(/\s+/g, "").toLowerCase()}typebeat #freetypebeat #typebeat2026`}

Tags: [comma-separated version of the tags array]

EMOJI GUIDANCE by genre: Boom Bap/Lo-fi = 🎹🎷🌙🔥, Trap/Drill = 🔥💀⚡🖤, Melodic/R&B = 🌊💜✨🎶, Afrobeats = 🌍🔥🎺💃
Choose emojis that match ${resolvedGenre} producers actually use.

THUMBNAIL INSTRUCTIONS: Genre-specific — what ACTUALLY works in ${resolvedGenre} right now:
- Boom Bap / Lo-fi: atmospheric, minimal text, dark moody, single accent color, film grain
- Trap / Drill: bold high-contrast text (40%+ of frame), face/silhouette, red/white on black
- Melodic Rap / R&B: gradients, warm palette (purple/gold), clean sans-serif
- Afrobeats / Jersey Club: bright energetic colors, artist name prominent

Respond with ONLY valid JSON. No markdown, no code blocks.

{
  "beat_name_suggestion": "string (ONLY include if beat name was not provided; otherwise omit this field)",
  "titles": [
    {"title": "9-12 word YouTube title with beat name in quotes, artist reference, year 2026", "reason": "1 sentence on why this title works for SEO and clicks in this niche"},
    {"title": "alternative title option", "reason": "reason"},
    {"title": "third title option", "reason": "reason"}
  ],
  "description": "Full description following the EXACT format above. Use \\n for line breaks within the JSON string.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12"],
  "thumbnail_concepts": [
    {"style": "concept name", "background": "specific visual — colors, textures, imagery", "text_treatment": "exactly what text appears and how (size, weight, position)", "color_palette": "3-4 specific hex colors e.g. #0a0a0a, #e8e8e8, #c0392b", "why_it_works": "1 sentence specific to ${resolvedGenre} + ${vibeStr}"},
    {"style": "concept name", "background": "background description", "text_treatment": "text details", "color_palette": "3-4 hex colors", "why_it_works": "reason"},
    {"style": "concept name", "background": "background description", "text_treatment": "text details", "color_palette": "3-4 hex colors", "why_it_works": "reason"}
  ],
  "best_upload_time": {
    "day": "day of week",
    "time": "time with timezone e.g. 6pm EST",
    "reason": "1 sentence reason based on beat producer audience patterns"
  },
  "niche_tip": "One specific, actionable tip based on the niche data above — what is working right now in this exact niche"
}`;

  // Determine if we need to search for genre-specific thumbnail data
  const profileGenre = profile?.genre ?? "";
  const needsGenreSearch = !!profileGenre && resolvedGenre.toLowerCase() !== profileGenre.toLowerCase();

  // Run Claude generation + genre thumbnail search concurrently
  const [kitMsg, thumbnailNicheVideos] = await Promise.all([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system:
        "You are a YouTube SEO expert for beat producers. Output only valid JSON with no markdown or code blocks.",
      messages: [{ role: "user", content: prompt }],
    }),
    needsGenreSearch
      ? searchNicheVideos(resolvedGenre, artistsList).catch(() => nicheData)
      : Promise.resolve(nicheData),
  ]);

  const top5ForAnalysis = [...thumbnailNicheVideos]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      viewCount: v.viewCount,
      thumbnailUrl: v.thumbnailUrl,
    }));

  let generatedKit: Record<string, unknown>;
  try {
    const raw = kitMsg.content[0].type === "text" ? kitMsg.content[0].text.trim() : "";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    generatedKit = JSON.parse(clean);
  } catch (e) {
    console.error("[upload-kit/generate] Claude parse failed:", e);
    return NextResponse.json({ error: "Failed to generate kit" }, { status: 500 });
  }

  // Generate thumbnail analysis with genre + artists + vibes context
  const thumbnailAnalysis = await analyzeThumbnails(top5ForAnalysis, resolvedGenre, artistsList, vibes ?? []);

  // Score each title with the shared deterministic scorer
  const artistsForScoring = artistsList.length > 0
    ? artistsList
    : [profile?.top_artist_1, profile?.top_artist_2, profile?.top_artist_3].filter((a): a is string => !!a);
  if (Array.isArray(generatedKit.titles)) {
    const scored = (generatedKit.titles as Array<{ title: string; reason: string }>).map(t => ({
      ...t,
      ...scoreTitle(t.title, topKeywords, artistsForScoring),
    }));
    const maxScore = Math.max(...scored.map(t => t.score));
    let markedBest = false;
    generatedKit.titles = scored.map(t => {
      const isRec = !markedBest && t.score === maxScore;
      if (isRec) markedBest = true;
      return { ...t, recommended: isRec };
    });
  }

  const { data: saved, error: saveErr } = await supabase
    .from("upload_kits")
    .insert({
      producer_id: user.id,
      beat_name: beatNameStr || (generatedKit.beat_name_suggestion as string) || "Untitled",
      genre: resolvedGenre,
      input_data: {
        beat_name: beatNameStr,
        genre: resolvedGenre,
        vibes,
        artist_1,
        artist_2,
        artist_3,
        bpm,
        key,
        notes,
      },
      generated_kit: generatedKit,
    })
    .select()
    .single();

  if (saveErr) {
    console.error("[upload-kit/generate] save error:", saveErr.message);
    return NextResponse.json({
      ...generatedKit,
      niche_thumbnails: top5ForAnalysis,
      thumbnail_analysis: thumbnailAnalysis,
    });
  }

  return NextResponse.json({
    ...generatedKit,
    id: saved.id,
    created_at: saved.created_at,
    niche_thumbnails: top5ForAnalysis,
    thumbnail_analysis: thumbnailAnalysis,
  });
}
