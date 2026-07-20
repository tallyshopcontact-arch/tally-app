import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

const FIXED_COSTS = [
  { item: "Domain (tallyagc.com)", amount: 1.29 },
  { item: "Claude Pro subscription", amount: 29.0 },
  { item: "Vercel hosting", amount: 0.0 },
  { item: "Supabase database", amount: 0.0 },
];

const VARIABLE_RATES = {
  reports: 0.2,
  upload_kits: 0.08,
  title_tests: 0.02,
  outreach: 0.06,
};

const PRICE = 14;

export async function GET(req: NextRequest) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // YYYY-MM

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    if (y && m) {
      year = y;
      month = m;
    }
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  const monthEndUnix = Math.floor(monthEnd.getTime() / 1000);

  // ── Stripe ──────────────────────────────────────────────────────────────────
  const [activeSubs, trialSubs, cancelledSubs, newSubs, foundingCode] =
    await Promise.all([
      stripe.subscriptions.list({ status: "active", limit: 100 }),
      stripe.subscriptions.list({ status: "trialing", limit: 100 }),
      stripe.subscriptions.list({
        status: "canceled",
        created: { gte: monthStartUnix, lt: monthEndUnix },
        limit: 100,
      }),
      stripe.subscriptions.list({
        status: "active",
        created: { gte: monthStartUnix, lt: monthEndUnix },
        limit: 100,
      }),
      stripe.promotionCodes
        .list({ code: "FOUNDING20", limit: 1 })
        .then((r) => r.data[0] ?? null)
        .catch(() => null),
    ]);

  const activeCount = activeSubs.data.length;
  const trialCount = trialSubs.data.length;
  const cancelledCount = cancelledSubs.data.length;
  const newCount = newSubs.data.length;
  const mrr = parseFloat((activeCount * PRICE).toFixed(2));
  const startCount = activeCount + cancelledCount;
  const churnRate = startCount > 0 ? (cancelledCount / startCount) * 100 : 0;
  const projectedNextMonth = parseFloat(
    (mrr * (1 - churnRate / 100)).toFixed(2)
  );

  let foundingInfo: {
    exists: boolean;
    timesRedeemed: number;
    maxRedemptions: number;
    valid: boolean;
  } | null = null;

  if (foundingCode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = foundingCode as any;
    // API v2026 uses coupon_id; older versions embed coupon as string or object
    const couponId: string =
      raw.coupon_id ?? (typeof raw.coupon === "string" ? raw.coupon : raw.coupon?.id ?? "");
    const coupon = await stripe.coupons.retrieve(couponId).catch(() => null);
    foundingInfo = coupon
      ? {
          exists: true,
          timesRedeemed: coupon.times_redeemed ?? 0,
          maxRedemptions: coupon.max_redemptions ?? 20,
          valid: coupon.valid,
        }
      : null;
  }

  // ── Supabase usage counts ────────────────────────────────────────────────────
  const supabase = getServiceClient();
  const [reportsRes, kitsRes, testsRes, outreachRes] = await Promise.all([
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString()),
    supabase
      .from("upload_kits")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString()),
    supabase
      .from("title_tests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString()),
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .not("outreach_sequence", "is", null)
      .gte("found_at", monthStart.toISOString())
      .lt("found_at", monthEnd.toISOString()),
  ]);

  const reportCount = reportsRes.count ?? 0;
  const kitCount = kitsRes.count ?? 0;
  const testCount = testsRes.count ?? 0;
  const outreachCount = outreachRes.count ?? 0;

  const variableCosts = [
    {
      item: "Anthropic API (reports)",
      type: "variable" as const,
      amount: parseFloat((reportCount * VARIABLE_RATES.reports).toFixed(2)),
      count: reportCount,
    },
    {
      item: "Anthropic API (upload kits)",
      type: "variable" as const,
      amount: parseFloat((kitCount * VARIABLE_RATES.upload_kits).toFixed(2)),
      count: kitCount,
    },
    {
      item: "Anthropic API (title tests)",
      type: "variable" as const,
      amount: parseFloat((testCount * VARIABLE_RATES.title_tests).toFixed(2)),
      count: testCount,
    },
    {
      item: "Anthropic API (outreach)",
      type: "variable" as const,
      amount: parseFloat(
        (outreachCount * VARIABLE_RATES.outreach).toFixed(2)
      ),
      count: outreachCount,
    },
  ];

  const fixedCosts = FIXED_COSTS.map((c) => ({ ...c, type: "fixed" as const }));

  const totalVariable = parseFloat(
    variableCosts.reduce((s, c) => s + c.amount, 0).toFixed(2)
  );
  const totalFixed = parseFloat(
    fixedCosts.reduce((s, c) => s + c.amount, 0).toFixed(2)
  );
  const totalCosts = parseFloat((totalVariable + totalFixed).toFixed(2));
  const netProfit = parseFloat((mrr - totalCosts).toFixed(2));
  const marginPct = mrr > 0 ? parseFloat(((netProfit / mrr) * 100).toFixed(1)) : 0;
  const costPerSub =
    activeCount > 0
      ? parseFloat((totalCosts / activeCount).toFixed(2))
      : 0;

  return NextResponse.json({
    month: `${year}-${String(month).padStart(2, "0")}`,
    stripe: {
      activeCount,
      trialCount,
      cancelledCount,
      newCount,
      mrr,
      churnRate: parseFloat(churnRate.toFixed(1)),
      projectedNextMonth,
    },
    variableCosts,
    fixedCosts,
    summary: {
      totalVariable,
      totalFixed,
      totalCosts,
      mrr,
      netProfit,
      marginPct,
      costPerSub,
    },
    foundingMember: foundingInfo,
  });
}
