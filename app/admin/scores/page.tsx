"use client";

// Admin batch artist scorer. Paste up to 50 artist names, pick a calendar
// month, and get every one ranked by a SubK Score (how winnable the niche
// was for a sub-1,000-subscriber producer that month) — same shared-secret
// admin auth pattern as every other /admin/* tool.
//
// "Force Fresh Data" (default OFF) — unchecked, an artist+month analyzed
// within the last 7 days is served from cache at zero YouTube quota cost,
// so routine exploration doesn't burn quota. Checked, every artist gets a
// real re-analysis regardless of cache age — for a monthly brief production
// run that explicitly wants dead-current numbers. This used to force-
// refresh unconditionally, which could burn 5,000+ units in one run.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ArtistScoreResult, ScoredArtist } from "@/app/api/admin/scores/batch/route";
import type { OutlierResult } from "@/app/api/admin/scores/outliers/route";
import { ESTIMATED_UNITS_PER_ANALYSIS } from "@/lib/lanes/db";

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
const MAX_ARTISTS = 50;
const MAX_OUTLIER_ARTISTS = 5;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Same default-month convention as the report builder (app/admin/report-builder/page.tsx):
// the previous COMPLETED calendar month — the current month mid-way through
// would be a misleading default for "what happened."
function getDefaultMonthYear(): { month: number; year: number } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  return currentMonth === 1
    ? { month: 12, year: currentYear - 1 }
    : { month: currentMonth - 1, year: currentYear };
}

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

function isScored(r: ArtistScoreResult): r is ScoredArtist {
  return r.subKScore !== null;
}

type SortKey = "rank" | "artistName" | "subKScore";
type SortDir = "asc" | "desc";

// Fix 2 weights — small-channel wins 25%, upload competition 25% (as
// 100-saturation), search demand 30%, velocity ceiling 20%.
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

