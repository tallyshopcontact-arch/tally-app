import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateOutreachMessage } from "@/lib/outreach-messages";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
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
    .select(
      "id, channel_name, channel_url, subscriber_count, latest_video_title, genre, contact_method"
    )
    .eq("id", prospect_id)
    .single();

  if (fetchErr || !prospect) {
    console.error("[generate-message] prospect not found:", fetchErr?.message);
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  console.log(`[generate-message] generating for "${prospect.channel_name}"`);

  const messageType =
    (prospect.contact_method as string) === "email" ? "email" : "dm";

  const message = await generateOutreachMessage(
    {
      channel_name: prospect.channel_name as string,
      channel_url: prospect.channel_url as string,
      subscriber_count: prospect.subscriber_count as number,
      latest_video_title: prospect.latest_video_title as string | null,
      genre: prospect.genre as string | null,
      contact_method: prospect.contact_method as string,
    },
    messageType
  );

  const { error: updateErr } = await supabase
    .from("prospects")
    .update({ personalized_message: message, message_type: messageType })
    .eq("id", prospect_id);

  if (updateErr) {
    console.error("[generate-message] update failed:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log(
    `[generate-message] saved message (${message.length} chars) for "${prospect.channel_name}"`
  );
  return NextResponse.json({ message });
}
