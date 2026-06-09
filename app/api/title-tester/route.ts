import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";
import { extractKeywords } from "@/lib/keywords";
import { scoreTitle } from "@/lib/title-scorer";
import type { NicheVideo } from "@/lib/keywords";

interface ClaudeAnalysis {
  verdict: string;
  improvements: [string, string, string];
  rewrites: [string, string];
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, genre: genreOverride } = await req.json() as { title: string; genre?: string };
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const [profileRes, channelRes] = await Promise.all([
    supabase.from("profiles").select("genre, top_artist_1, top_artist_2, top_artist_3").eq("id", user.id).single(),
    supabase.from("channel_data").select("niche_data").eq("producer_id", user.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(1).single(),
  ]);

  const genre = genreOverride?.trim() || profileRes.data?.genre || "hip hop";
  const artists = [profileRes.data?.top_artist_1, profileRes.data?.top_artist_2, profileRes.data?.top_artist_3].filter((a): a is string => !!a);
  const nicheData: NicheVideo[] = channelRes.data?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 10).map((k) => k.tag);

  // Deterministic score
  const { score, breakdown, tip } = scoreTitle(title.trim(), topKeywords, artists);

  // Claude for verdict, improvements, rewrites only
  const artistsStr = artists.join(", ") || "various artists";
  const keywordsStr = topKeywords.join(", ") || `${genre} type beat, free type beat`;

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

Write a 1-sentence verdict explaining this score.
Write 3 specific improvement bullets — reference the actual title words.
Write 2 rewritten versions that would score 85+.

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

  const result = {
    score,
    verdict: analysis.verdict,
    categories: breakdown,
    improvements: analysis.improvements,
    rewrites: analysis.rewrites,
    tip,
    original_title: title.trim(),
  };

  await supabase.from("title_tests").insert({
    producer_id: user.id,
    original_title: title.trim(),
    score,
    result,
  });

  return NextResponse.json(result);
}
