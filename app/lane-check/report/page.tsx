"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import ScoreMeter from "../components/ScoreMeter";
import StatusBadge, { type LaneStatusColor } from "../components/StatusBadge";
import TopVideosThisLane, { type GalleryVideo } from "../components/TopVideosThisLane";
import TitleGenerator from "../components/TitleGenerator";

// ── Types (mirrors lib/lanes/present.ts response shapes) ───────────────────

interface LaneSummary {
  laneId: string;
  laneSlug: string;
  displayName: string;
  status: "ready" | "queued";
  opportunity?: number;
  statusColor?: LaneStatusColor;
  verdict?: string;
  demand?: number;
  saturation?: number;
  winnability?: number;
  momentum?: number | null;
}

interface PatternStats {
  winnerCount: number;
  freePrefixPct: number;
  quotedNamePct: number;
  coMentionPct: number;
  topCoMentions: { artist: string; count: number; pct: number }[];
  medianTitleLength: number;
  medianDurationSeconds: number;
  medianTagCount: number;
  topTags: { tag: string; count: number }[];
  empty: boolean;
}

interface FullLaneDetail extends LaneSummary {
  patterns: PatternStats;
  winnerVideos: GalleryVideo[];
  topVideos: GalleryVideo[];
}

type LaneResult = LaneSummary | FullLaneDetail;

function isFull(l: LaneResult): l is FullLaneDetail {
  return "patterns" in l;
}

interface TrendingArtist {
  artist: string;
  count: number;
}

interface BestOpenLane {
  laneId: string;
  laneSlug: string;
  displayName: string;
  opportunity: number;
  statusColor: LaneStatusColor;
  daysAgo: number;
}

