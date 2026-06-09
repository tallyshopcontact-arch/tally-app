import { anthropic } from "@/lib/anthropic";

export interface ThumbnailPromptInput {
  beatName: string;
  genre: string;
  vibe: string[];
  artists: string[];
  producerStyle: {
    style: string;
    color: string;
    text_preference: string;
  } | null;
  nicheInsights: string;
}

export interface ThumbnailPromptResult {
  label: string;
  prompt: string;
  description: string;
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export async function generateThumbnailPrompts(
  input: ThumbnailPromptInput
): Promise<ThumbnailPromptResult[]> {
  const { beatName, genre, vibe, artists, producerStyle, nicheInsights } = input;

  const vibeStr = vibe.length ? vibe.join(", ") : "atmospheric";
  const artistStr = artists.filter(Boolean).join(", ") || "various artists";
  const styleDesc = producerStyle
    ? `Visual style preference: ${producerStyle.style}. Dominant color: ${producerStyle.color}. Text usage: ${producerStyle.text_preference}.`
    : "No specific style set — use genre-appropriate defaults.";

  const systemPrompt = `You are an expert AI image prompt engineer specializing in YouTube beat producer thumbnails.
You understand what makes thumbnails perform in the music production niche and how to craft DALL-E prompts that produce professional, cinematic results.
Output only valid JSON. No markdown, no code blocks.`;

  const userPrompt = `Generate 3 distinct DALL-E 3 image prompts for a YouTube beat producer thumbnail.

Beat details:
- Beat name: "${beatName}"
- Genre: ${genre}
- Vibe/mood: ${vibeStr}
- Sounds like: ${artistStr}

Producer's channel aesthetic:
${styleDesc}

What's currently working in this producer's niche (top thumbnail analysis):
${nicheInsights}

Rules for ALL prompts:
- NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS in the image — leave that for post-production
- Aspect ratio: 16:9 widescreen composition
- Dark, atmospheric, professional quality
- Cinematic lighting — dramatic and moody
- Music production aesthetic — could be abstract or representational
- Hyper-detailed, photorealistic or stylized — both work
- Designed to stop the scroll on YouTube

Generate exactly 3 prompts:
1. "Niche trending style" — closely follows what's performing best in this producer's niche right now based on the analysis
2. "Your channel style" — tailored to the producer's saved aesthetic preferences
3. "Creative variation" — a distinctive angle that could help this producer stand out from competitors

For each prompt, be extremely specific: describe exact lighting (rim light, spotlight, volumetric), specific visual elements, textures, color grading (teal-orange, moody dark, neon glow, etc.), composition (centered, rule of thirds, close-up), atmosphere (fog, smoke, particles, depth of field), and mood.

Respond with ONLY valid JSON. No markdown no code blocks.
{
  "prompts": [
    {
      "label": "Niche trending style",
      "prompt": "hyper-detailed DALL-E prompt, minimum 80 words",
      "description": "1-2 sentences on why this style is currently working in this niche"
    },
    {
      "label": "Your channel style",
      "prompt": "hyper-detailed DALL-E prompt, minimum 80 words",
      "description": "1-2 sentences on how this matches their channel aesthetic"
    },
    {
      "label": "Creative variation",
      "prompt": "hyper-detailed DALL-E prompt, minimum 80 words",
      "description": "1-2 sentences on how this variation could help them stand out"
    }
  ]
}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1800,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  const parsed = JSON.parse(stripJson(raw)) as { prompts: ThumbnailPromptResult[] };
  return parsed.prompts;
}
