import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// To switch to live mode, update these Vercel env vars (no code changes needed):
//   STRIPE_SECRET_KEY          → sk_live_...
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY → pk_live_...
//   STRIPE_PRICE_ID_MONTHLY    → price_live_...
//   STRIPE_PRICE_ID_YEARLY     → price_live_...
//   STRIPE_WEBHOOK_SECRET      → whsec_live_...

export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { promoCode?: string; plan?: "monthly" | "yearly" };
  const promoCode = body?.promoCode?.trim().toUpperCase();
  const plan = body?.plan === "yearly" ? "yearly" : "monthly";
  const priceId = plan === "yearly" ? process.env.STRIPE_PRICE_ID_YEARLY : process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) {
    return NextResponse.json({ error: `Missing STRIPE_PRICE_ID_${plan.toUpperCase()} env var` }, { status: 500 });
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? "",
        metadata: { producer_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Resolve promo code → Stripe promotion code ID
    let discounts: { promotion_code: string }[] | undefined;
    let allowPromoCodes = true;

    if (promoCode) {
      const codes = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });
      if (codes.data.length > 0) {
        discounts = [{ promotion_code: codes.data[0].id }];
        allowPromoCodes = false;
      }
    }

    // All new subscriptions get a 14-day trial. FOUNDING20's benefit is the
    // 20% off locked for life (applied via `discounts` above), not extra
    // trial time.
    const trialDays = 14;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "if_required",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://tallyagc.com/dashboard?subscribed=true",
      cancel_url: "https://tallyagc.com/pricing",
      customer: customerId,
      metadata: { producer_id: user.id },
      ...(discounts ? { discounts } : { allow_promotion_codes: allowPromoCodes }),
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { producer_id: user.id },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[checkout] Stripe error:", e);
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
