import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const provided = request.headers.get("x-admin-password");

  if (!adminPassword || provided !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    console.error("Supabase config error:", err);
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("waitlist")
    .select("id, name, email, genre, youtube_channel, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase fetch error:", error);
    return NextResponse.json({ error: "Failed to load signups." }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}
