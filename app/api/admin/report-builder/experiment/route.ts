// Report Builder — Fix 2: regenerates Section 5's draft experiment from the
// admin's actual Priority 1/3 picks, once they've been assigned in the
// picker. Pure computation over the already-fetched ChannelAnalysis (no
// Supabase/YouTube calls, no quota spend) — see
// lib/reports/channelAnalyzer.ts's regenerateExperiment for the logic this
// just wraps in the same admin-password auth pattern every other
// report-builder route uses.
import { NextRequest, NextResponse } from "next/server";
import type { ChannelAnalysis, ExperimentSelectionInput } from "@/lib/reports/channelAnalyzer";
import { regenerateExperiment } from "@/lib/reports/channelAnalyzer";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { analysis?: ChannelAnalysis; selection?: ExperimentSelectionInput }
    | null;
  if (!body?.analysis) {
    return NextResponse.json({ error: "Missing analysis" }, { status: 400 });
  }

  try {
    const generatedExperiment = regenerateExperiment(body.analysis, body.selection ?? {});
    return NextResponse.json({ generatedExperiment });
  } catch (err) {
    console.error("[report-builder/experiment] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Experiment regeneration failed: ${message}` }, { status: 500 });
  }
}
