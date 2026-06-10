import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

async function getFoundingStatus() {
  const codes = await stripe.promotionCodes.list({ code: "FOUNDING20", limit: 1 });
  if (codes.data.length === 0) return null;

  const promoCode = codes.data[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = promoCode as any;
  // API v2026 uses coupon_id; older versions embed coupon as string or object
  const couponId: string =
    raw.coupon_id ?? (typeof raw.coupon === "string" ? raw.coupon : raw.coupon?.id ?? "");

  let couponInfo = null;
  if (couponId) {
    const coupon = await stripe.coupons.retrieve(couponId).catch(() => null);
    if (coupon) {
      couponInfo = {
        id: coupon.id,
        valid: coupon.valid,
        times_redeemed: coupon.times_redeemed ?? 0,
        max_redemptions: coupon.max_redemptions ?? 20,
      };
    }
  }

  return {
    promoCode: { id: promoCode.id, active: promoCode.active },
    coupon: couponInfo,
  };
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getFoundingStatus();
    if (!status) return NextResponse.json({ exists: false });
    return NextResponse.json({ exists: true, ...status });
  } catch (e) {
    console.error("[founding-coupon] GET error:", JSON.stringify(e, null, 2));
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}

// POST is kept for the admin "check" button — it no longer creates anything.
export async function POST(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getFoundingStatus();
    if (!status) {
      return NextResponse.json(
        {
          error:
            "FOUNDING20 promotion code not found in Stripe. Create it manually in the Stripe dashboard: Coupons → Add promotion code → code FOUNDING20.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ exists: true, ...status });
  } catch (e) {
    console.error("[founding-coupon] POST error:", JSON.stringify(e, null, 2));
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}
