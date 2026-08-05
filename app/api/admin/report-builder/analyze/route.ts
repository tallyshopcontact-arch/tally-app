// Report Builder — channel analysis endpoint. Runs analyzeChannel (the only
// step in this feature that spends real YouTube quota) behind the same
// reserve-then-check budget guard the Upload Kit reframe already uses (see
// lib/lanes/db.ts reserveQuota / supabase/upload-kit-migration.sql) — a report
// only ever counts once here, not again in the separate /report render step,
// since that step makes no YouTube calls of its own.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeChannel } from "@/lib/reports/channelAnalyzer";
import { upsertTrackedChannel } from "@/lib/reports/channelTracking";
import { reserveQuota } from "@/lib/lanes/db";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// channels.list + playlistItems.list + videos.list, all ~1 unit each in
// practice — rounded well above actual cost to keep the daily budget honest
// against the brief's own ~15-25 unit/report estimate.
const ESTIMATED_UNITS_PER_REPORT = 20;

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as
    | { channelUrl?: string; month?: number; year?: number }
    | null;
  const channelUrl = body?.channelUrl?.trim();
  if (!channelUrl) {
    return NextResponse.json({ error: "Missing channelUrl" }, { status: 400 });
  }

  const month = body?.month;
  const year = body?.year;
  if (!month || !year || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Missing or invalid month/year" }, { status: 400 });
  }

  const supabase = createServerClient();

  const allowed = await reserveQuota(supabase, ESTIMATED_UNITS_PER_REPORT);
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily YouTube quota budget reached — try again tomorrow." },
      { status: 429 }
    );
  }

  try {
    const analysis = await analyzeChannel(supabase, channelUrl, month, year);

    // Auto-enrollment (Phase 1 channel snapshot history) — every channel run
    // through the report builder starts accumulating daily snapshot history
    // immediately, no separate registration step. Best-effort: an enrollment
    // failure must not fail the analysis response the admin is waiting on.
    try {
      await upsertTrackedChannel(supabase, {
        channelId: analysis.channel.channelId,
        channelName: analysis.channel.channelName,
        subscriberCount: analysis.channel.subscriberCount,
      });
    } catch (enrollErr) {
      console.error("[report-builder/analyze] tracked_channels auto-enrollment failed:", enrollErr);
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[report-builder/analyze] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    // Zero uploads in the selected month is an expected, user-actionable
    // outcome (pick a different month) — surface it as-is, not as a 500.
    if (message.startsWith("No uploads found for")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: `Channel analysis failed: ${message}` }, { status: 500 });
  }
}
