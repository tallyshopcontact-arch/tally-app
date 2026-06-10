import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

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
    // Map Supabase admin error messages to user-friendly text
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

  return NextResponse.json({ userId: data.user?.id }, { status: 201 });
}
