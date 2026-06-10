import { anthropic } from "./anthropic";
import type { ChannelSnapshot } from "./channel-snapshot";

export interface OutreachMessage {
  label: string;
  subject: string | null;
  body: string;
  sent: boolean;
  sent_at: string | null;
}

export interface OutreachSequence {
  format: "instagram" | "email";
  messages: OutreachMessage[];
  generated_at: string;
}

async function generateMsg2(
  channelName: string,
  genre: string | null,
  snapshot: ChannelSnapshot,
  format: "instagram" | "email"
): Promise<string> {
  const { top_insight, positioning_gap, raw_data } = snapshot;

  const context = [
    `Channel: ${channelName}`,
    `Genre: ${genre ?? "type beats"}`,
    `Top insight: ${top_insight}`,
    `Positioning gap: ${positioning_gap}`,
    `Avg views: ${raw_data.avgViews.toLocaleString()}`,
    `Subscribers: ${raw_data.subscribers.toLocaleString()}`,
  ].join("\n");

  const prompt =
    format === "instagram"
      ? `Write a short Instagram DM message (Message 2 in a sequence). The producer replied "yes" to your first message saying you noticed something about their upload patterns.

Context about their channel:
${context}

Write 2-3 casual sentences that:
- Reference their specific data (use the top_insight with actual numbers)
- Sound like producer-to-producer, not a sales pitch
- End exactly with: "I can send the full breakdown if you want."
- No hashtags, no emojis

Return only the message body.`
      : `Write a cold email body (Message 2 in a sequence). The producer replied to your first email. You're now sharing the mini insight.

Context about their channel:
${context}

Write 2-3 sentences that:
- Reference their specific data (use the top_insight with actual numbers)
- Sound like producer-to-producer, professional but direct
- End exactly with: "I put together a quick breakdown of the full picture — want me to send it over?"

Return only the email body (no subject, no greeting, no sign-off).`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content[0].type === "text" ? res.content[0].text.trim() : top_insight;
  } catch (err) {
    console.error("[sequence] msg2 generation failed:", err);
    return top_insight;
  }
}

export async function generateOutreachSequence(
  channelName: string,
  genre: string | null,
  snapshot: ChannelSnapshot,
  format: "instagram" | "email",
  offerType: "founding" | "standard" = "founding"
): Promise<OutreachSequence> {
  console.log(`[sequence] generating ${format} sequence for "${channelName}" offerType=${offerType}`);

  const { top_insight, raw_data } = snapshot;
  const genreLine = genre ?? "type beat";

  const msg2Body = await generateMsg2(channelName, genre, snapshot, format);

  const msg4BodyFounding =
    `I'll give you founding member access — 14 days completely free, no credit card needed, and your rate is locked at $19.99/month for life even if we raise prices later. Only available to the first 20 producers. Sign up at tallyagc.com and use code FOUNDING20 at checkout.`;
  const msg4BodyStandard =
    `I'll give you full free access for 7 days — sign up at tallyagc.com and try it before your next upload. No commitment.`;
  const msg4Body = offerType === "founding" ? msg4BodyFounding : msg4BodyStandard;

  const messages: OutreachMessage[] =
    format === "instagram"
      ? [
          {
            label: "Message 1 — Curiosity hook",
            subject: null,
            body: `Hey ${channelName} — I was checking out your channel and noticed something about your upload patterns that might explain the view gap. Want me to send it over?`,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 2 — Mini insight",
            subject: null,
            body: msg2Body,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 3 — Product intro",
            subject: null,
            body: `This is actually what my platform automates before every upload — it catches these patterns and gives you optimized titles, tags and niche data specific to your style. It's called TALLY.`,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 4 — Trial close",
            subject: null,
            body: msg4Body,
            sent: false,
            sent_at: null,
          },
        ]
      : [
          {
            label: "Message 1 — Intro",
            subject: `Quick observation about ${channelName}`,
            body: `Hey — I was analyzing YouTube channels in the ${genreLine} space and noticed something interesting about your upload patterns that might be limiting your views. Mind if I share what I found? Takes 2 minutes to read.\n\nFellow producer`,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 2 — Mini insight",
            subject: `Re: Quick observation about ${channelName}`,
            body: `${msg2Body}\n\nFellow producer`,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 3 — PDF delivery",
            subject: `${channelName} — Channel Analysis`,
            body: `Here's the breakdown I mentioned.\n\n${top_insight}\n\nThe full report is attached. Let me know what you think.\n\nFellow producer`,
            sent: false,
            sent_at: null,
          },
          {
            label: "Message 4 — Product intro",
            subject: `How to fix this automatically`,
            body: `The patterns in your report are exactly what my platform catches before every upload. It gives you optimized titles, tags, and monthly niche data so every beat is positioned for discovery.\n\n${msg4Body}\n\nFellow producer`,
            sent: false,
            sent_at: null,
          },
        ];

  console.log(`[sequence] generated ${messages.length} messages for "${channelName}" avg views: ${raw_data.avgViews}`);

  return {
    format,
    messages,
    generated_at: new Date().toISOString(),
  };
}
