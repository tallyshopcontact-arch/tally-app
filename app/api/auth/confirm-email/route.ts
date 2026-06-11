import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: confirmation, error: findErr } = await supabase
    .from("email_confirmations")
    .select("id, producer_id, email, confirmed, expires_at")
    .eq("token", token)
    .single();

  if (findErr || !confirmation) {
    return NextResponse.json({ error: "Invalid or expired confirmation link." }, { status: 404 });
  }

  if (confirmation.confirmed) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  if (new Date(confirmation.expires_at) < new Date()) {
    return NextResponse.json({ error: "This confirmation link has expired. Please sign up again." }, { status: 410 });
  }

  const { error: updateErr } = await supabase
    .from("email_confirmations")
    .update({ confirmed: true })
    .eq("id", confirmation.id);

  if (updateErr) {
    console.error("[confirm-email] update error:", updateErr.message);
    return NextResponse.json({ error: "Failed to confirm email. Please try again." }, { status: 500 });
  }

  console.log(`[confirm-email] confirmed for producer ${confirmation.producer_id}`);
  return NextResponse.json({ ok: true });
}