interface ReportData {
  laneCheckId: string;
  genre: string;
  generatedAt: string;
  isPaid: boolean;
  results: LaneResult[];
  trendingArtists: TrendingArtist[];
  bestOpenLane: BestOpenLane | null;
  cta: { signupUrl: string; foundingSeatsRemain: boolean; promoCode: string | null; message: string };
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

// ── Full lane section (top lane, or every lane when paid) ──────────────────

function FullLaneSection({ result, isPaid }: { result: FullLaneDetail; isPaid: boolean }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8 mb-4">
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">{result.displayName}</p>
      <div className="mb-3">
        <ScoreMeter score={result.opportunity ?? 0} />
      </div>
      {result.demand !== undefined && result.winnability !== undefined && result.saturation !== undefined && (
        <div className="mb-4">
          <p className="text-[10px] text-[#64748b] font-medium tracking-[0.2em] uppercase mb-1.5">
            How we scored this lane
          </p>
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            Demand <span className="text-white">{result.demand}</span> × 40% + Winnability{" "}
            <span className="text-white">{result.winnability}</span> × 45% + Openness{" "}
            <span className="text-white">{100 - result.saturation}</span> × 15% ={" "}
            <span className="text-white font-semibold">{result.opportunity}</span>
          </p>
        </div>
      )}
      {result.statusColor && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <StatusBadge status={result.statusColor} />
          <span className="text-[#94a3b8] text-sm">{result.verdict}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 pb-8 border-b border-[#1a1a1a]">
        <div>
          <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Demand</p>
          <p className="text-lg font-semibold">{result.demand}</p>
          <p className="text-[#64748b] text-[11px] leading-snug mt-1">How many views recent uploads in this lane are getting on average</p>
        </div>
        <div>
          <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Saturation</p>
          <p className="text-lg font-semibold">{result.saturation}</p>
          <p className="text-[#64748b] text-[11px] leading-snug mt-1">How many videos are competing in this lane right now (lower is better)</p>
        </div>
        <div>
          <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Winnability</p>
          <p className="text-lg font-semibold">{result.winnability}</p>
          <p className="text-[#64748b] text-[11px] leading-snug mt-1">% of top performers that came from channels under 3K subscribers</p>
        </div>
        <div>
          <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Momentum</p>
          <p className="text-lg font-semibold" style={{ color: (result.momentum ?? 0) > 0 ? "#e8833a" : undefined }}>
            {result.momentum === null || result.momentum === undefined
              ? "New"
              : `${result.momentum >= 0 ? "+" : ""}${result.momentum}`}
          </p>
          <p className="text-[#64748b] text-[11px] leading-snug mt-1">How this lane is trending vs. the previous analysis period</p>
        </div>
      </div>

      {result.patterns.empty ? (
        <p className="text-[#94a3b8] text-sm mb-8">
          No small channels cracked this lane in the last 60 days.
        </p>
      ) : (
        <div className="mb-8">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Patterns among small-channel winners
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">[FREE]-prefixed</p><p className="text-sm">{result.patterns.freePrefixPct}%</p></div>
            <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Quoted beat name</p><p className="text-sm">{result.patterns.quotedNamePct}%</p></div>
            <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Median duration</p><p className="text-sm">{formatDuration(result.patterns.medianDurationSeconds)}</p></div>
          </div>
          {result.patterns.topTags.length > 0 && (
            <div className="mb-4">
              <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-2">Winning tags in this lane</p>
              <div className="flex flex-wrap gap-1.5">
                {result.patterns.topTags.map((t) => (
                  <span key={t.tag} className="text-[10px] bg-[#0a0a0a] border border-[#1a1a1a] text-[#94a3b8] px-2 py-0.5">
                    {t.tag} ({t.count})
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.patterns.topCoMentions.length > 0 && (
            <div>
              <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-2">Co-mentioned artists (paid)</p>
              <div className="space-y-1.5">
                {result.patterns.topCoMentions.slice(0, 8).map((c) => (
                  <div key={c.artist} className="flex items-center justify-between text-sm">
                    <span className="text-[#94a3b8]">{c.artist}</span>
                    <span>{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TopVideosThisLane videos={result.topVideos} />

      {isPaid && <TitleGenerator laneId={result.laneId} />}
    </div>
  );
}

// ── Locked lane card (rank 2-3, non-paid) ───────────────────────────────────

function LockedLaneCard({ result }: { result: LaneSummary }) {
  return (
    <div className="bg-[#0a0a0a] p-5 opacity-50">
      <div className="flex items-center gap-1.5 mb-2">
        <Lock className="w-3 h-3 text-[#475569] shrink-0" />
        <p className="text-[#94a3b8] text-xs uppercase tracking-widest">{result.displayName}</p>
      </div>
      <p className="text-2xl font-bold text-[#2a2a2a] mb-1 font-[family-name:var(--font-display)]">
        {result.opportunity}<span className="text-sm">/100</span>
      </p>
      <p className="text-[#2a2a2a] text-xs leading-relaxed">{result.verdict}</p>
    </div>
  );
}

// ── Content ──────────────────────────────────────────────────────────────

function ReportContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const laneCheckId = searchParams.get("laneCheckId");

  const hasIdentifier = !!(token || laneCheckId);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(hasIdentifier ? "loading" : "error");
  const [error, setError] = useState(hasIdentifier ? "" : "Missing report link. Check the link in your email and try again.");
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!hasIdentifier) return;

    (async () => {
      try {
        const qs = token ? `token=${encodeURIComponent(token)}` : `laneCheckId=${encodeURIComponent(laneCheckId!)}`;
        const res = await fetch(`/api/lane-check/report?${qs}`);
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
  }, [token, laneCheckId, hasIdentifier]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4 max-w-md mx-auto mt-24">
        <div className="w-4 h-4 border border-[#475569] border-t-[#e8833a] rounded-full animate-spin shrink-0" />
        Loading your lane check...
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="max-w-sm mx-auto mt-24 text-center px-6">
        <h1 className="text-2xl font-bold mb-3">Report not found</h1>
        <p className="text-[#94a3b8] text-sm mb-6">{error}</p>
        <Link
          href="/lane-check"
          className="inline-block text-[#0a0a0a] text-sm font-semibold px-6 py-3 hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a]"
          style={{ backgroundColor: "#e8833a" }}
        >
          Run a new lane check →
        </Link>
      </div>
    );
  }

  const [topResult, ...rest] = data.results;

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-24">
      {isFull(topResult) ? (
        <FullLaneSection result={topResult} isPaid={data.isPaid} />
      ) : (
        <LockedLaneCard result={topResult} />
      )}

      {rest.length > 0 && (
        <div className="mb-10">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4 mt-6">
            {data.isPaid ? "Your other lanes" : "Locked lanes"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#1a1a1a]">
            {rest.map((r) => (isFull(r) ? <FullLaneSection key={r.laneId} result={r} isPaid={data.isPaid} /> : <LockedLaneCard key={r.laneId} result={r} />))}
          </div>
        </div>
      )}

      {data.bestOpenLane && (
        <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8 mt-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Best open lane in {data.genre} right now
          </p>
          <p className="text-lg font-bold mb-3">{data.bestOpenLane.displayName}</p>
          <div className="mb-3">
            <ScoreMeter score={data.bestOpenLane.opportunity} />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <StatusBadge status={data.bestOpenLane.statusColor} />
          </div>
          <p className="text-[#94a3b8] text-sm mb-5">
            Scored {data.bestOpenLane.opportunity}/100 when we analyzed it {formatDaysAgo(data.bestOpenLane.daysAgo)}.
          </p>
          <Link
            href={`/lane-check?artist=${encodeURIComponent(data.bestOpenLane.displayName)}`}
            className="inline-block text-[#0a0a0a] text-sm font-semibold px-4 py-2.5 hover:brightness-110 transition-all"
            style={{ backgroundColor: "#e8833a" }}
          >
            Check this lane →
          </Link>
        </div>
      )}

      {data.trendingArtists.length > 0 && (
        <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8 mt-6">
          <p className="text-sm font-semibold mb-4">
            Producers winning in {data.genre} are also targeting these artists:
          </p>
          <div className="space-y-3">
            {data.trendingArtists.map((t) => (
              <div key={t.artist} className="flex items-center justify-between gap-4">
                <span className="text-[#cbd5e1] text-sm">{t.artist}</span>
                <Link
                  href={`/lane-check?artist=${encodeURIComponent(t.artist)}`}
                  className="shrink-0 text-xs text-[#0a0a0a] font-semibold px-3 py-2 hover:brightness-110 transition-all"
                  style={{ backgroundColor: "#e8833a" }}
                >
                  Check this lane →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data.isPaid && (
        <div className="border border-white/20 p-8 mt-6">
          <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-2">See every lane, every time</p>
          <p className="text-[#94a3b8] text-sm leading-relaxed mb-6">{data.cta.message}</p>
          <a
            href={data.cta.promoCode ? `${data.cta.signupUrl}?promo=${data.cta.promoCode}` : data.cta.signupUrl}
            className="block text-center text-[#0a0a0a] text-sm font-bold py-4 hover:brightness-110 transition-all"
            style={{ backgroundColor: "#e8833a" }}
          >
            Start free trial →
          </a>
        </div>
      )}

      <div className="text-center mt-8">
        <Link href="/lane-check" className="text-[#94a3b8] text-sm hover:text-white transition-colors">
          ← Check different lanes
        </Link>
      </div>
    </div>
  );
}

export default function LaneCheckReportPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Log in</Link>
        </div>
      </nav>

      <Suspense
        fallback={
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4 max-w-md mx-auto mt-24">
            <div className="w-4 h-4 border border-[#475569] border-t-[#e8833a] rounded-full animate-spin shrink-0" />
            Loading your lane check...
          </div>
        }
      >
        <ReportContent />
      </Suspense>

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
