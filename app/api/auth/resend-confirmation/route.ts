import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendEmailConfirmation } from "@/lib/email";

const BASE_URL = "https://tallyagc.com";

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Missing email." }, { status: 400 });
  }

  const supabase = createServerClient();

  // Look up the producer's user id by email
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (profileErr || !profile) {
    console.error("[resend-confirmation] profile not found for email:", email);
    // Return ok so we don't leak whether the email exists
    return NextResponse.json({ ok: true });
  }

  // Generate a fresh token and upsert it
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: upsertErr } = await supabase
    .from("email_confirmations")
    .upsert(
      { producer_id: profile.id, token, email, confirmed: false, expires_at: expiresAt },
      { onConflict: "producer_id" }
    );

  if (upsertErr) {
    console.error("[resend-confirmation] upsert error:", upsertErr.message);
    return NextResponse.json({ ok: false, error: "Failed to generate token." }, { status: 500 });
  }

  const confirmationLink = `${BASE_URL}/confirm-email?token=${token}`;
  console.log(`[resend-confirmation] sending to ${email} link=${confirmationLink}`);

  const result = await sendEmailConfirmation(email, confirmationLink);
  console.log("[resend-confirmation] email result:", JSON.stringify(result));

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Email send failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
