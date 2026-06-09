"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type SubscriptionStatus = "free" | "trialing" | "active" | "past_due" | "cancelled" | "beta";

interface SubscriptionState {
  status: SubscriptionStatus;
  betaAccess: boolean;
  loading: boolean;
}

export function useSubscription(): SubscriptionState & {
  isPaid: () => boolean;
  canAccess: () => boolean;
} {
  const [state, setState] = useState<SubscriptionState>({
    status: "free",
    betaAccess: false,
    loading: true,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setState({ status: "free", betaAccess: false, loading: false });
        return;
      }
      supabase
        .from("profiles")
        .select("subscription_status, beta_access")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setState({
            status: (data?.subscription_status as SubscriptionStatus) ?? "free",
            betaAccess: data?.beta_access ?? false,
            loading: false,
          });
        });
    });
  }, []);

  const isPaid = () =>
    state.betaAccess ||
    state.status === "active" ||
    state.status === "trialing";

  const canAccess = () => isPaid() || state.status === "free";

  return { ...state, isPaid, canAccess };
}
