import { createAuthClient } from "@/lib/supabase-server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

function nextMidnightUTC(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function checkRateLimit(
  producerId: string,
  endpoint: string,
  maxPerDay: number
): Promise<RateLimitResult> {
  const supabase = await createAuthClient();
  const now = new Date();
  const midnight = nextMidnightUTC();

  const { data: existing } = await supabase
    .from("rate_limits")
    .select("id, count, reset_at")
    .eq("producer_id", producerId)
    .eq("endpoint", endpoint)
    .single();

  if (!existing) {
    await supabase.from("rate_limits").insert({
      producer_id: producerId,
      endpoint,
      count: 1,
      reset_at: midnight.toISOString(),
    });
    return { allowed: true, remaining: maxPerDay - 1, resetAt: midnight.toISOString() };
  }

  const resetAt = new Date(existing.reset_at);

  // Window has passed — reset
  if (now >= resetAt) {
    const newMidnight = nextMidnightUTC();
    await supabase
      .from("rate_limits")
      .update({ count: 1, reset_at: newMidnight.toISOString() })
      .eq("id", existing.id);
    return { allowed: true, remaining: maxPerDay - 1, resetAt: newMidnight.toISOString() };
  }

  if (existing.count >= maxPerDay) {
    return { allowed: false, remaining: 0, resetAt: existing.reset_at };
  }

  await supabase
    .from("rate_limits")
    .update({ count: existing.count + 1 })
    .eq("id", existing.id);

  return {
    allowed: true,
    remaining: maxPerDay - (existing.count + 1),
    resetAt: existing.reset_at,
  };
}
