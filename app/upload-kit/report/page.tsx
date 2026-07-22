"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import UploadKitCard, {
  LockedLaneCard,
  AlsoConsider,
  isFull,
  type LaneResult,
  type TrendingArtist,
  type BestOpenLane,
} from "../components/UploadKitCard";

interface ReportData {
  laneCheckId: string;
  genre: string;
  beatName: string | null;
  generatedAt: string;
  isPaid: boolean;
  results: LaneResult[];
  trendingArtists: TrendingArtist[];
  bestOpenLane: BestOpenLane | null;
  cta: { signupUrl: string; foundingSeatsRemain: boolean; promoCode: string | null; message: string };
}

// ── Content ──────────────────────────────────────────────────────────────

function ReportContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const laneCheckId = searchParams.get("laneCheckId");

  const hasIdentifier = !!(token || laneCheckId);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(hasIdentifier ? "loading" : "error");
  const [error, setError] = useState(hasIdentifier ? "" : "Missing kit link. Check the link in your email and try again.");
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
          setError(json.error ?? "Kit not found.");
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
        Loading your Upload Kit...
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="max-w-sm mx-auto mt-24 text-center px-6">
        <h1 className="text-2xl font-bold mb-3">Kit not found</h1>
        <p className="text-[#94a3b8] text-sm mb-6">{error}</p>
        <Link
          href="/upload-kit"
          className="inline-block text-[#0a0a0a] text-sm font-semibold px-6 py-3 hover:brightness-110 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a]"
          style={{ backgroundColor: "#e8833a" }}
        >
          Get a new Upload Kit →
        </Link>
      </div>
    );
  }

  const [topResult, ...rest] = data.results;

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-24">
      {isFull(topResult) ? (
        <UploadKitCard result={topResult} isPaid={data.isPaid} laneCheckId={data.laneCheckId} isTopLane laneCount={data.results.length} />
      ) : (
        <LockedLaneCard result={topResult} />
      )}

      {rest.length > 0 && (
        <div className="mb-2 mt-4">
          {rest.map((r) =>
            isFull(r) ? (
              <UploadKitCard key={r.laneId} result={r} isPaid={data.isPaid} laneCheckId={data.laneCheckId} isTopLane={false} laneCount={data.results.length} />
            ) : (
              <LockedLaneCard key={r.laneId} result={r} />
            )
          )}
        </div>
      )}

      {isFull(topResult) && (
        <AlsoConsider trendingArtists={data.trendingArtists} bestOpenLane={data.bestOpenLane} isPaid={data.isPaid} genre={data.genre} />
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
        <Link href="/upload-kit" className="text-[#94a3b8] text-sm hover:text-white transition-colors">
          ← Check different lanes
        </Link>
      </div>
    </div>
  );
}

export default function UploadKitReportPage() {
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
            Loading your Upload Kit...
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
