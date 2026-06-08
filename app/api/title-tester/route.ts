import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";
import { extractKeywords } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";

interface TitleTestResult {
  score: number;
  verdict: string;
  categories: {
    keyword_strength: number;
    title_length: number;
    artist_pairing: number;
    beat_name: number;
    year_relevance: number;
  };
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
  const artists = [profileRes.data?.top_artist_1, profileRes.data?.top_artist_2, profileRes.data?.top_artist_3].filter(Boolean).join(", ") || "various artists";
  const nicheData: NicheVideo[] = channelRes.data?.niche_data ?? [];
  const topKeywords = extractKeywords(nicheData).slice(0, 10).map((k) => k.tag).join(", ") || `${genre} type beat, free type beat`;

  const prompt = `You are a YouTube SEO expert for beat producers. Score this YouTube beat video title and give actionable feedback.

Title to analyze: "${title}"
Producer's genre: ${genre}
Producer's target artists: ${artists}
Hot keywords in their niche right now: ${topKeywords}

Score each category from 0–20 (total out of 100):
- keyword_strength: Does the title include keywords that are ranking in this niche? Are they natural?
- title_length: Is it the ideal 60–80 characters? Penalize under 40 or over 100.
- artist_pairing: Is there a clear artist name or "type beat" pairing that matches the genre?
- beat_name: Does the title include a unique beat name in quotes? This increases click-through.
- year_relevance: Does it include the current year (2026) or timely language?

Then write 3 specific improvement bullets — actionable, concrete, refer to the actual title words.
Then write 2 rewritten versions that score 85+.

Respond with ONLY valid JSON. No markdown no code blocks.
{"score":number,"verdict":"one sentence on why this score","categories":{"keyword_strength":number,"title_length":number,"artist_pairing":number,"beat_name":number,"year_relevance":number},"improvements":["bullet 1","bullet 2","bullet 3"],"rewrites":["rewrite 1","rewrite 2"]}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: "You are a YouTube SEO expert for beat producers. Output only valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  let result: TitleTestResult;
  try {
    result = JSON.parse(stripJson(raw)) as TitleTestResult;
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  await supabase.from("title_tests").insert({
    producer_id: user.id,
    original_title: title.trim(),
    score: result.score,
    result,
  });

  return NextResponse.json({ ...result, original_title: title.trim() });
}
