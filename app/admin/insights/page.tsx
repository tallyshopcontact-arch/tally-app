"use client";

// Admin-only lane insight extractor. Read-only, stateless — every lookup is
// a fresh GET to /api/admin/insights, which reads straight off the latest
// lane_analyses row (no YouTube calls, no writes). Replaces the social card
// generator (see /admin/cards) as the tool actively used to produce
// postable facts; the card generator is left in place, not built on further.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface LaneOption {
  id: string;
  slug: string;
  displayName: string;
  opportunity: number;
}

interface LaneInsight {
  type: string;
  sentence: string;
  rawValue: number;
}

interface InsightsResponse {
  laneDisplayName: string;
  analyzedAt: string;
  insights: LaneInsight[];
}

// ── Login gate — same shared-secret pattern and lane list as /admin/cards ──

function LoginGate({ onAuth }: { onAuth: (lanes: LaneOption[], password: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cards/lanes", {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (res.status === 401) setError("Incorrect password.");
      else if (!res.ok) setError(data.error ?? "Something went wrong.");
      else onAuth(data.lanes, password);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12">TALLY</Link>
        <h1 className="text-2xl font-bold mb-2">Lane Insights</h1>
        <p className="text-[#94a3b8] text-sm mb-8">Enter the admin password to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Password"
            autoFocus
            className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors">
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Searchable lane picker — same as /admin/cards's ─────────────────────

function LanePicker({
  label,
  lanes,
  value,
  onChange,
}: {
  label: string;
  lanes: LaneOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = lanes.find((l) => l.id === value);
  const filtered = query.trim()
    ? lanes.filter((l) => l.displayName.toLowerCase().includes(query.trim().toLowerCase()))
    : lanes;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-left hover:border-[#333] transition-colors"
      >
        <span className={selected ? "text-white" : "text-[#475569]"}>
          {selected ? `${selected.displayName} — ${selected.opportunity}/100` : "Select a lane..."}
        </span>
        <span className="text-[#94a3b8] text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-[#111] border border-[#1e1e1e] max-h-64 overflow-y-auto">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lanes..."
            className="w-full bg-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-2.5 text-sm text-white placeholder:text-[#475569] focus:outline-none sticky top-0"
          />
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#94a3b8]">No lanes found.</p>
          ) : (
            filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { onChange(l.id); setQuery(""); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-[#1a1a1a] transition-colors ${
                  l.id === value ? "bg-[#1a1a1a]" : ""
                }`}
              >
                <span className="text-white">{l.displayName}</span>
                <span className="text-[#94a3b8] text-xs">{l.opportunity}/100</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Copy button ──────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-2.5 py-1 hover:border-[#333] transition-colors shrink-0"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

// ── Type labels ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  demand_percentile: "Demand percentile",
  small_channel_winnability: "Small-channel winnability",
  winning_co_mention: "Winning co-mention",
  underused_pairing: "Underused pairing gap",
  cumulative_views: "Cumulative lane views",
  breakout_video: "Breakout video",
  view_concentration: "View concentration",
};

function fmtAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ── Builder ──────────────────────────────────────────────────────────────

function InsightsBuilder({ lanes, password }: { lanes: LaneOption[]; password: string }) {
  const [laneId, setLaneId] = useState("");
  const [result, setResult] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestIdRef = useRef(0);

  const fetchInsights = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/insights?laneId=${encodeURIComponent(laneId)}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        setResult(null);
        setError(data.error ?? "Failed to load insights");
        return;
      }
      setResult(data);
    } catch {
      if (requestIdRef.current === requestId) {
        setResult(null);
        setError("Network error.");
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [laneId, password]);

  useEffect(() => {
    if (laneId) fetchInsights();
    else setResult(null);
  }, [laneId, fetchInsights]);

  const copyAllText = result ? result.insights.map((i) => i.sentence).join("\n") : "";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Lane Insights</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          The 2-3 most notable, post-worthy facts about a lane&apos;s past-month activity. Nothing here is saved.
        </p>

        <div className="mb-8">
          <LanePicker label="Lane" lanes={lanes} value={laneId} onChange={setLaneId} />
        </div>

        {!laneId ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#475569] text-sm">Select a lane to generate insights.</p>
          </div>
        ) : loading ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-8 text-center">
            <p className="text-[#f87171] text-sm">{error}</p>
          </div>
        ) : result ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#94a3b8]">
                {result.laneDisplayName} · based on data from {fmtAge(result.analyzedAt)}
              </p>
              {result.insights.length > 0 && <CopyButton text={copyAllText} label="Copy all" />}
            </div>

            {result.insights.length === 0 ? (
              <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-8 text-center">
                <p className="text-[#94a3b8] text-sm">No notable insights for this lane yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.insights.map((insight, i) => (
                  <div key={i} className="border border-[#1a1a1a] bg-[#0d0d0d] px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest">
                        {TYPE_LABELS[insight.type] ?? insight.type}
                      </span>
                      <CopyButton text={insight.sentence} label="Copy" />
                    </div>
                    <p className="text-white text-sm leading-relaxed mb-2">{insight.sentence}</p>
                    <p className="text-[#475569] text-[10px]">raw value: {insight.rawValue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminInsightsPage() {
  const [auth, setAuth] = useState<{ lanes: LaneOption[]; password: string } | null>(null);

  if (!auth) {
    return <LoginGate onAuth={(lanes, password) => setAuth({ lanes, password })} />;
  }
  return <InsightsBuilder lanes={auth.lanes} password={auth.password} />;
}
