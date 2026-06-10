import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateChannelSnapshot } from "@/lib/channel-snapshot";

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

  const { prospect_id } = await req.json();
  if (!prospect_id)
    return NextResponse.json({ error: "Missing prospect_id" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: prospect, error: fetchErr } = await supabase
    .from("prospects")
    .select("id, channel_id, channel_name, genre")
    .eq("id", prospect_id)
    .single();

  if (fetchErr || !prospect)
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  console.log(`[generate-snapshot] starting for "${prospect.channel_name}"`);

  try {
    const snapshot = await generateChannelSnapshot(
      prospect.channel_id as string,
      prospect.channel_name as string,
      prospect.genre as string | null
    );

    const { error: saveErr } = await supabase
      .from("prospects")
      .update({ channel_snapshot: snapshot })
      .eq("id", prospect_id);

    if (saveErr) {
      console.error("[generate-snapshot] save failed:", saveErr.message);
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    console.log(`[generate-snapshot] saved for "${prospect.channel_name}"`);
    return NextResponse.json({ snapshot });
  } catch (e) {
    console.error("[generate-snapshot] error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
