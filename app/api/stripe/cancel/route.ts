import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { reasons, other_reason, feature_request, retention_offer_shown, retention_offer_accepted } = body as {
    reasons?: string[];
    other_reason?: string;
    feature_request?: string;
    retention_offer_shown?: string;
    retention_offer_accepted?: boolean;
  };

  const serviceClient = getServiceClient();

  // Get subscription ID from profile
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  try {
    // Cancel at period end (not immediately)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = await stripe.subscriptions.update(
      profile.stripe_subscription_id as string,
      { cancel_at_period_end: true }
    ) as any;

    // Save cancellation feedback
    await serviceClient.from("cancellations").insert({
      producer_id: user.id,
      reasons: reasons ?? [],
      other_reason: other_reason ?? null,
      feature_request: feature_request ?? null,
      retention_offer_shown: retention_offer_shown ?? null,
      retention_offer_accepted: retention_offer_accepted ?? false,
    });

    // Save feature request separately if provided
    if (feature_request?.trim()) {
      await serviceClient.from("feature_requests").insert({
        producer_id: user.id,
        request: feature_request.trim(),
        source: "cancellation",
      });
    }

    const periodEnd = new Date((sub.current_period_end as number) * 1000).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric", year: "numeric" }
    );

    return NextResponse.json({ ok: true, periodEnd });
  } catch (e) {
    console.error("[cancel] Stripe error:", e);
    const msg = e instanceof Error ? e.message : "Cancellation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
