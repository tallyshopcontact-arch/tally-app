import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePdfBuffer, pdfFilename } from "@/lib/pdf-report";
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

  const { prospect_id } = await req.json();
  if (!prospect_id)
    return NextResponse.json({ error: "Missing prospect_id" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: prospect, error: fetchErr } = await supabase
    .from("prospects")
    .select("id, channel_name, genre, channel_snapshot")
    .eq("id", prospect_id)
    .single();

  if (fetchErr || !prospect)
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const snapshot = prospect.channel_snapshot as ChannelSnapshot | null;
  if (!snapshot)
    return NextResponse.json(
      { error: "Generate a channel snapshot first before generating the PDF report" },
      { status: 400 }
    );

  console.log(`[generate-report] generating PDF for "${prospect.channel_name}"`);

  try {
    const pdfBuffer = await generatePdfBuffer(
      prospect.channel_name as string,
      prospect.genre as string | null,
      snapshot
    );

    const base64 = pdfBuffer.toString("base64");
    const filename = pdfFilename(prospect.channel_name as string);

    console.log(`[generate-report] done — ${pdfBuffer.length} bytes for "${prospect.channel_name}"`);
    return NextResponse.json({ base64, filename });
  } catch (e) {
    console.error("[generate-report] error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
