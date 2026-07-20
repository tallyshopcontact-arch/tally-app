"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "tally_founding_dismissed";

export default function FoundingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div className="bg-[#0d0d0d] border-b border-[#1e1e1e] px-6 py-2.5">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-[#94a3b8] leading-relaxed">
          <span className="mr-1.5">🎛️</span>
          <span className="text-white font-medium">Founding member offer</span>
          {" — "}first 20 producers lock in{" "}
          <span className="text-white font-medium">$14/month forever</span>.
          {" "}Use code{" "}
          <span className="font-mono font-bold text-white bg-[#1a1a1a] px-1.5 py-0.5 text-[11px]">
            FOUNDING20
          </span>
          {" "}at checkout.
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-[#475569] hover:text-[#94a3b8] text-base leading-none transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