function ResultRow({ result, rank, expanded, onToggle, selected, onSelectToggle, selectDisabled }: {
  result: ArtistScoreResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelectToggle: () => void;
  selectDisabled: boolean;
}) {
  if (!isScored(result)) {
    return (
      <tr className="border-b border-[#1a1a1a] last:border-0">
        <td className="px-5 py-4 text-[#94a3b8] text-sm font-mono">{rank}</td>
        <td className="px-5 py-4 text-white font-medium">{result.artistName}</td>
        <td className="px-5 py-4 text-[#475569] text-xs" colSpan={5}>
          <span className="inline-block px-2 py-0.5 bg-[#1a1a1a] text-[#94a3b8]">No data</span>
          <span className="ml-2">{result.reason}</span>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors">
        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            disabled={selectDisabled}
            onChange={onSelectToggle}
            className="w-3.5 h-3.5 accent-[#4ade80] disabled:opacity-30"
          />
        </td>
        <td className="px-5 py-4 text-[#94a3b8] text-sm font-mono cursor-pointer" onClick={onToggle}>{rank}</td>
        <td className="px-5 py-4 text-white font-medium cursor-pointer" onClick={onToggle}>
          {result.artistName}
          {result.isNewArtist && (
            <span className="ml-2 text-[9px] text-[#60a5fa] bg-[#60a5fa]/10 px-1.5 py-0.5 align-middle">New</span>
          )}
          <span
            className={`ml-2 w-1.5 h-1.5 rounded-full inline-block align-middle ${result.cached ? "bg-[#4ade80]" : "bg-[#fbbf24]"}`}
            title={result.cached ? "Served from cache — zero quota spent" : "Freshly analyzed this run"}
          />
        </td>
        <td className="px-5 py-4 cursor-pointer" onClick={onToggle}>
          <span className={`inline-flex items-center justify-center w-14 h-9 text-lg font-bold ${scoreBg(result.subKScore)}`}
            style={{ color: scoreColor(result.subKScore) }}>
            {result.subKScore}
          </span>
        </td>
        <td className="px-5 py-4 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-0.5">
            {[
              { v: result.smallChannelWinRate, w: 25 },
              { v: 100 - result.saturation, w: 25 },
              { v: result.demand, w: 30 },
              { v: result.velocityCeiling, w: 20 },
            ].map((c, i) => (
              <div key={i} className="h-4 bg-[#1a1a1a]" style={{ width: `${c.w * 0.9}px` }}>
                <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, c.v))}%`, backgroundColor: scoreColor(c.v) }} />
              </div>
            ))}
          </div>
        </td>
        <td className="px-5 py-4 text-[#94a3b8] text-sm cursor-pointer" onClick={onToggle}>{result.topCoMention ?? "—"}</td>
        <td className="px-5 py-4 cursor-pointer" onClick={onToggle}>
          <span className="text-[10px] px-2 py-0.5 font-medium" style={{ color: scoreColor(result.subKScore), backgroundColor: `${scoreColor(result.subKScore)}1a` }}>
            {result.verdict}
          </span>
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
                weight={25}
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
                weight={30}
              />
              <ComponentBar
                label="Velocity ceiling"
                value={result.velocityCeiling}
                display={`${result.medianViewsPerDay} views/day`}
                weight={20}
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

function OutlierCard({ result }: { result: OutlierResult }) {
  const [copied, setCopied] = useState(false);
  const copyTags = () => {
    if (!result.outlier) return;
    navigator.clipboard.writeText(result.outlier.tags.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{result.artistName}</h3>
        {result.source && (
          <span className="text-[9px] text-[#94a3b8] uppercase tracking-widest">
            {result.source === "live" ? "Live fetch" : "Zero-quota (cached)"}
          </span>
        )}
      </div>
      {!result.outlier ? (
        <p className="text-[#f87171] text-xs">{result.reason}</p>
      ) : (
        <div className="space-y-3">
          <a href={result.outlier.videoUrl} target="_blank" rel="noopener noreferrer"
            className="text-white text-sm font-medium hover:text-[#94a3b8] transition-colors block">
            {result.outlier.title}
          </a>
          <div className="flex items-center gap-4 text-xs text-[#94a3b8]">
            <span>{result.outlier.viewCount.toLocaleString()} views</span>
            <span>{result.outlier.subscriberCount.toLocaleString()} subs</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">Tags ({result.outlier.tags.length})</p>
              <button onClick={copyTags} className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-2 py-0.5 hover:border-[#333] transition-colors">
                {copied ? "Copied!" : "Copy all"}
              </button>
            </div>
            {result.outlier.tags.length === 0 ? (
              <p className="text-[#475569] text-xs">No tags on this video.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {result.outlier.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] text-[#e2e8f0] bg-[#111] border border-[#1e1e1e] px-2 py-0.5">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────

function ScoresBuilder({ password }: { password: string }) {
  const [namesInput, setNamesInput] = useState("");
  const [genre, setGenre] = useState("Boom Bap");
  const defaultMonthYear = useMemo(() => getDefaultMonthYear(), []);
  const [month, setMonth] = useState(defaultMonthYear.month);
  const [year, setYear] = useState(defaultMonthYear.year);
  const [forceFreshData, setForceFreshData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ArtistScoreResult[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState<string[]>([]);
  const [lastRunQuota, setLastRunQuota] = useState<{ quotaUnitsUsed: number; cachedCount: number; analyzedCount: number } | null>(null);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("subKScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outlierLoading, setOutlierLoading] = useState(false);
  const [outlierError, setOutlierError] = useState("");
  const [outliers, setOutliers] = useState<OutlierResult[] | null>(null);

  const parsedNames = useMemo(() => parseArtistNames(namesInput), [namesInput]);
  const overLimit = parsedNames.length > MAX_ARTISTS;
  const monthYearValid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year);
  // Worst-case estimate — every artist is a cache miss. Accurate when
  // "Force Fresh Data" is checked (every artist really is re-analyzed);
  // an upper bound otherwise, since cached artists cost nothing.
  const quotaEstimate = parsedNames.length * ESTIMATED_UNITS_PER_ANALYSIS;

  const handleScoreAll = async () => {
    if (!parsedNames.length || overLimit || !monthYearValid) return;
    setLoading(true);
    setError("");
    setResults([]);
    setQuotaExceeded([]);
    setLastRunQuota(null);
    setSelected(new Set());
    setOutliers(null);
    setOutlierError("");
    try {
      const res = await fetch("/api/admin/scores/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ artistNames: parsedNames, genre: genre || null, month, year, forceRefresh: forceFreshData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Scoring failed.");
        return;
      }
      setResults(data.results ?? []);
      setQuotaExceeded(data.quotaExceeded ?? []);
      setLastRunQuota({
        quotaUnitsUsed: data.quotaUnitsUsed ?? 0,
        cachedCount: data.cachedCount ?? 0,
        analyzedCount: data.analyzedCount ?? 0,
      });
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
      .sort((a, b) => {
        if (a.subKScore === null && b.subKScore === null) return 0;
        if (a.subKScore === null) return 1;
        if (b.subKScore === null) return -1;
        return b.subKScore - a.subKScore;
      })
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const dir = sortDir === "asc" ? 1 : -1;
    return withRank.sort((a, b) => {
      switch (sortKey) {
        case "artistName":
          return dir * a.artistName.localeCompare(b.artistName);
        case "rank":
          return dir * (a.rank - b.rank);
        case "subKScore":
        default: {
          if (a.subKScore === null && b.subKScore === null) return 0;
          if (a.subKScore === null) return 1;
          if (b.subKScore === null) return -1;
          return dir * (a.subKScore - b.subKScore);
        }
      }
    });
  }, [results, sortKey, sortDir]);

  const scoredCount = results.filter(isScored).length;
  const noDataCount = results.length - scoredCount;

  const toggleSelect = (artistName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(artistName)) next.delete(artistName);
      else if (next.size < MAX_OUTLIER_ARTISTS) next.add(artistName);
      return next;
    });
  };

  const handleExtractOutliers = async () => {
    if (!selected.size) return;
    setOutlierLoading(true);
    setOutlierError("");
    setOutliers(null);
    try {
      const res = await fetch("/api/admin/scores/outliers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ artistNames: [...selected], month, year, forceRefresh: forceFreshData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOutlierError(data.error ?? "Outlier extraction failed.");
        return;
      }
      setOutliers(data.results ?? []);
    } catch {
      setOutlierError("Network error.");
    } finally {
      setOutlierLoading(false);
    }
  };

  const columns: { key: SortKey | null; label: string }[] = [
    { key: null, label: "" },
    { key: "rank", label: "Rank" },
    { key: "artistName", label: "Artist" },
    { key: "subKScore", label: "SubK Score" },
    { key: null, label: "Breakdown" },
    { key: null, label: "Top Co-mention" },
    { key: null, label: "Verdict" },
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
          Paste up to 50 artists, pick a month, and score. Uses cached data by default — check Force Fresh for live analysis.
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
              {parsedNames.length}/{MAX_ARTISTS} artists {overLimit && "— trim to 50 or fewer"}
            </p>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <div className="w-40">
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                required
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                required
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
              >
                {[0, 1, 2].map((back) => {
                  const y = new Date().getFullYear() - back;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
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
              disabled={loading || !parsedNames.length || overLimit || !monthYearValid}
              className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
            >
              {loading ? "Scoring..." : "Score All"}
            </button>
          </div>

          {/* Force refresh + quota estimate */}
          <div className="mt-5 pt-4 border-t border-[#111]">
            <label className="flex items-center gap-2.5 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={forceFreshData}
                onChange={(e) => setForceFreshData(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#f87171]"
              />
              <span className="text-sm text-white">Force Fresh Data</span>
              <span className="text-[10px] text-[#94a3b8]">
                — re-analyze every artist, ignoring the 7-day cache
              </span>
            </label>
            {parsedNames.length > 0 && (
              <p className={`text-[10px] mt-2 ${forceFreshData ? "text-[#fbbf24]" : "text-[#475569]"}`}>
                {forceFreshData
                  ? `This will use approximately ${quotaEstimate.toLocaleString()} units (${parsedNames.length} artist${parsedNames.length === 1 ? "" : "s"} × ~${ESTIMATED_UNITS_PER_ANALYSIS} units, forced fresh).`
                  : `Up to ~${quotaEstimate.toLocaleString()} units — artists analyzed within the last 7 days are served from cache at zero cost.`}
              </p>
            )}
          </div>

          {error && <p className="text-[#f87171] text-sm mt-4">{error}</p>}
        </div>

        {/* Notices */}
        {lastRunQuota && (
          <p className="text-xs text-[#94a3b8] bg-[#111] px-4 py-2.5 mb-6">
            Last run: {lastRunQuota.analyzedCount} analyzed ({lastRunQuota.quotaUnitsUsed.toLocaleString()} units spent), {lastRunQuota.cachedCount} served from cache (free).
          </p>
        )}
        {quotaExceeded.length > 0 && (
          <p className="text-xs text-[#f87171] bg-[#f87171]/10 px-4 py-2.5 mb-6">
            Quota exhausted — retry tomorrow: {quotaExceeded.join(", ")}
          </p>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <p className="text-xs text-[#94a3b8]">
                {scoredCount} scored{noDataCount > 0 ? ` · ${noDataCount} no data` : ""} for {MONTH_NAMES[month - 1]} {year}
              </p>
              <button
                onClick={handleExtractOutliers}
                disabled={outlierLoading || selected.size === 0}
                className="text-xs font-semibold bg-white text-black px-4 py-2 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
              >
                {outlierLoading ? "Extracting..." : `Extract Outliers (${selected.size}/${MAX_OUTLIER_ARTISTS})`}
              </button>
            </div>
            <div className="border border-[#1a1a1a] overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    {columns.map((col, i) => (
                      <th
                        key={i}
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
                      selected={selected.has(r.artistName)}
                      onSelectToggle={() => toggleSelect(r.artistName)}
                      selectDisabled={!selected.has(r.artistName) && selected.size >= MAX_OUTLIER_ARTISTS}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Outliers */}
        {(outlierError || outliers) && (
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-1">Outlier Videos</h2>
            <p className="text-[#94a3b8] text-xs mb-4">
              Highest-performing sub-1K-subscriber video per selected artist, strictly within {MONTH_NAMES[month - 1]} {year}.
            </p>
            {outlierError && <p className="text-[#f87171] text-sm mb-4">{outlierError}</p>}
            {outliers && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {outliers.map((r) => (
                  <OutlierCard key={r.artistName} result={r} />
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#475569] text-sm">Paste artist names, pick a month, and click &quot;Score All&quot; to rank them.</p>
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
