import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Service role client — bypasses RLS, required for server-to-server writes.
// The webhook has no session cookie so createAuthClient (anon key) can't update rows.
function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[stripe/webhook] received: ${event.type} id=${event.id}`);

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const producerId = session.metadata?.producer_id;
        console.log(`[stripe/webhook] checkout.session.completed producerId=${producerId} sub=${session.subscription}`);
        if (!producerId) {
          console.error("[stripe/webhook] checkout.session.completed: no producer_id in metadata");
          break;
        }

        // Read the actual trial end date from Stripe if the subscription exists
        let trialEndsAt: string | null = null;
        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string);
            trialEndsAt = sub.trial_end
              ? new Date(sub.trial_end * 1000).toISOString()
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          } catch {
            trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          }
        }

        const { error } = await supabase.from("profiles").update({
          subscription_status: "trialing",
          stripe_subscription_id: session.subscription as string,
          trial_ends_at: trialEndsAt,
        }).eq("id", producerId);

        if (error) {
          console.error("[stripe/webhook] checkout update error:", error.message);
        } else {
          console.log(`[stripe/webhook] profile ${producerId} set to trialing`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`[stripe/webhook] subscription.updated sub=${sub.id} status=${sub.status}`);

        const { data: profile, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();

        if (findErr || !profile) {
          console.error("[stripe/webhook] subscription.updated: profile not found for sub", sub.id, findErr?.message);
          break;
        }

        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          trialing: "trialing",
          canceled: "cancelled",
          unpaid: "past_due",
          incomplete: "past_due",
          incomplete_expired: "cancelled",
          paused: "cancelled",
        };
        const newStatus = statusMap[sub.status] ?? sub.status;

        const { error: updateErr } = await supabase.from("profiles").update({
          subscription_status: newStatus,
          ...(sub.status === "active" ? { trial_ends_at: null } : {}),
          ...(sub.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() } : {}),
        }).eq("id", profile.id);

        if (updateErr) {
          console.error("[stripe/webhook] subscription.updated update error:", updateErr.message);
        } else {
          console.log(`[stripe/webhook] profile ${profile.id} → ${newStatus}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`[stripe/webhook] subscription.deleted sub=${sub.id}`);

        const { data: profile, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();

        if (findErr || !profile) {
          console.error("[stripe/webhook] subscription.deleted: profile not found for sub", sub.id);
          break;
        }

        const { error } = await supabase.from("profiles").update({
          subscription_status: "cancelled",
          subscription_ends_at: new Date().toISOString(),
        }).eq("id", profile.id);

        if (error) console.error("[stripe/webhook] subscription.deleted update error:", error.message);
        else console.log(`[stripe/webhook] profile ${profile.id} → cancelled`);
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        console.log(`[stripe/webhook] invoice.payment_failed customer=${customerId}`);
        if (!customerId) break;

        const { data: profile, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (findErr || !profile) {
          console.error("[stripe/webhook] invoice.payment_failed: profile not found for customer", customerId);
          break;
        }

        const { error } = await supabase.from("profiles").update({ subscription_status: "past_due" }).eq("id", profile.id);
        if (error) console.error("[stripe/webhook] invoice.payment_failed update error:", error.message);
        break;
      }

      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        console.log(`[stripe/webhook] invoice.payment_succeeded customer=${customerId}`);
        if (!customerId) break;

        const { data: profile, error: findErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (findErr || !profile) {
          console.error("[stripe/webhook] invoice.payment_succeeded: profile not found for customer", customerId);
          break;
        }

        const { error } = await supabase.from("profiles").update({ subscription_status: "active" }).eq("id", profile.id);
        if (error) console.error("[stripe/webhook] invoice.payment_succeeded update error:", error.message);
        else console.log(`[stripe/webhook] profile ${profile.id} → active`);
        break;
      }

      default:
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }
  } catch (e) {
    console.error("[stripe/webhook] handler error:", e);
  }

  return NextResponse.json({ received: true });
}
