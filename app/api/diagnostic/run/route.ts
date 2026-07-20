import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { resolveChannelId, fetchChannelDiagnosticData } from "@/lib/diagnostic/youtube";
import { runDiagnostic } from "@/lib/diagnostic/scoring";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const ip = getClientIp(req);

  // 1. Rate limit: 5 diagnostics/day per IP
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  const rlKey = `ip:${ip}:${today}`;

  const { data: rl } = await supabase
    .from("diagnostic_rate_limits")
    .select("count")
    .eq("key", rlKey)
    .maybeSingle();

  if (rl && rl.count >= 5) {
    return NextResponse.json(
      { error: "You've run 5 diagnostics today. Come back tomorrow." },
      { status: 429 }
    );
  }

  await supabase
    .from("diagnostic_rate_limits")
    .upsert(
      { key: rlKey, count: (rl?.count ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  // 2. Parse and validate input
  let body: { channelInput?: string; turnstileToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { channelInput, turnstileToken } = body;
  if (!channelInput?.trim()) {
    return NextResponse.json({ error: "channelInput is required" }, { status: 400 });
  }

  const turnstileResult = await verifyTurnstileToken(turnstileToken);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: "Bot verification failed. Please try again." },
      { status: 403 }
    );
  }

  // 3. Resolve channel ID from URL, @handle, or raw ID
  let channelId: string;
  try {
    channelId = await resolveChannelId(channelInput.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not resolve channel";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Cache check: return existing diagnostic if < 7 days old (zero YouTube/Claude cost)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from("diagnostics")
    .select("id, channel_title, tally_score, grade, findings, free_finding_ids")
    .eq("channel_id", channelId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    console.log(`[diagnostic/run] cache hit for ${channelId}`);
    return NextResponse.json({
      diagnosticId: cached.id,
      channelTitle: cached.channel_title,
      tallyScore: cached.tally_score,
      grade: cached.grade,
      teaser: (cached.findings as { id: string; category: string; status: string; headline: string }[]).map((f) => ({
        id: f.id,
        category: f.category,
        status: f.status,
        headline: f.headline,
      })),
    });
  }

  // 5. Fetch YouTube data (~3 quota units)
  let ytData: Awaited<ReturnType<typeof fetchChannelDiagnosticData>>;
  try {
    ytData = await fetchChannelDiagnosticData(channelId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch YouTube data";
    console.error("[diagnostic/run] YouTube error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 6. Run pure scoring engine
  const { tallyScore, grade, findings, freeFindingIds } = runDiagnostic(
    ytData.channel,
    ytData.videos
  );

  // 7. Haiku narrative — shared LLM kill-switch (also gates the Lane Check title generator)
  let narrative: string | null = null;
  if (process.env.TALLY_LLM_ENABLED === "true") {
    try {
      const { anthropic } = await import("@/lib/anthropic");
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:
          "You are TALLY, a growth analyst for type-beat producers. Write a 3-4 sentence summary of this channel's biggest problems and biggest opportunity. Reference the actual numbers given. Direct, producer-to-producer tone. No hype, no generic advice, no markdown.",
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              channelTitle: ytData.channel.title,
              tallyScore,
              findings: findings.map((f) => ({
                headline: f.headline,
                status: f.status,
                metrics: f.metrics,
              })),
            }),
          },
        ],
      });
      narrative = res.content[0].type === "text" ? res.content[0].text : null;
    } catch (e) {
      console.error("[diagnostic/run] narrative generation failed (non-fatal):", e);
    }
  }

  // 8. Persist diagnostic
  const { data: inserted, error: insertErr } = await supabase
    .from("diagnostics")
    .insert({
      channel_id: channelId,
      channel_title: ytData.channel.title,
      tally_score: tallyScore,
      grade,
      findings,
      free_finding_ids: freeFindingIds,
      narrative,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[diagnostic/run] insert error:", insertErr?.message);
    return NextResponse.json({ error: "Failed to save diagnostic" }, { status: 500 });
  }

  console.log(`[diagnostic/run] saved ${inserted.id} for ${ytData.channel.title} (score=${tallyScore})`);

  return NextResponse.json({
    diagnosticId: inserted.id,
    channelTitle: ytData.channel.title,
    tallyScore,
    grade,
    // teaser: all 9 headlines + status, no detail/metrics (email gate)
    teaser: findings.map((f) => ({
      id: f.id,
      category: f.category,
      status: f.status,
      headline: f.headline,
    })),
  });
}
