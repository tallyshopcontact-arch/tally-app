"use client";

// Admin batch artist scorer — replaces /admin/insights for brief production.
// Paste up to 50 artist names and get every one ranked by a SubK Score (how
// winnable the niche is for a sub-1,000-subscriber producer right now),
// computed from lib/reports/nicheCache.ts's shared niche cache — same
// shared-secret admin auth pattern as every other /admin/* tool.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ArtistScoreResult } from "@/app/api/admin/scores/batch/route";

// ── Login gate — same shared-secret pattern as every other /admin/* tool ──

function LoginGate({ onAuth }: { onAuth: (password: string) => void }) {
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
      else onAuth(password);
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
        <h1 className="text-2xl font-bold mb-2">Scores</h1>
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

// ── Helpers ───────────────────────────────────────────────────────────────

const GENRES = ["", "Boom Bap", "Trap", "Drill", "Lo-Fi", "R&B", "Pop", "Afrobeats", "Reggaeton", "UK Drill", "Jersey Club"];

function parseArtistNames(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scoreColor(score: number): string {
  if (score >= 70) return "#4ade80";
  if (score >= 50) return "#fbbf24";
  if (score >= 30) return "#fb923c";
  return "#f87171";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-[#4ade80]/10";
  if (score >= 50) return "bg-[#fbbf24]/10";
  if (score >= 30) return "bg-[#fb923c]/10";
  return "bg-[#f87171]/10";
}

type SortKey = "rank" | "artistName" | "subKScore" | "cached";
type SortDir = "asc" | "desc";

// Small inline component bar — a label, a fixed-width bar, and the weight
// this component contributes to subKScore. `value` is always the already
// 0-100-normalized component (the same number subKScore's formula uses), so
// the bar's fill directly reflects that component's contribution.
function ComponentBar({ label, value, display, weight }: {
  label: string;
  value: number;
  display: string;
  weight: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-[#94a3b8] w-36 shrink-0">{label}</span>
      <span className="text-white font-medium w-20 shrink-0">{display}</span>
      <div className="flex-1 h-1.5 bg-[#1a1a1a] max-w-[160px]">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: scoreColor(value) }}
        />
      </div>
      <span className="text-[#475569] w-20 shrink-0 text-right">{weight}% of score</span>
    </div>
  );
}

function ResultRow({ result, rank, expanded, onToggle }: {
  result: ArtistScoreResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors cursor-pointer"
      >
        <td className="px-5 py-4 text-[#94a3b8] text-sm font-mono">{rank}</td>
        <td className="px-5 py-4 text-white font-medium">{result.artistName}</td>
        <td className="px-5 py-4">
          <span className={`inline-flex items-center justify-center w-14 h-9 text-lg font-bold ${scoreBg(result.subKScore)}`}
            style={{ color: scoreColor(result.subKScore) }}>
            {result.subKScore}
          </span>
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-0.5">
            {[
              { v: result.smallChannelWinRate, w: 40 },
              { v: 100 - result.saturation, w: 25 },
              { v: result.demand, w: 20 },
              { v: result.velocityCeiling, w: 15 },
            ].map((c, i) => (
              <div key={i} className="h-4 bg-[#1a1a1a]" style={{ width: `${c.w * 0.9}px` }}>
                <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, c.v))}%`, backgroundColor: scoreColor(c.v) }} />
              </div>
            ))}
          </div>
        </td>
        <td className="px-5 py-4 text-[#94a3b8] text-sm">{result.topCoMention ?? "—"}</td>
        <td className="px-5 py-4">
          <span className="text-[10px] px-2 py-0.5 font-medium" style={{ color: scoreColor(result.subKScore), backgroundColor: `${scoreColor(result.subKScore)}1a` }}>
            {result.verdict}
          </span>
        </td>
        <td className="px-5 py-4">
          <span className={`w-2 h-2 rounded-full inline-block ${result.cached ? "bg-[#4ade80]" : "bg-[#60a5fa]"}`}
            title={result.cached ? "Cached — zero quota spent" : "Newly analyzed this request"} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#1a1a1a] bg-[#0d0d0d]">
          <td colSpan={7} className="px-5 py-5">
            <div className="space-y-2.5 max-w-2xl">
              <ComponentBar
                label="Small-channel wins"
                value={result.smallChannelWinRate}
                display={`${result.smallChannelWinRate}%`}
                weight={40}
              />
              <ComponentBar
                label="Upload competition"
                value={100 - result.saturation}
                display={result.saturation < 34 ? "Low" : result.saturation < 67 ? "Moderate" : "High"}
                weight={25}
              />
              <ComponentBar
                label="Search demand"
                value={result.demand}
                display={result.demand < 34 ? "Low" : result.demand < 67 ? "Moderate" : "High"}
                weight={20}
              />
              <ComponentBar
                label="Velocity ceiling"
                value={result.velocityCeiling}
                display={`${result.medianViewsPerDay} views/day`}
                weight={15}
              />
              <p className="text-[#cbd5e1] text-xs leading-relaxed pt-2 border-t border-[#1a1a1a] mt-3">
                {result.summary}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────

function ScoresBuilder({ password }: { password: string }) {
  const [namesInput, setNamesInput] = useState("");
  const [genre, setGenre] = useState("Boom Bap");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ArtistScoreResult[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState<string[]>([]);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("subKScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const parsedNames = useMemo(() => parseArtistNames(namesInput), [namesInput]);
  const overLimit = parsedNames.length > 50;

  const handleScoreAll = async () => {
    if (!parsedNames.length || overLimit) return;
    setLoading(true);
    setError("");
    setResults([]);
    setPending([]);
    setQuotaExceeded([]);
    try {
      const res = await fetch("/api/admin/scores/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ artistNames: parsedNames, genre: genre || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Scoring failed.");
        return;
      }
      setResults(data.results ?? []);
      setPending(data.pending ?? []);
      setQuotaExceeded(data.quotaExceeded ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "artistName" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const withRank = results
      .slice()
      .sort((a, b) => b.subKScore - a.subKScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const dir = sortDir === "asc" ? 1 : -1;
    return withRank.sort((a, b) => {
      switch (sortKey) {
        case "artistName":
          return dir * a.artistName.localeCompare(b.artistName);
        case "cached":
          return dir * (Number(a.cached) - Number(b.cached));
        case "rank":
          return dir * (a.rank - b.rank);
        case "subKScore":
        default:
          return dir * (a.subKScore - b.subKScore);
      }
    });
  }, [results, sortKey, sortDir]);

  const cachedCount = results.filter((r) => r.cached).length;

  const columns: { key: SortKey | null; label: string }[] = [
    { key: "rank", label: "Rank" },
    { key: "artistName", label: "Artist" },
    { key: "subKScore", label: "SubK Score" },
    { key: null, label: "Breakdown" },
    { key: null, label: "Top Co-mention" },
    { key: null, label: "Verdict" },
    { key: "cached", label: "Cached" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Scores</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Batch artist scorer — paste up to 50 names, get every one ranked by SubK Score (how winnable the niche is for a sub-1,000-subscriber producer right now).
        </p>

        {/* Input */}
        <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 mb-8">
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
            Artist Names (comma-separated)
          </label>
          <textarea
            value={namesInput}
            onChange={(e) => setNamesInput(e.target.value)}
            placeholder="MF DOOM, Roc Marciano, Alchemist, Griselda, Boldy James, ..."
            rows={6}
            className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-y"
          />
          <div className="flex items-center justify-between mt-2 mb-4">
            <p className={`text-[10px] ${overLimit ? "text-[#f87171]" : "text-[#475569]"}`}>
              {parsedNames.length}/50 artists {overLimit && "— trim to 50 or fewer"}
            </p>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
                Genre (for new artists)
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="bg-[#111] border border-[#1e1e1e] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g || "None"}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleScoreAll}
              disabled={loading || !parsedNames.length || overLimit}
              className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
            >
              {loading ? "Scoring..." : "Score All"}
            </button>
          </div>
          {error && <p className="text-[#f87171] text-sm mt-4">{error}</p>}
        </div>

        {/* Notices */}
        {(pending.length > 0 || quotaExceeded.length > 0) && (
          <div className="space-y-2 mb-6">
            {pending.length > 0 && (
              <p className="text-xs text-[#fbbf24] bg-[#fbbf24]/10 px-4 py-2.5">
                New-artist cap reached this request — queued for a follow-up run: {pending.join(", ")}
              </p>
            )}
            {quotaExceeded.length > 0 && (
              <p className="text-xs text-[#f87171] bg-[#f87171]/10 px-4 py-2.5">
                Quota exceeded — try again tomorrow: {quotaExceeded.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#94a3b8]">
                {results.length} scored · {cachedCount} cache-warm (zero quota) · {results.length - cachedCount} newly analyzed
              </p>
            </div>
            <div className="border border-[#1a1a1a] overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    {columns.map((col) => (
                      <th
                        key={col.label}
                        onClick={col.key ? () => toggleSort(col.key as SortKey) : undefined}
                        className={`text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium ${
                          col.key ? "cursor-pointer hover:text-white select-none" : ""
                        }`}
                      >
                        {col.label}
                        {col.key && sortKey === col.key && (sortDir === "desc" ? " ▾" : " ▴")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <ResultRow
                      key={r.artistName}
                      result={r}
                      rank={r.rank}
                      expanded={expandedName === r.artistName}
                      onToggle={() => setExpandedName(expandedName === r.artistName ? null : r.artistName)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#475569] text-sm">Paste artist names and click &quot;Score All&quot; to rank them.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminScoresPage() {
  const [auth, setAuth] = useState<{ password: string } | null>(null);

  if (!auth) {
    return <LoginGate onAuth={(password) => setAuth({ password })} />;
  }
  return <ScoresBuilder password={auth.password} />;
}
