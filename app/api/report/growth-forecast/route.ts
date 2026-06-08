import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";

interface MonthRow {
  month: number;
  year: number;
  monthly_views: number;
  monthly_subscribers: number;
  tally_score: number | null;
}

function stripJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
}

export async function POST() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [channelRes, reportRes] = await Promise.all([
    supabase
      .from("channel_data")
      .select("month, year, monthly_views, monthly_subscribers")
      .eq("producer_id", user.id)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .limit(12),
    supabase
      .from("reports")
      .select("month, year, tally_score")
      .eq("producer_id", user.id)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .limit(12),
  ]);

  const channelRows = channelRes.data ?? [];
  if (channelRows.length < 3) {
    return NextResponse.json({ error: "Not enough data" }, { status: 400 });
  }

  const scoreMap: Record<string, number> = {};
  for (const r of reportRes.data ?? []) {
    scoreMap[`${r.year}-${r.month}`] = r.tally_score ?? 0;
  }

  const rows: MonthRow[] = channelRows.map((r) => ({
    month: r.month,
    year: r.year,
    monthly_views: r.monthly_views,
    monthly_subscribers: r.monthly_subscribers,
    tally_score: scoreMap[`${r.year}-${r.month}`] ?? null,
  }));

  const historyText = rows
    .map((r) => `${monthLabel(r.year, r.month)}: ${r.monthly_views.toLocaleString()} views, ${r.monthly_subscribers} subs gained, TALLY score: ${r.tally_score ?? "N/A"}`)
    .join("\n");

  // Determine next 3 month labels
  const lastRow = rows[rows.length - 1];
  const nextMonths: string[] = [];
  let m = lastRow.month;
  let y = lastRow.year;
  for (let i = 0; i < 3; i++) {
    m++;
    if (m > 12) { m = 1; y++; }
    nextMonths.push(monthLabel(y, m));
  }

  const prompt = `You are a YouTube growth analyst. Based on this beat producer's last ${rows.length} months of data, generate a 3-month growth forecast.

Historical data:
${historyText}

Forecast for the next 3 months: ${nextMonths.join(", ")}

Generate two trajectories:
1. Baseline: if they continue current pace with no changes
2. Optimized: if they implement TALLY recommendations consistently

Respond with ONLY valid JSON. No markdown no code blocks.
{
  "baseline": [number, number, number],
  "optimized": [number, number, number],
  "months": ["${nextMonths[0]}", "${nextMonths[1]}", "${nextMonths[2]}"],
  "milestones": [
    {"month": "month label", "event": "what could happen — e.g. hit 10K subs, first 100K-view video"}
  ],
  "drivers": ["driver 1", "driver 2", "driver 3"],
  "summary": "2-sentence summary of the growth trajectory and what it depends on"
}

Rules:
- baseline and optimized are monthly view counts (integers)
- optimized should be 10–35% higher than baseline if data shows upward trend
- milestones: 1–3 items, only if realistic based on current trajectory
- drivers: 3 specific factors from their data driving the projection
- Keep it grounded — no fantasy numbers`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: "You are a YouTube analytics expert. Output only valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  try {
    const parsed = JSON.parse(stripJson(raw));
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Failed to parse forecast" }, { status: 500 });
  }
}
