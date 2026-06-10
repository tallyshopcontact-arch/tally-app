import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

export async function GET() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = getServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_subscription_id, subscription_status, trial_ends_at")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ subscription: null });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = await stripe.subscriptions.retrieve(
      profile.stripe_subscription_id as string
    ) as any;
    const periodEnd = new Date((sub.current_period_end as number) * 1000).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric", year: "numeric" }
    );
    return NextResponse.json({
      subscription: {
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: periodEnd,
        trialEnd: sub.trial_end
          ? new Date((sub.trial_end as number) * 1000).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : null,
      },
    });
  } catch (e) {
    console.error("[subscription] Stripe error:", e);
    return NextResponse.json({ subscription: null });
  }
}
