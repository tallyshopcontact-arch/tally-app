"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "tally_lane_check_nudge_dismissed";

export default function LaneCheckNudgeBanner() {
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
          We&apos;ve moved our focus to{" "}
          <Link href="/upload-kit" className="text-white font-medium hover:text-[#e8833a] transition-colors underline underline-offset-2">
            Upload Kit
          </Link>
          {" "}— get the title, tags, and packaging for your next beat.
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
