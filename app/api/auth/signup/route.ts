import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendEmailConfirmation } from "@/lib/email";

const BASE_URL = "https://tallyagc.com";

export async function POST(request: NextRequest) {
  const { email, password, name } = await request.json();

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch (e) {
    console.error("[signup] Supabase client init failed:", e);
    return NextResponse.json({ error: "Server configuration error. Please contact support." }, { status: 500 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    console.error("[signup] createUser error:", error.message);
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }
    if (msg.includes("password") && msg.includes("characters")) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;

  // Generate email confirmation token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenError } = await supabase.from("email_confirmations").insert({
    producer_id: userId,
    token,
    email,
    confirmed: false,
    expires_at: expiresAt,
  });

  if (tokenError) {
    console.error("[signup] email_confirmations insert error:", tokenError.message);
  } else {
    const confirmationLink = `${BASE_URL}/confirm-email?token=${token}`;
    console.log(`[signup] sending confirmation email to ${email} | GMAIL_USER=${process.env.GMAIL_USER ?? "MISSING"} | GMAIL_APP_PASSWORD set: ${!!process.env.GMAIL_APP_PASSWORD}`);
    console.log(`[signup] confirmation link: ${confirmationLink}`);
    sendEmailConfirmation(email, confirmationLink).catch((err) =>
      console.error("[signup] sendEmailConfirmation top-level error:", err)
    );
  }

  return NextResponse.json({ userId }, { status: 201 });
}
