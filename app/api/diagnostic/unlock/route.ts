import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendDiagnosticMagicLink } from "@/lib/email";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const WWW_BASE = "https://www.tallyagc.com";

export async function POST(req: NextRequest) {
  let body: { diagnosticId?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { diagnosticId, email } = body;

  if (!diagnosticId || !email) {
    return NextResponse.json(
      { error: "diagnosticId and email are required" },
      { status: 400 }
    );
  }

  const emailNorm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Rate limit: 1 new channel unlock per email per calendar month
  const month = new Date().toISOString().slice(0, 7); // yyyy-mm
  const rlKey = `email:${emailNorm}:${month}`;

  const { data: rl } = await supabase
    .from("diagnostic_rate_limits")
    .select("count")
    .eq("key", rlKey)
    .maybeSingle();

  if (rl && rl.count >= 1) {
    // Allow resend if they already have a lead for THIS diagnostic
    const { data: existingLead } = await supabase
      .from("diagnostic_leads")
      .select("id, verify_token")
      .eq("email", emailNorm)
      .eq("diagnostic_id", diagnosticId)
      .maybeSingle();

    if (existingLead) {
      const reportUrl = `${WWW_BASE}/diagnostic/report?token=${existingLead.verify_token}`;
      const { ok, error: emailErr } = await sendDiagnosticMagicLink(emailNorm, reportUrl);
      if (!ok) {
        console.error("[diagnostic/unlock] resend email error:", emailErr);
        return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, resent: true });
    }

    return NextResponse.json(
      {
        error:
          "You've already unlocked a diagnostic this month. Check your inbox or come back next month.",
      },
      { status: 429 }
    );
  }

  // Validate diagnostic exists
  const { data: diagnostic, error: diagErr } = await supabase
    .from("diagnostics")
    .select("id, channel_id")
    .eq("id", diagnosticId)
    .single();

  if (diagErr || !diagnostic) {
    return NextResponse.json({ error: "Diagnostic not found" }, { status: 404 });
  }

  const verifyToken = randomBytes(32).toString("hex");

  // Upsert lead — unique on (email, channel_id), so multiple diagnostics for the
  // same channel by the same email update rather than insert
  const { error: leadErr } = await supabase.from("diagnostic_leads").upsert(
    {
      email: emailNorm,
      channel_id: diagnostic.channel_id,
      diagnostic_id: diagnosticId,
      verified: false,
      verify_token: verifyToken,
    },
    { onConflict: "email,channel_id" }
  );

  if (leadErr) {
    console.error("[diagnostic/unlock] lead upsert error:", leadErr.message);
    return NextResponse.json({ error: "Failed to register email" }, { status: 500 });
  }

  // Increment monthly rate limit
  await supabase
    .from("diagnostic_rate_limits")
    .upsert(
      { key: rlKey, count: (rl?.count ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  const reportUrl = `${WWW_BASE}/diagnostic/report?token=${verifyToken}`;
  const { ok, error: emailErr } = await sendDiagnosticMagicLink(emailNorm, reportUrl);
  if (!ok) {
    console.error("[diagnostic/unlock] email error:", emailErr);
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }

  console.log(`[diagnostic/unlock] lead saved for ${emailNorm}, diagnostic=${diagnosticId}`);
  return NextResponse.json({ ok: true });
}
