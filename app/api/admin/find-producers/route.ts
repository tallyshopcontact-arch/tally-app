import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findProducers } from "@/lib/producer-finder";
import { generateOutreachMessage } from "@/lib/outreach-messages";

export const dynamic = "force-dynamic";

// Add to vercel.json for daily cron:
// { "crons": [{ "path": "/api/admin/find-producers", "schedule": "0 9 * * *" }] }
// Set CRON_SECRET env var, then vercel sends Authorization: Bearer <CRON_SECRET>

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

async function runFinder(genres: string[], maxResults: number) {
  console.log(`[find-producers] starting — genres=${genres.join(",")} maxResults=${maxResults}`);
  console.log(`[find-producers] ANTHROPIC_API_KEY set: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`[find-producers] SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);

  const prospects = await findProducers(genres, maxResults);
  console.log(`[find-producers] findProducers returned ${prospects.length} new prospects`);

  if (prospects.length === 0) {
    console.log("[find-producers] no new prospects — skipping message generation");
    return 0;
  }

  const supabase = getServiceClient();

  // Sequential processing to avoid Anthropic rate limits
  let messagesGenerated = 0;
  for (const p of prospects) {
    console.log(`[find-producers] generating message for "${p.channel_name}" (id=${p.id}, contact_method=${p.contact_method})`);
    try {
      const messageType = p.contact_method === "email" ? "email" : "dm";
      console.log(`[find-producers] calling generateOutreachMessage type=${messageType}`);

      const message = await generateOutreachMessage(
        {
          channel_name: p.channel_name,
          channel_url: p.channel_url,
          subscriber_count: p.subscriber_count,
          latest_video_title: p.latest_video_title,
          genre: p.genre,
          contact_method: p.contact_method,
        },
        messageType
      );

      console.log(`[find-producers] message generated (${message.length} chars) for "${p.channel_name}"`);

      const { error: updateErr } = await supabase
        .from("prospects")
        .update({ personalized_message: message, message_type: messageType })
        .eq("id", p.id);

      if (updateErr) {
        console.error(`[find-producers] supabase update failed for id=${p.id}:`, updateErr.message);
      } else {
        messagesGenerated++;
        console.log(`[find-producers] saved message for "${p.channel_name}" (${messagesGenerated}/${prospects.length})`);
      }
    } catch (err) {
      console.error(`[find-producers] message generation failed for "${p.channel_name}":`, err);
      if (err instanceof Error) {
        console.error(`[find-producers] error name: ${err.name}, message: ${err.message}`);
        if ("status" in err) console.error(`[find-producers] HTTP status: ${(err as { status: number }).status}`);
      }
    }
  }

  console.log(`[find-producers] done — ${prospects.length} prospects found, ${messagesGenerated} messages generated`);
  return prospects.length;
}

// Manual trigger from admin panel
export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { genres = ["Trap", "Drill", "R&B"], maxResults = 30 } =
    await req.json();

  const count = await runFinder(genres as string[], maxResults as number);
  return NextResponse.json({ count });
}

// Vercel cron trigger (GET with Authorization: Bearer CRON_SECRET)
export async function GET(req: NextRequest) {
  const cronSecret = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET && !checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await runFinder(
    ["Trap", "Drill", "R&B", "Boom Bap", "Lo-Fi"],
    30
  );
  return NextResponse.json({ count });
}
