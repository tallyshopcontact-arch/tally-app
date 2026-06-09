import { NextRequest, NextResponse } from "next/server";
import { findProducers, findProducersByArtist } from "@/lib/producer-finder";

export const dynamic = "force-dynamic";

// Add to vercel.json for daily cron:
// { "crons": [{ "path": "/api/admin/find-producers", "schedule": "0 9 * * *" }] }
// Set CRON_SECRET env var — Vercel sends Authorization: Bearer <CRON_SECRET>

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// Manual trigger from admin panel
export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    mode = "genre",
    genres = ["Trap", "Drill", "R&B"],
    artists = [],
    maxResults = 30,
  } = await req.json();

  console.log(`[find-producers] mode=${mode} maxResults=${maxResults}`);

  const prospects =
    mode === "artist"
      ? await findProducersByArtist(artists as string[], maxResults as number)
      : await findProducers(genres as string[], maxResults as number);

  console.log(`[find-producers] done — ${prospects.length} new prospects saved`);
  return NextResponse.json({ count: prospects.length });
}

// Vercel cron trigger — GET with Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const cronSecret = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET && !checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prospects = await findProducers(
    ["Trap", "Drill", "R&B", "Boom Bap", "Lo-Fi"],
    30
  );
  return NextResponse.json({ count: prospects.length });
}
