import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateOutreachSequence } from "@/lib/outreach-sequence";
import type { ChannelSnapshot } from "@/lib/channel-snapshot";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prospect_id, format } = await req.json();
  if (!prospect_id)
    return NextResponse.json({ error: "Missing prospect_id" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: prospect, error: fetchErr } = await supabase
    .from("prospects")
    .select("id, channel_name, genre, email, instagram_handle, contact_preference, channel_snapshot")
    .eq("id", prospect_id)
    .single();

  if (fetchErr || !prospect)
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const snapshot = prospect.channel_snapshot as ChannelSnapshot | null;
  if (!snapshot)
    return NextResponse.json(
      { error: "Generate a channel snapshot first before generating the sequence" },
      { status: 400 }
    );

  // Resolve format: explicit param > contact_preference > auto-detect
  const resolvedFormat: "instagram" | "email" =
    format === "email" || format === "instagram"
      ? format
      : (prospect.contact_preference as "instagram" | "email" | null) ??
        ((prospect.email as string | null) ? "email" : "instagram");

  console.log(`[generate-sequence] format=${resolvedFormat} for "${prospect.channel_name}"`);

  try {
    const sequence = await generateOutreachSequence(
      prospect.channel_name as string,
      prospect.genre as string | null,
      snapshot,
      resolvedFormat
    );

    const { error: saveErr } = await supabase
      .from("prospects")
      .update({ outreach_sequence: sequence })
      .eq("id", prospect_id);

    if (saveErr) {
      console.error("[generate-sequence] save failed:", saveErr.message);
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    console.log(`[generate-sequence] saved for "${prospect.channel_name}"`);
    return NextResponse.json({ sequence });
  } catch (e) {
    console.error("[generate-sequence] error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
