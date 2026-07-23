// DM Composer (Brief 3) — generates 2 personalized DM variations from a
// saved outreach_prospects row + 1-2 selected lane insight sentences. Same
// shared TALLY_LLM_ENABLED kill-switch used elsewhere (see
// app/api/diagnostic/run/route.ts) gates the real Claude call; off (or on
// failure) falls back to a template built from the same real data, so a
// producer always gets a usable DM.
import { anthropic } from "./anthropic";

export interface DMInput {
  channelName: string;
  recentVideoTitle: string | null;
  artistName: string;
  /** 1-2 insight sentences the producer picked to include — never invented,
   * always the exact fact as computed by lib/lanes/insights.ts. */
  selectedInsights: string[];
}

export interface DMResult {
  variations: string[]; // exactly 2
  usedLLM: boolean;
}

function videoRef(recentVideoTitle: string | null): string {
  return recentVideoTitle ? `saw your "${recentVideoTitle}"` : "been checking out your channel";
}

function insightLine(selectedInsights: string[]): string {
  return selectedInsights.join(" Also — ");
}

/** Deterministic, no-LLM fallback — used when TALLY_LLM_ENABLED isn't "true"
 * or the Claude call fails, so a producer always has something to send. */
function templateVariations(input: DMInput): string[] {
  const insight = insightLine(input.selectedInsights);
  const a = `Hey — ${videoRef(input.recentVideoTitle)}. Thought you'd want to know: ${insight}. I built a tool called TALLY that tracks type-beat lanes like this — ran the ${input.artistName} lane through it, happy to send the full breakdown if you want it. No pitch, just data.`;
  const b = `Yo, fellow producer here — I make boom bap out of Montreal and built a tool (TALLY) that pulls real data on type-beat lanes. Been looking at ${input.artistName}: ${insight}. Figured that's worth knowing since you're already in that lane. Lmk if you want the full breakdown.`;
  return [a, b];
}

/** Strips a ```json / ``` fence if Claude wraps the array despite
 * instructions not to, so JSON.parse doesn't fail on stray markdown. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function callClaude(input: DMInput): Promise<string[]> {
  const prompt = `You are a boom bap producer based in Montreal. You built a tool called TALLY that pulls real YouTube data on type-beat "lanes" — demand, competition, what's actually winning right now. You're messaging a fellow producer peer-to-peer, not pitching a product.

Write 2 short DM variations (genuinely different opening/tone from each other, not just reworded) to send this producer on Instagram or YouTube. Each one must:
- Open by referencing something real and specific about them — their channel or their most recent video title — so it reads like you actually looked at their page, not a copy-paste blast
- Share exactly one fact from the insight(s) below like you're passing along intel you found, not pitching a product (e.g. "thought you'd want to know...") — never invent or alter the numbers
- End with a soft, low-pressure nudge — mention you ran their lane through TALLY if they want the full breakdown. No hard CTA, no links, no "sign up now"
- Stay under 150 words total
- Sound like a real producer texting another producer — no corporate voice, no exclamation-point marketing energy, no hashtags, no emojis

Producer: ${input.channelName}
Their recent video: ${input.recentVideoTitle ? `"${input.recentVideoTitle}"` : "(none available)"}
Lane: ${input.artistName} type beat

Insight(s) to reference:
${input.selectedInsights.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Return ONLY a JSON array of exactly 2 strings, each one a full DM. No markdown, no code fences, no explanation — just the raw JSON array.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  const text = block.type === "text" ? block.text : "";
  const parsed: unknown = JSON.parse(stripCodeFence(text));
  if (!Array.isArray(parsed) || parsed.length !== 2 || !parsed.every((s) => typeof s === "string")) {
    throw new Error("Unexpected DM generation response shape");
  }
  return parsed as string[];
}

export async function generateDMVariations(input: DMInput): Promise<DMResult> {
  if (process.env.TALLY_LLM_ENABLED !== "true") {
    return { variations: templateVariations(input), usedLLM: false };
  }
  try {
    const variations = await callClaude(input);
    return { variations, usedLLM: true };
  } catch (e) {
    console.error(`[prospect-dm] generation failed for "${input.channelName}", using fallback:`, e);
    return { variations: templateVariations(input), usedLLM: false };
  }
}
