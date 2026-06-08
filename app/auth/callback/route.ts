import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createAuthClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] exchangeCodeForSession error:", error?.message);
    return NextResponse.redirect(new URL("/login?error=confirmation_failed", origin));
  }

  // Check if the user has completed onboarding via their profile row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("id", data.user.id)
    .single();

  const onboardingDone =
    profile?.onboarding_complete === true ||
    data.user.user_metadata?.onboarding_complete === true;

  return NextResponse.redirect(
    new URL(onboardingDone ? "/dashboard" : "/onboarding", origin)
  );
}
