import { anthropic } from "./anthropic";

export interface ProspectForMessage {
  channel_name: string;
  channel_url: string;
  subscriber_count: number;
  latest_video_title: string | null;
  genre: string | null;
  contact_method: string;
}

function fallbackMessage(channelName: string): string {
  return `Hey ${channelName} — I'm a fellow producer and I built a tool called TALLY that helps beat producers package their YouTube uploads for maximum discovery. Optimized titles, tags, and monthly niche data. I'd like to give you free access for 30 days — would you be open to trying it? tallyagc.com`;
}

async function callClaude(prompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 350,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

export async function generateOutreachMessage(
  prospect: ProspectForMessage,
  messageType: "dm" | "email"
): Promise<string> {
  console.log(
    `[outreach] generating ${messageType} for "${prospect.channel_name}" — ANTHROPIC_API_KEY set: ${!!process.env.ANTHROPIC_API_KEY}`
  );

  const context = [
    `Channel: ${prospect.channel_name}`,
    `Subscribers: ${prospect.subscriber_count.toLocaleString()}`,
    `Genre: ${prospect.genre ?? "type beats"}`,
    prospect.latest_video_title
      ? `Latest video: "${prospect.latest_video_title}"`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt =
    messageType === "dm"
      ? `You're writing a YouTube DM from TALLY (tallyagc.com) to a music producer who makes beats.

TALLY helps beat producers grow on YouTube — optimized upload kits, title scoring, competitor tracking, and monthly channel reports.

Write a short genuine DM:
- Personal opener referencing their channel or latest video
- 1-2 sentences on what TALLY does (not salesy)
- Soft CTA: try it free at tallyagc.com
- Under 100 words
- No hashtags, no excessive emojis
- Sounds like a real person

Producer info:
${context}

Return only the message body.`
      : `You're writing a cold email from TALLY (tallyagc.com) to a music producer who makes beats.

TALLY helps beat producers grow on YouTube — optimized upload kits, title scoring, competitor tracking, and monthly channel reports.

Write a short cold email:
- Subject line on first line prefixed "Subject: "
- Blank line, then email body
- Personal opener referencing their channel
- 1-2 sentences on what TALLY does
- CTA to try it free at tallyagc.com
- Under 150 words total

Producer info:
${context}

Return only the subject line and body.`;

  // Attempt 1
  try {
    console.log(`[outreach] attempt 1 for "${prospect.channel_name}"`);
    const result = await callClaude(prompt);
    console.log(
      `[outreach] attempt 1 succeeded for "${prospect.channel_name}" (${result.length} chars)`
    );
    return result;
  } catch (err) {
    console.error(`[outreach] attempt 1 failed for "${prospect.channel_name}":`, err);
    if (err instanceof Error) {
      console.error(`[outreach] name=${err.name} message=${err.message}`);
      if ("status" in err)
        console.error(`[outreach] HTTP status: ${(err as { status: number }).status}`);
    }
  }

  // Attempt 2 after 2 second delay
  console.log(`[outreach] waiting 2s before retry for "${prospect.channel_name}"`);
  await new Promise((r) => setTimeout(r, 2000));

  try {
    console.log(`[outreach] attempt 2 for "${prospect.channel_name}"`);
    const result = await callClaude(prompt);
    console.log(
      `[outreach] attempt 2 succeeded for "${prospect.channel_name}" (${result.length} chars)`
    );
    return result;
  } catch (err) {
    console.error(`[outreach] attempt 2 failed for "${prospect.channel_name}":`, err);
    if (err instanceof Error) {
      console.error(`[outreach] name=${err.name} message=${err.message}`);
    }
  }

  // Both attempts failed — use template so prospect always has a message
  console.log(
    `[outreach] both attempts failed for "${prospect.channel_name}" — using fallback template`
  );
  return fallbackMessage(prospect.channel_name);
}
