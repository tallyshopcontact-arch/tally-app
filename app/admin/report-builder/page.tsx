"use client";

// Report Builder — generates a Tally growth report HTML file from any
// YouTube channel URL. Same shared-secret admin auth pattern as /admin/cards,
// /admin/insights, and /admin/prospects (each of those pages keeps its own
// copy of this LoginGate rather than importing a shared one — following that
// same convention here).
import { useState } from "react";
import Link from "next/link";
import type { ChannelAnalysis } from "@/lib/reports/channelAnalyzer";

// ── Login gate ────────────────────────────────────────────────────────────

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
        <h1 className="text-2xl font-bold mb-2">Report Builder</h1>
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

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "channel";
}

function downloadFilename(channelName: string, month: number, year: number): string {
  const mm = String(month).padStart(2, "0");
  return `tally_report_${slugify(channelName)}_${mm}${year}.html`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Defaults to the previous completed calendar month — a report about the
// current month mid-way through would be misleading (see channelAnalyzer.ts).
function getDefaultMonthYear(): { month: number; year: number } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  return currentMonth === 1
    ? { month: 12, year: currentYear - 1 }
    : { month: currentMonth - 1, year: currentYear };
}

// ── Builder ───────────────────────────────────────────────────────────────

function ReportBuilder({ password }: { password: string }) {
  const [channelUrl, setChannelUrl] = useState("");
  const defaultMonthYear = getDefaultMonthYear();
  const [month, setMonth] = useState<number>(defaultMonthYear.month);
  const [year, setYear] = useState<number>(defaultMonthYear.year);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analysis, setAnalysis] = useState<ChannelAnalysis | null>(null);

  const [experiment, setExperiment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!channelUrl.trim() || !month || !year) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setAnalysis(null);
    setReportHtml(null);
    try {
      const res = await fetch("/api/admin/report-builder/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), month, year }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error ?? "Analysis failed");
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setAnalyzeError("Network error.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!analysis || !experiment.trim()) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const res = await fetch("/api/admin/report-builder/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ analysis, experiment, month, year }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "Report generation failed");
        return;
      }
      setReportHtml(data.html);
    } catch {
      setGenerateError("Network error.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!reportHtml || !analysis) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename(analysis.channel.channelName, month, year);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Report Builder</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Generate a growth report from any YouTube channel URL. Analysis takes 5-10 seconds.
        </p>

        {/* Report month/year */}
        <div className="mb-4 flex gap-3">
          <div className="w-40">
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Report Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              required
              className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Report Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
              className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
            >
              {[0, 1, 2].map((back) => {
                const y = new Date().getFullYear() - back;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Channel URL input */}
        <div className="mb-8">
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">YouTube Channel URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !analyzing && handleAnalyze()}
              placeholder="youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name"
              className="flex-1 bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !channelUrl.trim() || !month || !year}
              className="text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {analyzing ? "Analyzing..." : "Analyze Channel"}
            </button>
          </div>
          {analyzeError && <p className="text-[#f87171] text-xs mt-2">{analyzeError}</p>}
        </div>

        {/* Loading state */}
        {analyzing && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center mb-8">
            <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[#94a3b8] text-sm">Pulling channel data and scoring niches — this takes 5-10 seconds.</p>
          </div>
        )}

        {/* Analysis preview */}
        {analysis && !analyzing && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 mb-8">
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">{analysis.channel.channelName}</h2>
                <p className="text-[#94a3b8] text-sm">{analysis.channel.subscriberCount.toLocaleString()} subscribers · {analysis.channel.videoCount.toLocaleString()} total videos</p>
              </div>
              {analysis.limitedData && (
                <span className="text-[10px] text-[#fbbf24] bg-[#fbbf24]/10 px-2.5 py-1">
                  Limited data — only {analysis.recentUploads.length} upload{analysis.recentUploads.length === 1 ? "" : "s"} found
                </span>
              )}
            </div>

            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Detected Niches</p>
            {analysis.detectedNiches.length === 0 ? (
              <p className="text-[#475569] text-sm mb-5">No niches detected from recent uploads.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-6">
                {analysis.detectedNiches.map((n) => (
                  <span
                    key={`${n.laneId ?? "untracked"}-${n.artistName}`}
                    className={`text-xs px-3 py-1.5 border ${n.laneId ? "border-[#1a1a1a] text-white" : "border-[#1a1a1a] text-[#94a3b8]"}`}
                  >
                    {n.artistName}
                    <span className="text-[#475569]"> · {n.uploadCount} upload{n.uploadCount === 1 ? "" : "s"} · {formatCount(n.avgViewsPerDay)}/day</span>
                    {!n.laneId && <span className="text-[10px] text-[#475569]"> (untracked)</span>}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
                Experiment (Section 5 — written by you)
              </label>
              <textarea
                value={experiment}
                onChange={(e) => setExperiment(e.target.value)}
                placeholder='e.g. "Drop Drake for 30 days and reallocate those slots to Veeze."'
                rows={3}
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
              />
              <p className={`text-[10px] mt-1.5 ${experiment.trim() ? "text-[#475569]" : "text-[#f87171]"}`}>
                {experiment.trim() ? "This becomes Section 5 of the report." : "Add an experiment before generating"}
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !experiment.trim()}
              className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
            >
              {generating ? "Generating..." : "Generate Report"}
            </button>
            {generateError && <p className="text-[#f87171] text-xs mt-2">{generateError}</p>}
          </div>
        )}

        {/* Report result */}
        {reportHtml && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Report Preview</h2>
              <button
                onClick={handleDownload}
                className="text-sm font-semibold bg-white text-black px-5 py-2.5 hover:bg-[#e8e8e8] transition-colors"
              >
                Download HTML
              </button>
            </div>
            <div className="border border-[#1a1a1a] bg-[#0d0d0d]">
              <iframe
                srcDoc={reportHtml}
                title="Report preview"
                className="w-full"
                style={{ height: "80vh", border: "none" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ReportBuilderPage() {
  const [password, setPassword] = useState<string | null>(null);

  if (!password) {
    return <LoginGate onAuth={setPassword} />;
  }
  return <ReportBuilder password={password} />;
}
