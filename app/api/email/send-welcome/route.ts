import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST() {
  console.log("[send-welcome] called — RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);

  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    console.warn("[send-welcome] no authenticated user — skipping");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[send-welcome] user authenticated: ${user.id}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const name = profile?.name || user.user_metadata?.name || "";

  await sendWelcomeEmail(name, user.email);

  return NextResponse.json({ ok: true });
}
