import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTrialEndingEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  // Find trialing users whose trial ends in exactly 2 days (within that calendar day)
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const startOfDay = new Date(twoDaysFromNow);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(twoDaysFromNow);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, email, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", startOfDay.toISOString())
    .lte("trial_ends_at", endOfDay.toISOString());

  if (error) {
    console.error("[cron/trial-ending] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const profile of profiles ?? []) {
    if (!profile.email) continue;
    await sendTrialEndingEmail(
      profile.name ?? "",
      profile.email,
      2,
      profile.trial_ends_at ?? undefined
    );
    sent++;
    console.log(`[cron/trial-ending] sent to ${profile.email}`);
  }

  console.log(`[cron/trial-ending] done — sent ${sent} emails`);
  return NextResponse.json({ sent });
}
