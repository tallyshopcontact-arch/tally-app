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
  const prospects = await findProducers(genres, maxResults);

  const supabase = getServiceClient();
  await Promise.all(
    prospects.map(async (p) => {
      try {
        const messageType = p.contact_method === "email" ? "email" : "dm";
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
        await supabase
          .from("prospects")
          .update({ personalized_message: message, message_type: messageType })
          .eq("id", p.id);
      } catch {
        // Non-fatal: prospect saved without message
      }
    })
  );

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
