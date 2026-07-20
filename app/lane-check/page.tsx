"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ScoreMeter from "./components/ScoreMeter";
import StatusBadge, { type LaneStatusColor } from "./components/StatusBadge";
import TopVideosThisLane, { type GalleryVideo } from "./components/TopVideosThisLane";
import TitleGenerator from "./components/TitleGenerator";

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

interface RunResponse {
  laneCheckId: string;
  isPaid: boolean;
  results: LaneResult[];
  requiresEmail: boolean;
}

type PageStatus = "idle" | "loading" | "results" | "error";
type EmailStatus = "idle" | "loading" | "sent" | "error";

const GENRES = ["Boom Bap", "Trap", "Drill", "UK Drill", "Melodic", "R&B", "West Coast", "Afrobeats"];

const inputClass =
  "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a] transition-colors";
const labelClass = "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

// ── Turnstile widget — renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set ──

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
  }
}

function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    const render = () => {
      if (containerRef.current && window.turnstile) {
        window.turnstile.render(containerRef.current, { sitekey: siteKey, theme: "dark", callback: onVerify });
      }
    };
    if (window.turnstile) { render(); return; }
    const scriptId = "cf-turnstile-script";
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = render;
    document.body.appendChild(script);
  }, [siteKey, onVerify]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="mb-4" />;
}

// ── Lane row (results list on this page — score/meter/verdict) ─────────────

const STAGGER_MS = 600;

function LaneRow({ result, index }: { result: LaneResult; index: number }) {
  return (
    <div
      className="bg-[#0a0a0a] p-5 tab-content"
      style={{ animationDelay: `${index * STAGGER_MS}ms`, animationFillMode: "backwards" }}
    >
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">{result.displayName}</p>
      <div className="space-y-3">
        <ScoreMeter score={result.opportunity ?? 0} size="sm" />
        <div className="flex items-center gap-2 flex-wrap">
          {result.statusColor && <StatusBadge status={result.statusColor} />}
          <span className="text-[#94a3b8] text-xs">{result.verdict}</span>
        </div>
      </div>
    </div>
  );
}

// ── Full lane detail (rendered inline when the caller is already paid) ─────

