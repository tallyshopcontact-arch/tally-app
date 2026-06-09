"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Error</p>
      <h1 className="text-3xl font-bold mb-3">Something went wrong</h1>
      <p className="text-[#94a3b8] text-sm mb-8 max-w-sm">
        An unexpected error occurred. Try again or contact support if the problem persists.
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-white/90 transition"
        >
          Try again
        </button>
        <Link href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
