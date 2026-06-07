import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, genre, youtube_channel } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !genre?.trim() || !youtube_channel?.trim()) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
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

  const { error } = await supabase.from("waitlist").insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    genre: genre.trim(),
    youtube_channel: youtube_channel.trim(),
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email is already on the waitlist." },
        { status: 409 }
      );
    }
    console.error("Supabase insert error:", error);
    return NextResponse.json(
      { error: "Failed to save your signup. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