function FullLaneCard({ result, index }: { result: FullLaneDetail; index: number }) {
  return (
    <div
      className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 tab-content"
      style={{ animationDelay: `${index * STAGGER_MS}ms`, animationFillMode: "backwards" }}
    >
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">{result.displayName}</p>
      <div className="mb-4">
        <ScoreMeter score={result.opportunity ?? 0} />
      </div>
      {result.statusColor && (
        <div className="mb-4">
          <StatusBadge status={result.statusColor} />
        </div>
      )}
      {!result.patterns.empty && (
        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          <div><span className="text-[#64748b] text-xs">[FREE]-prefixed</span><p>{result.patterns.freePrefixPct}%</p></div>
          <div><span className="text-[#64748b] text-xs">Quoted beat name</span><p>{result.patterns.quotedNamePct}%</p></div>
          <div><span className="text-[#64748b] text-xs">Median duration</span><p>{Math.floor(result.patterns.medianDurationSeconds / 60)}:{String(result.patterns.medianDurationSeconds % 60).padStart(2, "0")}</p></div>
          <div><span className="text-[#64748b] text-xs">Median tags</span><p>{result.patterns.medianTagCount}</p></div>
        </div>
      )}
      <TopVideosThisLane videos={result.topVideos} />

      <TitleGenerator laneId={result.laneId} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

function LaneCheckForm() {
  const searchParams = useSearchParams();
  const prefilledChannel = searchParams.get("channel") ?? "";

  const [artists, setArtists] = useState(["", "", ""]);
  const [genre, setGenre] = useState("");
  const [channelId, setChannelId] = useState(prefilledChannel);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RunResponse | null>(null);
  const [loadingArtists, setLoadingArtists] = useState<string[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailError, setEmailError] = useState("");

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageStatus("loading");
    setErrorMessage("");

    const activeArtists = artists.map((a) => a.trim()).filter(Boolean);
    setLoadingArtists(activeArtists);
    setLoadingIndex(0);
    // Cycles through each artist's name every ~3.5s so the wait feels like
    // per-lane progress, even though /run resolves all 3 in one response.
    loadingIntervalRef.current = setInterval(() => {
      setLoadingIndex((i) => (i + 1) % activeArtists.length);
    }, 3500);

    try {
      const res = await fetch("/api/lane-check/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artists: activeArtists,
          genre,
          channelId: channelId.trim() || undefined,
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPageStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(data);
      setPageStatus("results");
    } catch {
      setPageStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    } finally {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
    };
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    setEmailStatus("loading");
    setEmailError("");

    try {
      const res = await fetch("/api/lane-check/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneCheckId: result.laneCheckId, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEmailStatus("error");
        setEmailError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
      setEmailError("Network error. Please check your connection and try again.");
    }
  };

  const reset = () => {
    setArtists(["", "", ""]);
    setGenre("");
    setResult(null);
    setPageStatus("idle");
    setErrorMessage("");
    setEmail("");
    setEmailStatus("idle");
    setEmailError("");
  };

  return (
    <section className="max-w-2xl mx-auto px-6 pt-16 pb-24">
      <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-6">
        Free Lane Check
      </p>
      <h1 className="font-[family-name:var(--font-display)] font-bold text-4xl md:text-5xl leading-[1.1] tracking-tight mb-6">
        Which artists should your next beat target?
      </h1>
      <p className="text-[#cbd5e1] text-base leading-relaxed mb-10">
        Enter up to 3 artists your beat sounds like and your genre. We&apos;ll score each lane on
        demand, competition, and how winnable it is for a small channel right now.
      </p>

      {pageStatus !== "results" && (
        <form onSubmit={handleRun} className="space-y-5">
          {artists.map((val, i) => (
            <div key={i}>
              <label htmlFor={`artist-${i}`} className={labelClass}>
                Artist {i + 1}{i > 0 ? " (optional)" : ""}
              </label>
              <input
                id={`artist-${i}`}
                type="text"
                required={i === 0}
                disabled={pageStatus === "loading"}
                value={val}
                onChange={(e) => {
                  const next = [...artists];
                  next[i] = e.target.value;
                  setArtists(next);
                  if (pageStatus === "error") setPageStatus("idle");
                }}
                placeholder="e.g. MF DOOM"
                className={inputClass}
              />
            </div>
          ))}

          <div>
            <label htmlFor="genre" className={labelClass}>Genre</label>
            <select
              id="genre"
              required
              disabled={pageStatus === "loading"}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className={`${inputClass} appearance-none cursor-pointer`}
            >
              <option value="" disabled>Select your genre</option>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="channelId" className={labelClass}>Your YouTube Channel (optional)</label>
            <input
              id="channelId"
              type="text"
              disabled={pageStatus === "loading"}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="@yourchannel"
              className={inputClass}
            />
          </div>

          <TurnstileWidget onVerify={setTurnstileToken} />

          {pageStatus === "error" && <p className="text-[#f87171] text-sm">{errorMessage}</p>}

          <button
            type="submit"
            disabled={pageStatus === "loading"}
            className="w-full text-[#0a0a0a] text-sm font-semibold py-3.5 hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a]"
            style={{ backgroundColor: "#e8833a" }}
          >
            {pageStatus === "loading" && (
              <span className="w-4 h-4 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin shrink-0" />
            )}
            {pageStatus === "loading"
              ? `Analyzing ${loadingArtists[loadingIndex] ?? "your"} lane…`
              : "Analyze my lanes →"}
          </button>
          <p className="text-center text-xs text-[#475569]">No signup required. 1 free lane check per month.</p>
        </form>
      )}

      {pageStatus === "results" && result && (
        <div className="space-y-10">
          <div>
            <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-4">
              Your 3 lanes, ranked by opportunity
            </p>
            {result.isPaid ? (
              <div className="space-y-4">
                {result.results.map((r, i) =>
                  isFull(r) ? <FullLaneCard key={r.laneId} result={r} index={i} /> : <LaneRow key={r.laneId} result={r} index={i} />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-px bg-[#1a1a1a]">
                {result.results.map((r, i) => <LaneRow key={r.laneId} result={r} index={i} />)}
              </div>
            )}
          </div>

          {result.requiresEmail && (
            <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-6 py-6">
              {emailStatus === "sent" ? (
                <div>
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Check your inbox</p>
                  <p className="text-lg font-bold mb-2">Your top lane&apos;s full breakdown is on its way.</p>
                  <p className="text-[#94a3b8] text-sm leading-relaxed">
                    We sent a link to <span className="text-white">{email}</span>.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleUnlock} className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-1">See your top lane&apos;s full breakdown — free.</p>
                    <p className="text-[#94a3b8] text-xs leading-relaxed mb-4">
                      Real numbers, who&apos;s winning it, and the patterns that work.
                    </p>
                    <label htmlFor="email" className={labelClass}>Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      disabled={emailStatus === "loading"}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (emailStatus === "error") setEmailStatus("idle"); }}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                  {emailStatus === "error" && <p className="text-[#f87171] text-sm">{emailError}</p>}
                  <button
                    type="submit"
                    disabled={emailStatus === "loading"}
                    className="w-full text-[#0a0a0a] text-sm font-semibold py-3.5 hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a]"
                    style={{ backgroundColor: "#e8833a" }}
                  >
                    {emailStatus === "loading" ? "Sending…" : "Send me the full breakdown →"}
                  </button>
                </form>
              )}
            </div>
          )}

          <button onClick={reset} className="text-[#94a3b8] text-sm hover:text-white transition-colors">
            ← Check different lanes
          </button>
        </div>
      )}
    </section>
  );
}

export default function LaneCheckPage() {
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

      <Suspense fallback={null}>
        <LaneCheckForm />
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
