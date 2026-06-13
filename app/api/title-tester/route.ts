import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";
import { extractKeywords } from "@/lib/keywords";
import { scoreTitle } from "@/lib/title-scorer";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import type { NicheVideo } from "@/lib/keywords";
import type { DeepChannelAnalysis } from "@/lib/channel-analysis";

interface ClaudeAnalysis {
  verdict: string;
  improvements: [string, string, string];
  rewrites: [string, string];
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function buildNicheContext(analysis: DeepChannelAnalysis | null): string {
  if (!analysis) return "";

  const topWinnerKws = analysis.winnersVsLosers.winnerPattern.topTags.slice(0, 5);
  const missingKws = analysis.missingKeywords.slice(0, 4).map((k) => k.keyword);
  const winnerArtists = analysis.winnersVsLosers.winnerPattern.artistMentions.slice(0, 2);

  return `
CHANNEL ANALYSIS CONTEXT (use this to make rewrites genuinely data-driven):
- Title formula used by top performers in this producer's niche: ${analysis.titleFormula.formula}
- Producer's current formula match score: ${analysis.titleFormula.producerScore}/100
- Keywords in their WINNING videos (avg ${analysis.winnersVsLosers.winnerPattern.avgViews.toLocaleString()} views): ${topWinnerKws.join(", ") || "not analyzed"}
- Keywords in their LOSING videos (avg ${analysis.winnersVsLosers.loserPattern.avgViews.toLocaleString()} views): ${analysis.winnersVsLosers.loserPattern.topTags.slice(0, 3).join(", ") || "not analyzed"}
- Keywords missing from last 30 uploads but trending in niche: ${missingKws.join(", ") || "none"}
- Artists that appear in their top performers: ${winnerArtists.join(", ") || "not identified"}
- Key gap vs niche top performers: ${analysis.winnersVsLosers.keyGap}

When writing rewrites: Rewrite 1 should follow the winner formula. Rewrite 2 should address the key gap.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(user.id, "/api/title-tester", 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached. Resets at midnight.", resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const body = await req.json() as { title: string; genre?: string };
  const title = sanitizeInput(body.title ?? "", 200);
  const genreOverride = body.genre ? sanitizeInput(body.genre, 60) : undefined;
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const [profileRes, channelRes, reportRes] = await Promise.all([
    supabase.from("profiles").select("genre, top_artist_1, top_artist_2, top_artist_3").eq("id", user.id).single(),
    supabase.from("channel_data").select("niche_data").eq("producer_id", user.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(1).single(),
    supabase.from("reports").select("deep_analysis").eq("producer_id", user.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(1).single(),
  ]);

  const genre = genreOverride || profileRes.data?.genre || "hip hop";
  const artists = [profileRes.data?.top_artist_1, profileRes.data?.top_artist_2, profileRes.data?.top_artist_3].filter((a): a is string => !!a);
  const nicheData: NicheVideo[] = channelRes.data?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 10).map((k) => k.tag);
  const deepAnalysis: DeepChannelAnalysis | null = (reportRes.data?.deep_analysis as DeepChannelAnalysis | null) ?? null;

  // Deterministic score
  const { score, breakdown, tip } = scoreTitle(title, topKeywords, artists);

  const artistsStr = artists.join(", ") || "various artists";
  const keywordsStr = topKeywords.join(", ") || `${genre} type beat, free type beat`;
  const nicheContext = buildNicheContext(deepAnalysis);

  const prompt = `You are a YouTube SEO expert for beat producers. Analyze this title and give actionable feedback.

Title: "${title}"
Genre: ${genre}
Target artists: ${artistsStr}
Hot niche keywords: ${keywordsStr}
Deterministic score: ${score}/100

Score breakdown:
- Keyword Strength: ${breakdown.keyword_strength}/25 (has ${breakdown.keyword_strength > 0 ? "matching" : "no matching"} niche keywords)
- Title Length: ${breakdown.title_length}/25 (${title.trim().split(/\s+/).filter(Boolean).length} words — ideal is 9-12)
- Artist Pairing: ${breakdown.artist_pairing}/20 (${breakdown.artist_pairing > 0 ? "artist found" : "no artist reference"})
- Beat Name in Quotes: ${breakdown.beat_name}/20 (${breakdown.beat_name > 0 ? "has quoted beat name" : "no quoted beat name"})
- Year Present: ${breakdown.year_present}/10 (${breakdown.year_present > 0 ? "year found" : "no year"})
${nicheContext}

Write a 1-sentence verdict explaining this score.
Write 3 specific improvement bullets — reference the actual title words.
Write 2 rewritten versions that would score 85+. ${deepAnalysis ? "Make Rewrite 1 follow the winner formula from the channel analysis. Make Rewrite 2 address the key gap." : ""}

Respond with ONLY valid JSON. No markdown no code blocks.
{"verdict":"one sentence","improvements":["bullet 1","bullet 2","bullet 3"],"rewrites":["rewrite 1","rewrite 2"]}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: "You are a YouTube SEO expert for beat producers. Output only valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  let analysis: ClaudeAnalysis;
  try {
    analysis = JSON.parse(stripJson(raw)) as ClaudeAnalysis;
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // Build niche_context explaining what informed the rewrites
  const nicheContextResult = deepAnalysis
    ? {
        formula: deepAnalysis.titleFormula.formula,
        producer_score: deepAnalysis.titleFormula.producerScore,
        winner_avg_views: deepAnalysis.winnersVsLosers.winnerPattern.avgViews,
        key_gap: deepAnalysis.winnersVsLosers.keyGap,
        missing_keywords: deepAnalysis.missingKeywords.slice(0, 3).map((k) => k.keyword),
        rewrite_1_strategy: "Follows your niche's proven winner formula",
        rewrite_2_strategy: "Addresses the key gap between your channel and top performers",
      }
    : null;

  const result = {
    score,
    verdict: analysis.verdict,
    categories: breakdown,
    improvements: analysis.improvements,
    rewrites: analysis.rewrites,
    tip,
    original_title: title,
    niche_context: nicheContextResult,
  };

  await supabase.from("title_tests").insert({
    producer_id: user.id,
    original_title: title,
    score,
    result,
  });

  return NextResponse.json(result);
}
