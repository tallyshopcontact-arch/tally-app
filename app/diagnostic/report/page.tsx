"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

// ── Types (mirrors app/api/diagnostic/report response) ─────────────────────

type CheckStatus = "pass" | "warn" | "fail";

interface UnlockedFinding {
  id: string;
  category: string;
  status: CheckStatus;
  headline: string;
  detail: string;
  metrics: Record<string, string | number>;
  locked: false;
}

interface LockedFinding {
  id: string;
  category: string;
  status: CheckStatus;
  headline: string;
  locked: true;
}

type Finding = UnlockedFinding | LockedFinding;

interface ReportData {
  diagnosticId: string;
  channelId: string;
  channelTitle: string;
  tallyScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  narrative: string | null;
  generatedAt: string;
  findings: Finding[];
  cta: {
    signupUrl: string;
    foundingSeatsRemain: boolean;
    promoCode: string | null;
    message: string;
  };
}

// ── Shared style primitives (from dashboard/report/page.tsx) ───────────────

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

const STATUS_BADGE: Record<CheckStatus, string> = {
  pass: "text-[#4ade80] border-[#1a3a1a] bg-[#0a1a0a]",
  warn: "text-[#fbbf24] border-[#3a2a0a] bg-[#1a140a]",
  fail: "text-[#f87171] border-[#3a1a1a] bg-[#1a0a0a]",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Issue",
};

function metricLabel(key: string): string {
  const withSpaces = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return withSpaces.trim();
}

// lane_performance carries internal fields (mode, bestLabel, worstLabel) used for
// headline/detail text — not meant for the raw metrics table.
const LANE_PERFORMANCE_METRIC_KEYS = ["gapMultiplier", "bestMedianViews", "worstMedianViews", "qualifyingLanes"];

function visibleMetrics(f: UnlockedFinding): [string, string | number][] {
  const entries = Object.entries(f.metrics);
  if (f.id !== "lane_performance") return entries;
  return entries.filter(([key]) => LANE_PERFORMANCE_METRIC_KEYS.includes(key));
}

// Static, unscored — same for every channel regardless of diagnostic result.
const QUICK_WINS = [
  {
    title: "Format your titles the proven way",
    detail: `[FREE] Artist Type Beat — "Beat Name" (prod. you) — include an artist target, the words "type beat", and a quoted beat name in every title, 35–75 characters.`,
  },
  {
    title: "Put a store link on line 1 of every description",
    detail: "Link your BeatStars, Airbit, or Traktrain store first — views that can't convert to a sale are wasted views.",
  },
  {
    title: "Tag every upload",
    detail: `Use 5+ tags per video, including "type beat" and your artist target — free, and it's the easiest win on this list.`,
  },
  {
    title: "Keep beats in the 2–4 minute range",
    detail: "Two full loop-throughs with a switch-up keeps retention healthy without dragging on past the point buyers tune out.",
  },
];

// ── Content ──────────────────────────────────────────────────────────────

function ReportContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "ready" | "error">(token ? "loading" : "error");
  const [error, setError] = useState(token ? "" : "Missing report link. Check the link in your email and try again.");
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`/api/diagnostic/report?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!res.ok) {
          setStatus("error");
          setError(json.error ?? "Report not found.");
          return;
        }

        setData(json);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please check your connection and try again.");
      }
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4 max-w-md mx-auto mt-24">
        <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
        Loading your report...
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="max-w-sm mx-auto mt-24 text-center px-6">
        <h1 className="text-2xl font-bold mb-3">Report not found</h1>
        <p className="text-[#94a3b8] text-sm mb-6">{error}</p>
        <Link
          href="/diagnostic"
          className="inline-block bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
        >
          Run a new diagnostic →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-24">
      {/* Score */}
      <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-8 py-8 flex items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-[#94a3b8] text-xs uppercase tracking-widest mb-1">
            {data.channelTitle}
          </p>
          <p className={`text-6xl font-bold ${scoreColor(data.tallyScore)}`}>
            {data.tallyScore}
            <span className="text-2xl text-[#475569]">/100</span>
          </p>
        </div>
        <div className={`text-4xl font-bold ${scoreColor(data.tallyScore)}`}>{data.grade}</div>
      </div>

      {data.narrative && (
        <p className="text-[#cbd5e1] text-sm leading-relaxed mb-10 border-l-2 border-[#1a1a1a] pl-4">
          {data.narrative}
        </p>
      )}

      {/* Findings */}
      <div className="mb-10">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4 mt-6">
          Full breakdown — 6 growth checks
        </p>
        <div className="grid grid-cols-1 gap-px bg-[#1a1a1a]">
          {data.findings.map((f) =>
            f.locked ? (
              <div key={f.id} className="bg-[#0a0a0a] p-5 opacity-50">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-3 h-3 text-[#475569] shrink-0" />
                  <span className="text-[#64748b] text-xs">{f.category}</span>
                </div>
                <p className="text-sm text-[#2a2a2a] leading-relaxed">{f.headline}</p>
              </div>
            ) : (
              <div key={f.id} className="bg-[#0a0a0a] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-semibold tracking-[0.15em] uppercase border px-2 py-0.5 ${STATUS_BADGE[f.status]}`}
                  >
                    {STATUS_LABEL[f.status]}
                  </span>
                  <span className="text-[#64748b] text-xs">{f.category}</span>
                </div>
                <p className="text-sm font-medium leading-relaxed mb-3">{f.headline}</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">{f.detail}</p>
                <div className="space-y-1.5 border-t border-[#1a1a1a] pt-3">
                  {visibleMetrics(f).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[#64748b] text-xs">{metricLabel(key)}</span>
                      <span className="text-xs font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="border border-white/20 p-8">
        <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-2">
          Find out which lanes your beats can win right now
        </p>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-6">
          Which artists to target, how to title it, and who&apos;s actually winning that lane —
          based on your genre and real YouTube data.
        </p>
        <a
          href={`/upload-kit?channel=${encodeURIComponent(data.channelId)}`}
          className="block text-center text-[#0a0a0a] text-sm font-bold py-4 hover:brightness-110 transition-all"
          style={{ backgroundColor: "#e8833a" }}
        >
          Find out which lanes your beats can win right now →
        </a>
      </div>

      {/* Quick Wins Checklist — static, same for every channel */}
      <div className="mt-10">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-1">
          Quick Wins Checklist
        </p>
        <p className="text-[#64748b] text-xs leading-relaxed mb-4">
          Same for every channel regardless of score — knock these out first.
        </p>
        <div className="border border-[#1a1a1a] divide-y divide-[#1a1a1a]">
          {QUICK_WINS.map((item, i) => (
            <div key={item.title} className="flex items-start gap-3 p-5">
              <span className="text-[#334155] text-xs font-bold mt-px shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-medium mb-1">{item.title}</p>
                <p className="text-[#94a3b8] text-xs leading-relaxed">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center mt-8">
        <Link href="/diagnostic" className="text-[#94a3b8] text-sm hover:text-white transition-colors">
          ← Check another channel
        </Link>
      </div>
    </div>
  );
}

export default function DiagnosticReportPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">
            TALLY
          </Link>
          <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
            Log in
          </Link>
        </div>
      </nav>

      <Suspense
        fallback={
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4 max-w-md mx-auto mt-24">
            <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
            Loading your report...
          </div>
        }
      >
        <ReportContent />
      </Suspense>

      <footer className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">
              Terms of Service
            </Link>
            <span className="text-[#64748b] text-xs">© 2026 TALLY. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
