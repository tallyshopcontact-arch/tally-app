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
    console.error("[create-founding-coupon] GET error:", JSON.stringify(e, null, 2));
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Step 1 — create coupon
  let coupon;
  try {
    const existing = await stripe.coupons.retrieve("FOUNDING20").catch(() => null);
    if (existing) {
      console.log("[create-founding-coupon] coupon already exists:", existing.id);
      coupon = existing;
    } else {
      coupon = await stripe.coupons.create({
        id: "FOUNDING20",
        name: "Founding Member - $19.99/mo forever",
        percent_off: 100,
        duration: "once",
        max_redemptions: 20,
        metadata: { type: "founding_member" },
      });
      console.log("[create-founding-coupon] created coupon:", coupon.id);
    }
  } catch (e) {
    console.error("[create-founding-coupon] coupon create error:", JSON.stringify(e, null, 2));
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Coupon creation failed: ${msg}`, detail: e }, { status: 500 });
  }

  // Step 2 — create promotion code
  let promoCode;
  try {
    // Check if the promo code already exists for this coupon
    const existingCodes = await stripe.promotionCodes.list({ code: "FOUNDING20", limit: 1 });
    if (existingCodes.data.length > 0) {
      console.log("[create-founding-coupon] promo code already exists:", existingCodes.data[0].id);
      promoCode = existingCodes.data[0];
    } else {
      const params = {
        coupon: coupon.id,
        code: "FOUNDING20",
        max_redemptions: 20,
        metadata: { type: "founding_member" },
      };
      console.log("[create-founding-coupon] creating promo code with params:", JSON.stringify(params));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      promoCode = await (stripe.promotionCodes.create as any)(params);
      console.log("[create-founding-coupon] created promo code:", promoCode.id);
    }
  } catch (e) {
    console.error("[create-founding-coupon] promo code create error:", JSON.stringify(e, null, 2));
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Promo code creation failed: ${msg}`, detail: e }, { status: 500 });
  }

  return NextResponse.json({
    coupon: {
      id: coupon.id,
      valid: coupon.valid,
      times_redeemed: coupon.times_redeemed,
      max_redemptions: coupon.max_redemptions,
    },
    promoCode,
  });
}
