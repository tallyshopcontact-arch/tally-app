import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Validate token → find lead
  const { data: lead, error: leadErr } = await supabase
    .from("diagnostic_leads")
    .select("id, email, diagnostic_id, verified")
    .eq("verify_token", token)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json(
      { error: "Invalid or expired report link" },
      { status: 404 }
    );
  }

  // Mark verified on first visit
  if (!lead.verified) {
    await supabase
      .from("diagnostic_leads")
      .update({ verified: true })
      .eq("id", lead.id);
  }

  // Fetch full diagnostic
  const { data: diagnostic, error: diagErr } = await supabase
    .from("diagnostics")
    .select(
      "id, channel_id, channel_title, tally_score, grade, findings, free_finding_ids, narrative, created_at"
    )
    .eq("id", lead.diagnostic_id)
    .single();

  if (diagErr || !diagnostic) {
    return NextResponse.json({ error: "Diagnostic not found" }, { status: 404 });
  }

  // Check FOUNDING20 availability (first 20 paid accounts)
  const { count: paidCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("subscription_status", "active");
  const foundingSeatsRemain = (paidCount ?? 0) < 20;

  type StoredFinding = {
    id: string;
    category: string;
    status: string;
    score: number;
    weight: number;
    headline: string;
    detail: string;
    metrics: Record<string, string | number>;
  };

  const allFindings = diagnostic.findings as StoredFinding[];
  const freeIds = new Set(diagnostic.free_finding_ids as string[]);

  // 3 free findings get full detail + metrics; 6 locked get headline only
  const reportFindings = allFindings.map((f) => {
    if (freeIds.has(f.id)) {
      return {
        id: f.id,
        category: f.category,
        status: f.status,
        headline: f.headline,
        detail: f.detail,
        metrics: f.metrics,
        locked: false,
      };
    }
    return {
      id: f.id,
      category: f.category,
      status: f.status,
      headline: f.headline,
      locked: true,
    };
  });

  return NextResponse.json({
    diagnosticId: diagnostic.id,
    channelId: diagnostic.channel_id,
    channelTitle: diagnostic.channel_title,
    tallyScore: diagnostic.tally_score,
    grade: diagnostic.grade,
    narrative: diagnostic.narrative,
    generatedAt: diagnostic.created_at,
    findings: reportFindings,
    cta: {
      signupUrl: "https://www.tallyagc.com/signup",
      foundingSeatsRemain,
      promoCode: foundingSeatsRemain ? "FOUNDING20" : null,
      message: foundingSeatsRemain
        ? "Start your 14-day free trial — then $14/month, locked for life as a founding member. Use code FOUNDING20 for 20% off ($11.20/month forever)."
        : "Start your 14-day free trial — then $14/month.",
    },
  });
}
