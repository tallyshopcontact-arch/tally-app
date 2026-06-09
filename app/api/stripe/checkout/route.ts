import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: "https://tallyagc.com/dashboard?subscribed=true",
    cancel_url: "https://tallyagc.com/pricing",
    customer: customerId,
    metadata: { producer_id: user.id },
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 7,
      metadata: { producer_id: user.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
