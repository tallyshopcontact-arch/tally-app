import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendLaneCheckMagicLink } from "@/lib/email";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const WWW_BASE = "https://www.tallyagc.com";

export async function POST(req: NextRequest) {
  let body: { laneCheckId?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { laneCheckId, email } = body;
  if (!laneCheckId || !email) {
    return NextResponse.json({ error: "laneCheckId and email are required" }, { status: 400 });
  }

  const emailNorm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Free tier: 1 Lane Check per calendar month per email (mirrors the
  // authenticated-user monthly cap enforced in /run for anonymous users, who
  // aren't identifiable until they unlock).
  const month = new Date().toISOString().slice(0, 7);
  const rlKey = `lanecheck:email:${emailNorm}:${month}`;

  const { data: rl } = await supabase
    .from("diagnostic_rate_limits")
    .select("count")
    .eq("key", rlKey)
    .maybeSingle();

  if (rl && rl.count >= 1) {
    const { data: existingLead } = await supabase
      .from("lane_check_leads")
      .select("id, verify_token")
      .eq("email", emailNorm)
      .eq("lane_check_id", laneCheckId)
      .maybeSingle();

    if (existingLead) {
      const reportUrl = `${WWW_BASE}/lane-check/report?token=${existingLead.verify_token}`;
      const { ok, error: emailErr } = await sendLaneCheckMagicLink(emailNorm, reportUrl);
      if (!ok) {
        console.error("[lane-check/unlock] resend email error:", emailErr);
        return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, resent: true });
    }

    return NextResponse.json(
      { error: "You've already unlocked a Lane Check this month. Check your inbox or come back next month." },
      { status: 429 }
    );
  }

  const { data: laneCheck, error: checkErr } = await supabase
    .from("lane_checks")
    .select("id")
    .eq("id", laneCheckId)
    .single();
  if (checkErr || !laneCheck) {
    return NextResponse.json({ error: "Lane check not found" }, { status: 404 });
  }

  const verifyToken = randomBytes(32).toString("hex");

  const { error: leadErr } = await supabase.from("lane_check_leads").upsert(
    { email: emailNorm, lane_check_id: laneCheckId, verified: false, verify_token: verifyToken },
    { onConflict: "email,lane_check_id" }
  );
  if (leadErr) {
    console.error("[lane-check/unlock] lead upsert error:", leadErr.message);
    return NextResponse.json({ error: "Failed to register email" }, { status: 500 });
  }

  // So future "count lane_checks per email" queries can see this check.
  await supabase.from("lane_checks").update({ email: emailNorm }).eq("id", laneCheckId);

  await supabase
    .from("diagnostic_rate_limits")
    .upsert(
      { key: rlKey, count: (rl?.count ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  const reportUrl = `${WWW_BASE}/lane-check/report?token=${verifyToken}`;
  const { ok, error: emailErr } = await sendLaneCheckMagicLink(emailNorm, reportUrl);
  if (!ok) {
    console.error("[lane-check/unlock] email error:", emailErr);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }

  console.log(`[lane-check/unlock] lead saved for ${emailNorm}, laneCheck=${laneCheckId}`);
  return NextResponse.json({ ok: true });
}
