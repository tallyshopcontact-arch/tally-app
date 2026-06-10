import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const coupon = await stripe.coupons.retrieve("FOUNDING20");
    const promoCodes = await stripe.promotionCodes.list({
      code: "FOUNDING20",
      limit: 1,
    });
    return NextResponse.json({
      exists: true,
      coupon: {
        id: coupon.id,
        valid: coupon.valid,
        times_redeemed: coupon.times_redeemed,
        max_redemptions: coupon.max_redemptions,
      },
      promoCode: promoCodes.data[0] ?? null,
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "resource_missing") {
      return NextResponse.json({ exists: false });
    }
    console.error("[create-founding-coupon] GET error:", e);
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Check if already exists
    const existing = await stripe.coupons.retrieve("FOUNDING20").catch(() => null);
    if (existing) {
      return NextResponse.json({
        already_exists: true,
        coupon: {
          id: existing.id,
          valid: existing.valid,
          times_redeemed: existing.times_redeemed,
          max_redemptions: existing.max_redemptions,
        },
      });
    }

    const coupon = await stripe.coupons.create({
      id: "FOUNDING20",
      percent_off: 100,
      duration: "once",
      max_redemptions: 20,
      name: "Founding Member — Locked at $19.99/month forever",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promoCode = await (stripe.promotionCodes.create as any)({
      coupon: coupon.id,
      code: "FOUNDING20",
    });

    console.log("[create-founding-coupon] created FOUNDING20 coupon + promo code");
    return NextResponse.json({ coupon, promoCode });
  } catch (e) {
    console.error("[create-founding-coupon] POST error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
