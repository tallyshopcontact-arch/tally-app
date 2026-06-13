import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { extractKeywords } from "@/lib/keywords";
import { searchArtistFirstThumbnails } from "@/lib/youtube";
import { anthropic } from "@/lib/anthropic";
import { scoreTitle } from "@/lib/title-scorer";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import type { NicheVideo } from "@/lib/keywords";
import type { DeepChannelAnalysis } from "@/lib/channel-analysis";

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

    const beatContext = [...vibes, genre].filter(Boolean).join(", ");
    const artistContext =
      artists.length > 0 ? ` with a ${artists.slice(0, 2).join("/")} influence` : "";

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

async function generateStrongTitles(
  beatName: string,
  genre: string,
  artists: string[],
  keywords: string[]
): Promise<Array<{ title: string; reason: string }>> {
  const artistRef = artists.filter(Boolean).slice(0, 2).join(" x ") || genre;
  const shortKws = keywords.filter((k) => k && k.split(" ").length <= 3).slice(0, 4);
  const kwExamples = shortKws.length > 0 ? shortKws.join(", ") : `${genre} type beat`;
  const beatRef = beatName ? `"${beatName}"` : '"Beat"';

  const prompt = `Generate 3 YouTube titles for a ${genre} beat.

ALL titles MUST score 75+ using this exact system:
• Word count 9–12 = 25pts | 7–14 = 15pts | 5+ = 8pts
• Beat name in double quotes (${beatRef}) = 20pts
• Artist reference ("${artistRef}") = 20pts
• 1 niche keyword (one of: ${kwExamples}) = 15pts; 2+ keywords = 25pts
• Year 2026 present = 10pts

Minimum path to 75+: word count 9–12 + artist + beat name in quotes + year = 75pts.

Respond ONLY with valid JSON array — no markdown:
[{"title":"<title>","reason":"<why this scores 75+>"},{"title":"<title>","reason":"<reason>"},{"title":"<title>","reason":"<reason>"}]`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system:
        "You are a YouTube SEO expert for beat producers. Output only a valid JSON array with no markdown or code blocks.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (e) {
    console.error("[upload-kit/generate] generateStrongTitles failed:", e);
    return [];
  }
}

// Build context block from deep analysis for the main Claude prompt
function buildAnalysisBlock(analysis: DeepChannelAnalysis | null, producerArtists: string[]): string {
  if (!analysis) return "";

  const winnerArtists = analysis.winnersVsLosers.winnerPattern.artistMentions.slice(0, 2);
  const missingKws = analysis.missingKeywords.slice(0, 5).map((k) => k.keyword);
  const untappedArtists = analysis.artistAssociations
    .filter((a) => a.isTrending && a.videoCount === 0)
    .slice(0, 2)
    .map((a) => a.name);

  const allTrending = analysis.artistAssociations.filter((a) => a.isTrending).slice(0, 3).map((a) => a.name);
  const trendingNotUsed = allTrending.filter(
    (name) => !producerArtists.some((pa) => pa.toLowerCase() === name.toLowerCase())
  );

  // Extract winning video description structure as examples
  const winnerDescExamples = analysis.winnersVsLosers.winners
    .filter((v) => v.description && v.description.trim().length > 50)
    .slice(0, 2)
    .map((v, i) => {
      const desc = v.description.slice(0, 400).trimEnd();
      return `Winner ${i + 1} (${(v.views / 1000).toFixed(0)}K views) — "${v.title}"\n${desc}${v.description.length > 400 ? "..." : ""}`;
    });

  const descBlock = winnerDescExamples.length > 0
    ? `\n\nWINNING VIDEO DESCRIPTIONS — mirror this structure exactly (same sections, same ordering, same tone):\n${winnerDescExamples.join("\n\n---\n\n")}`
    : "";

  return `
PRODUCER'S CHANNEL ANALYSIS (use this to make the 3 titles different and data-driven):
- Winner pattern: Their top videos average ${analysis.winnersVsLosers.winnerPattern.avgViews.toLocaleString()} views, typically feature artists: ${winnerArtists.join(", ") || "not clear yet"}
- Key gap: ${analysis.winnersVsLosers.keyGap}
- Title formula used by their niche top performers: ${analysis.titleFormula.formula}
- Missing keywords (NOT in their last 30 videos but trending in niche): ${missingKws.join(", ") || "none identified"}
- Trending artists they're NOT making beats for: ${(untappedArtists.length > 0 ? untappedArtists : trendingNotUsed).join(", ") || "none identified"}
- Best upload day in their niche: ${analysis.timingIntelligence.bestDayInNiche}${descBlock}

TITLE STRATEGY (each title must use a DIFFERENT strategy):
Title 1 — WINNER PATTERN: mimic what their own best-performing videos do (artist: ${winnerArtists[0] || producerArtists[0] || "artist"}, winning title structure)
Title 2 — NICHE FORMULA: use the exact formula: ${analysis.titleFormula.formula}
Title 3 — UNTAPPED OPPORTUNITY: use a trending artist they're NOT currently targeting: ${(untappedArtists[0] || trendingNotUsed[0] || producerArtists[1] || "trending artist")}

REQUIRED TAGS: Include these missing niche keywords in the tags array: ${missingKws.join(", ")}`;
}

