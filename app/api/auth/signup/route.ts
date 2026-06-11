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

  // Step 1: Create the auth user
  console.log(`[signup] step 1 — creating auth user for ${email}`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    console.error("[signup] step 1 FAILED — createUser error:", error.message);
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
  console.log(`[signup] step 1 OK — userId=${userId}`);

  // Step 2: Insert the profiles row so the FK in email_confirmations resolves
  console.log(`[signup] step 2 — inserting profile for userId=${userId}`);
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    email,
    name,
    subscription_status: "free",
  });

  if (profileError) {
    if (profileError.code === "23505") {
      console.log("[signup] step 2 — profile already exists (ok)");
    } else {
      console.error("[signup] step 2 FAILED — profile insert error:", profileError.message, profileError.code);
    }
  } else {
    console.log("[signup] step 2 OK — profile inserted");
  }

  // Step 3: Insert the email confirmation token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  console.log(`[signup] step 3 — inserting email_confirmation token for userId=${userId}`);
  const { error: tokenError } = await supabase.from("email_confirmations").insert({
    producer_id: userId,
    token,
    email,
    confirmed: false,
    expires_at: expiresAt,
  });

  if (tokenError) {
    console.error("[signup] step 3 FAILED — email_confirmations insert error:", tokenError.message, tokenError.code);
    // Can't send email without a saved token — return early with account created
    return NextResponse.json({ created: true, emailSent: false }, { status: 201 });
  }

  console.log("[signup] step 3 OK — confirmation token saved");

  // Step 4: AWAIT the confirmation email before responding (Vercel freezes after response)
  const confirmationLink = `${BASE_URL}/confirm-email?token=${token}`;
  console.log(`[signup] step 4 — sending confirmation email to ${email} | RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);
  const result = await sendEmailConfirmation(email, confirmationLink);
  console.log("[signup] email result:", JSON.stringify(result));

  return NextResponse.json({ created: true, emailSent: result.ok }, { status: 201 });
}
