import { anthropic } from "./anthropic";

export interface ProspectForMessage {
  channel_name: string;
  channel_url: string;
  subscriber_count: number;
  latest_video_title: string | null;
  genre: string | null;
  contact_method: string;
}

export async function generateOutreachMessage(
  prospect: ProspectForMessage,
  messageType: "dm" | "email"
): Promise<string> {
  console.log(`[outreach] generateOutreachMessage called for "${prospect.channel_name}" type=${messageType}`);
  console.log(`[outreach] ANTHROPIC_API_KEY available: ${!!process.env.ANTHROPIC_API_KEY}`);

  const context = [
    `Channel: ${prospect.channel_name}`,
    `Subscribers: ${prospect.subscriber_count.toLocaleString()}`,
    `Genre: ${prospect.genre ?? "type beats"}`,
    prospect.latest_video_title ? `Latest video: "${prospect.latest_video_title}"` : null,
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

  console.log(`[outreach] calling anthropic.messages.create for "${prospect.channel_name}"`);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 350,
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`[outreach] anthropic response received, stop_reason=${msg.stop_reason}, content blocks=${msg.content.length}`);

  const block = msg.content[0];
  const result = block.type === "text" ? block.text.trim() : "";
  console.log(`[outreach] message extracted (${result.length} chars)`);
  return result;
}
