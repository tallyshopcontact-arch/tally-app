"use client";

import { useState } from "react";

interface UpgradePromptProps {
  title?: string;
  description?: string;
  feature?: string;
}

export function UpgradePrompt({
  title = "Upgrade to TALLY Pro",
  description = "Get unlimited Lane Check access for $14/month.",
  feature,
}: UpgradePromptProps) {
  const [loading, setLoading] = useState(false);
  const [checkError, setCheckError] = useState("");

  async function handleUpgrade() {
    setLoading(true);
    setCheckError("");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/signup";
        return;
      }
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      console.error("[upgrade-prompt] checkout error:", e);
      setCheckError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border border-white/10 bg-[#0d0d0d] text-center max-w-md mx-auto">
      <div className="text-3xl">🔒</div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {feature && (
        <p className="text-sm text-white/50">
          <span className="text-white/70 font-medium">{feature}</span> is a Pro feature.
        </p>
      )}
      <p className="text-sm text-white/50">{description}</p>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="mt-2 px-6 py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Start 7-Day Free Trial — $14/mo"}
      </button>
      {checkError && (
        <p className="text-[#f87171] text-xs">{checkError}</p>
      )}
      <p className="text-xs text-white/30">Cancel anytime. No commitment.</p>
    </div>
  );
}
