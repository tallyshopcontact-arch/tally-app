"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge, { type LaneStatusColor } from "../components/StatusBadge";

interface LaneSummary {
  laneId: string;
  laneSlug: string;
  displayName: string;
  status: "ready" | "queued";
  opportunity?: number;
  statusColor?: LaneStatusColor;
  verdict?: string;
}

interface CheckHistoryItem {
  id: string;
  genre: string | null;
  channelId: string | null;
  createdAt: string;
  lanes: LaneSummary[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function LaneCheckHistoryPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauthenticated">("loading");
  const [checks, setChecks] = useState<CheckHistoryItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lane-check/history");
        const json = await res.json();
        if (res.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          setError(json.error ?? "Failed to load history.");
          return;
        }
        setChecks(json.checks);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please check your connection and try again.");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Dashboard</Link>
        </div>
      </nav>

      <section className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-6">
          Lane Check History
        </p>
        <h1 className="font-[family-name:var(--font-display)] font-bold text-3xl md:text-4xl leading-[1.1] tracking-tight mb-10">
          Every lane you&apos;ve checked.
        </h1>

        {status === "loading" && (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-[#e8833a] rounded-full animate-spin shrink-0" />
            Loading your history...
          </div>
        )}

        {status === "unauthenticated" && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-6 py-8 text-center">
            <p className="text-sm text-[#94a3b8] mb-4">Sign in to see your Lane Check history.</p>
            <Link
              href="/login"
              className="inline-block text-[#0a0a0a] text-sm font-semibold px-6 py-3 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Log in →
            </Link>
          </div>
        )}

        {status === "error" && <p className="text-[#f87171] text-sm">{error}</p>}

        {status === "ready" && checks.length === 0 && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-6 py-8 text-center">
            <p className="text-sm text-[#94a3b8] mb-4">You haven&apos;t run a Lane Check yet.</p>
            <Link
              href="/lane-check"
              className="inline-block text-[#0a0a0a] text-sm font-semibold px-6 py-3 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Check my lanes →
            </Link>
          </div>
        )}

        {status === "ready" && checks.length > 0 && (
          <div className="space-y-4">
            {checks.map((check) => (
              <div key={check.id} className="border border-[#1a1a1a] bg-[#0d0d0d] p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-[#94a3b8]">{formatDate(check.createdAt)}</p>
                  {check.genre && (
                    <span className="text-[10px] text-[#64748b] border border-[#2a2a2a] px-2 py-0.5 uppercase tracking-widest">
                      {check.genre}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {check.lanes.map((lane) => (
                    <div key={lane.laneId} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{lane.displayName}</span>
                      {lane.status === "queued" ? (
                        <span className="text-xs text-[#fbbf24]">Queued</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold font-[family-name:var(--font-display)]">
                            {lane.opportunity}
                          </span>
                          {lane.statusColor && <StatusBadge status={lane.statusColor} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">Terms of Service</Link>
            <span className="text-[#64748b] text-xs">© 2026 TALLY. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
