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
  const { offer } = body as { offer?: "discount" | "pause" };

  if (!offer) return NextResponse.json({ error: "Missing offer type" }, { status: 400 });

  const serviceClient = getServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  const subId = profile.stripe_subscription_id as string;

  try {
    if (offer === "discount") {
      // Apply 50% off for one month
      const coupon = await stripe.coupons.create({
        percent_off: 50,
        duration: "once",
        name: "Retention offer - 50% off",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (stripe.subscriptions.update as any)(subId, {
        coupon: coupon.id,
        cancel_at_period_end: false,
      });
      return NextResponse.json({ ok: true, offer: "discount" });
    }

    if (offer === "pause") {
      // Pause for 30 days
      const resumesAt = Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000
      );
      await stripe.subscriptions.update(subId, {
        pause_collection: { behavior: "void", resumes_at: resumesAt },
        cancel_at_period_end: false,
      });
      return NextResponse.json({ ok: true, offer: "pause" });
    }

    return NextResponse.json({ error: "Unknown offer type" }, { status: 400 });
  } catch (e) {
    console.error("[retention] Stripe error:", e);
    const msg = e instanceof Error ? e.message : "Retention offer failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
