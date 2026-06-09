import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAuthClient } from "@/lib/supabase-server";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = await createAuthClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const producerId = session.metadata?.producer_id;
        if (!producerId) break;
        const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("profiles").update({
          subscription_status: "trialing",
          stripe_subscription_id: session.subscription as string,
          trial_ends_at: trialEnds,
        }).eq("id", producerId);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        if (!profile) break;
        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          trialing: "trialing",
          canceled: "cancelled",
        };
        const newStatus = statusMap[sub.status] ?? sub.status;
        await supabase.from("profiles").update({
          subscription_status: newStatus,
          ...(sub.status === "active" ? { trial_ends_at: null } : {}),
        }).eq("id", profile.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        if (!profile) break;
        await supabase.from("profiles").update({
          subscription_status: "cancelled",
          subscription_ends_at: new Date().toISOString(),
        }).eq("id", profile.id);
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (!profile) break;
        await supabase.from("profiles").update({ subscription_status: "past_due" }).eq("id", profile.id);
        break;
      }

      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (!profile) break;
        await supabase.from("profiles").update({ subscription_status: "active" }).eq("id", profile.id);
        break;
      }
    }
  } catch (e) {
    console.error("[stripe/webhook] handler error:", e);
  }

  return NextResponse.json({ received: true });
}