function buildAnalysisContext(
  analysis: DeepChannelAnalysis | null,
  finalTitles: Array<{ title: string; reason: string }>,
  missingKwsInTags: string[]
): Record<string, string> | null {
  if (!analysis) return null;

  const winnerArtist = analysis.winnersVsLosers.winnerPattern.artistMentions[0];
  const winnerAvg = analysis.winnersVsLosers.winnerPattern.avgViews;
  const loserAvg = analysis.winnersVsLosers.loserPattern.avgViews;
  const multiplier =
    loserAvg > 0 ? `${(winnerAvg / loserAvg).toFixed(1)}x` : "significantly more";

  return {
    title_1_reason: winnerArtist
      ? `Your "${winnerArtist}" type beats average ${winnerAvg.toLocaleString()} views — ${multiplier} more than your other uploads. This title mirrors that winning pattern.`
      : `This follows your channel's proven winner structure (avg ${winnerAvg.toLocaleString()} views).`,
    title_2_reason: `${analysis.titleFormula.formula} — the formula used by top videos in your niche. Your current title score vs this formula: ${analysis.titleFormula.producerScore}/100.`,
    title_3_reason:
      analysis.artistAssociations.filter((a) => a.isTrending && a.videoCount === 0).length > 0
        ? `This artist is trending in your niche but you haven't made beats for them yet — an untapped opportunity.`
        : `This targets an underexplored artist in your niche who appears in top-performing videos.`,
    keywords_reason:
      missingKwsInTags.length > 0
        ? `Added ${missingKwsInTags.slice(0, 3).join(", ")} — these keywords are used by top niche videos but missing from your last 30 uploads.`
        : "Tags include top niche keywords.",
    upload_time_reason: `${analysis.timingIntelligence.bestDayInNiche} is the strongest upload day in your niche — ${analysis.timingIntelligence.bestDayMultiplier}x average views vs other days.`,
    key_gap: analysis.winnersVsLosers.keyGap,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "/api/upload-kit/generate", 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached. Resets at midnight.", resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const body = await req.json();
  const raw = body as {
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

  const beat_name = raw.beat_name ? sanitizeInput(raw.beat_name, 100) : undefined;
  const genre = sanitizeInput(raw.genre ?? "hip hop", 60);
  const vibes = (raw.vibes ?? []).map((v) => sanitizeInput(v, 60));
  const artist_1 = raw.artist_1 ? sanitizeInput(raw.artist_1, 80) : undefined;
  const artist_2 = raw.artist_2 ? sanitizeInput(raw.artist_2, 80) : undefined;
  const artist_3 = raw.artist_3 ? sanitizeInput(raw.artist_3, 80) : undefined;
  const bpm = raw.bpm;
  const key = raw.key ? sanitizeInput(raw.key, 20) : undefined;
  const notes = raw.notes ? sanitizeInput(raw.notes, 400) : undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, genre, top_artist_1, top_artist_2, top_artist_3")
    .eq("id", user.id)
    .single();

  const now = new Date();

  // Load niche data and latest report's deep_analysis in parallel
  const [channelDataRes, latestReportRes] = await Promise.all([
    supabase
      .from("channel_data")
      .select("niche_data")
      .eq("producer_id", user.id)
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear())
      .single(),
    supabase
      .from("reports")
      .select("deep_analysis")
      .eq("producer_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const nicheData: NicheVideo[] = channelDataRes.data?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 12).map((k) => k.tag);
  const deepAnalysis: DeepChannelAnalysis | null =
    (latestReportRes.data?.deep_analysis as DeepChannelAnalysis | null) ?? null;

  const artistsList = [artist_1, artist_2, artist_3].filter((a): a is string => !!a?.trim());
  const profileArtists = [
    profile?.top_artist_1,
    profile?.top_artist_2,
    profile?.top_artist_3,
  ].filter((a): a is string => Boolean(a));
  const effectiveArtists =
    artistsList.length > 0 ? artistsList : profileArtists;
  const artistList = effectiveArtists.join(", ") || "various artists";

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

  // Build the deep analysis context block
  const analysisBlock = buildAnalysisBlock(deepAnalysis, effectiveArtists);

  // Determine description strategy: mirror winners when available, else generic format
  const winnerTags = deepAnalysis?.winnersVsLosers.winnerPattern.topTags.slice(0, 4) ?? [];
  const hasWinnerDescs =
    (deepAnalysis?.winnersVsLosers.winners ?? []).some((v) => v.description && v.description.trim().length > 50);

  const descInstruction = hasWinnerDescs
    ? `DESCRIPTION STRATEGY — mirror the EXACT structure of the winning video descriptions shown above in the channel analysis block. Use the same sections, same ordering, same tone. Adapt the content for this beat (name, artist, vibe) but preserve the structural pattern of their top performers.`
    : `DESCRIPTION FORMAT — generate the description in this EXACT format (use real newlines, copy the structure precisely):

[genre-matching emoji] [Beat Name] Type Beat "[Name]" [matching emoji]

Produced by ${producerName}${bpmKeyLine ? `\n${bpmKeyLine}` : ""}

🎵 For Licensing/Leasing: [licensing link]
📲 Free MP3: [free download link]
🛒 Beat Store: [beat store link]
📧 Contact: [contact email]

[2-3 sentences describing the vibe and feel naturally — sound like a real producer, not AI. Reference the artists and genre. Use 2-3 of the niche keywords naturally woven in.]

Perfect for: [comma-separated list of use cases matching this genre and mood]

${hashtagSuggestions || `#${resolvedGenre.replace(/\s+/g, "").toLowerCase()}typebeat #freetypebeat #typebeat2026`}

Tags: [comma-separated version of the tags array]`;

  const tagsStrategy = winnerTags.length > 0
    ? `TAGS STRATEGY — must include: (1) these proven winning tags from the producer's own top videos: ${winnerTags.join(", ")}; (2) these missing niche keywords: ${deepAnalysis!.missingKeywords.slice(0, 4).map((k) => k.keyword).join(", ")}; (3) artist and genre variants to fill remaining slots.`
    : `TAGS STRATEGY — use top niche keywords, artist name variants, and genre combinations.`;

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
${analysisBlock}

${tagsStrategy}

${descInstruction}

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
    {"title": "WINNER PATTERN — title following producer's own proven structure", "reason": "cite the data that informed this title strategy"},
    {"title": "NICHE FORMULA — title using the exact top-performer formula", "reason": "cite the formula and why it works"},
    {"title": "UNTAPPED OPPORTUNITY — title targeting a trending artist they don't make beats for", "reason": "cite the trending artist data"}
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

  // Run Claude + thumbnail search concurrently
  const [kitMsg, thumbnailNicheVideos] = await Promise.all([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system:
        "You are a YouTube SEO expert for beat producers. Output only valid JSON with no markdown or code blocks.",
      messages: [{ role: "user", content: prompt }],
    }),
    searchArtistFirstThumbnails(artistsList, resolvedGenre, vibes ?? []).catch(() => nicheData),
  ]);

  const top5ForAnalysis = thumbnailNicheVideos.slice(0, 5).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    viewCount: v.viewCount,
    thumbnailUrl: v.thumbnailUrl,
  }));

  let generatedKit: Record<string, unknown>;
  try {
    const rawText = kitMsg.content[0].type === "text" ? kitMsg.content[0].text.trim() : "";
    const clean = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    generatedKit = JSON.parse(clean);
  } catch (e) {
    console.error("[upload-kit/generate] Claude parse failed:", e);
    return NextResponse.json({ error: "Failed to generate kit" }, { status: 500 });
  }

  const thumbnailAnalysis = await analyzeThumbnails(
    top5ForAnalysis,
    resolvedGenre,
    artistsList,
    vibes ?? []
  );

  // Score titles; retry if none reach 75
  const artistsForScoring =
    artistsList.length > 0 ? artistsList : profileArtists;

  if (Array.isArray(generatedKit.titles)) {
    let scored = (
      generatedKit.titles as Array<{ title: string; reason: string }>
    ).map((t) => ({
      ...t,
      ...scoreTitle(t.title, topKeywords, artistsForScoring),
    }));

    let attempt = 1;
    while (attempt < 3 && !scored.some((t) => t.score >= 75)) {
      try {
        const retryTitles = await generateStrongTitles(
          beatNameStr || (generatedKit.beat_name_suggestion as string) || "Beat",
          resolvedGenre,
          artistsForScoring,
          topKeywords
        );
        if (retryTitles.length > 0) {
          const retryScored = retryTitles.map((t) => ({
            ...t,
            ...scoreTitle(t.title, topKeywords, artistsForScoring),
          }));
          const currentMax = Math.max(...scored.map((t) => t.score));
          const retryMax = Math.max(...retryScored.map((t) => t.score));
          if (retryMax > currentMax) scored = retryScored;
        }
      } catch (e) {
        console.error(`[upload-kit/generate] Title retry ${attempt} failed:`, e);
      }
      attempt++;
    }

    const maxScore = Math.max(...scored.map((t) => t.score));
    let markedBest = false;
    generatedKit.titles = scored.map((t) => {
      const isRec = !markedBest && t.score === maxScore;
      if (isRec) markedBest = true;
      return { ...t, recommended: isRec };
    });
  }

  // Build analysis_context (why these recommendations)
  const finalTitles = Array.isArray(generatedKit.titles)
    ? (generatedKit.titles as Array<{ title: string; reason: string }>)
    : [];
  const tagsArray = Array.isArray(generatedKit.tags)
    ? (generatedKit.tags as string[])
    : [];
  const missingKwsInTags = deepAnalysis
    ? deepAnalysis.missingKeywords
        .map((k) => k.keyword)
        .filter((kw) => tagsArray.some((t) => t.toLowerCase().includes(kw.toLowerCase())))
    : [];

  const analysisContext = buildAnalysisContext(deepAnalysis, finalTitles, missingKwsInTags);

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
    return NextResponse.json({
      ...generatedKit,
      niche_thumbnails: top5ForAnalysis,
      thumbnail_analysis: thumbnailAnalysis,
      analysis_context: analysisContext,
    });
  }

  return NextResponse.json({
    ...generatedKit,
    id: saved.id,
    created_at: saved.created_at,
    niche_thumbnails: top5ForAnalysis,
    thumbnail_analysis: thumbnailAnalysis,
    analysis_context: analysisContext,
  });
}
