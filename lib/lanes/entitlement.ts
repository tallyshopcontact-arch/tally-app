// Lane Check pivot — server-side entitlement check. Mirrors the isPaid() logic
// in lib/hooks/useSubscription.ts, which only runs client-side; API routes need
// the same rule evaluated against the service-role client.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isPaidUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("subscription_status, beta_access")
    .eq("id", userId)
    .single();
  if (!data) return false;
  return !!data.beta_access || data.subscription_status === "active" || data.subscription_status === "trialing";
}
