"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import UploadKitCard, {
  LockedLaneCard,
  AlsoConsider,
  isFull,
  type LaneResult,
  type TrendingArtist,
  type BestOpenLane,
} from "./components/UploadKitCard";

interface RunResponse {
  laneCheckId: string;
  beatName: string | null;
  genre: string;
  isPaid: boolean;
  results: LaneResult[];
  requiresEmail: boolean;
  trendingArtists: TrendingArtist[];
  bestOpenLane: BestOpenLane | null;
}

type PageStatus = "idle" | "loading" | "results" | "error";
type EmailStatus = "idle" | "loading" | "sent" | "error";

const GENRES = ["Boom Bap", "Trap", "Drill", "UK Drill", "Melodic", "R&B", "West Coast", "Afrobeats", "Other"];

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

// ── Form + results ───────────────────────────────────────────────────────

function UploadKitForm() {
  const searchParams = useSearchParams();
  const prefilledChannel = searchParams.get("channel") ?? "";
  const prefilledArtist = searchParams.get("artist") ?? "";
  const prefilledGenre = searchParams.get("genre") ?? "";
  const prefilledGenreIsCustom = !!prefilledGenre && !GENRES.includes(prefilledGenre);

  const [beatName, setBeatName] = useState("");
  const [artists, setArtists] = useState([prefilledArtist, ""]);
  const [genre, setGenre] = useState(prefilledGenreIsCustom ? "Other" : prefilledGenre);
  const [customGenre, setCustomGenre] = useState(prefilledGenreIsCustom ? prefilledGenre : "");
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
    loadingIntervalRef.current = setInterval(() => {
      setLoadingIndex((i) => (i + 1) % activeArtists.length);
    }, 3500);

    try {
      const res = await fetch("/api/lane-check/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beatName: beatName.trim() || undefined,
          artists: activeArtists,
          genre: genre === "Other" ? customGenre.trim() : genre,
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
    setBeatName("");
    setArtists(["", ""]);
    setGenre("");
    setCustomGenre("");
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
        Free Upload Kit
      </p>
      <h1 className="font-[family-name:var(--font-display)] font-bold text-4xl md:text-5xl leading-[1.1] tracking-tight mb-6">
        You just finished the beat. Now what?
      </h1>
      <p className="text-[#cbd5e1] text-base leading-relaxed mb-10">
        Name it, pick the artists you hear on it, and get your Upload Kit — the title, tags,
        and packaging that&apos;s winning in that lane right now.
      </p>

      {pageStatus !== "results" && (
        <form onSubmit={handleRun} className="space-y-5">
          <div>
            <label htmlFor="beatName" className={labelClass}>What&apos;s the beat called?</label>
            <input
              id="beatName"
              type="text"
              disabled={pageStatus === "loading"}
              value={beatName}
              onChange={(e) => setBeatName(e.target.value)}
              placeholder="e.g. Nightcrawler"
              className={inputClass}
            />
          </div>

          {artists.map((val, i) => (
            <div key={i}>
              <label htmlFor={`artist-${i}`} className={labelClass}>
                {i === 0 ? "Which artists do you hear on it?" : "Second artist (optional)"}
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
              onChange={(e) => {
                setGenre(e.target.value);
                if (e.target.value !== "Other") setCustomGenre("");
              }}
              className={`${inputClass} appearance-none cursor-pointer`}
            >
              <option value="" disabled>Select your genre</option>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {genre === "Other" && (
              <input
                type="text"
                required
                disabled={pageStatus === "loading"}
                value={customGenre}
                onChange={(e) => setCustomGenre(e.target.value)}
                placeholder="Enter your genre (e.g. Phonk, Cloud Rap, Dancehall...)"
                autoFocus
                className={`${inputClass} mt-2`}
              />
            )}
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
              : "Get my Upload Kit — free"}
          </button>
          <p className="text-center text-xs text-[#475569]">No signup required. 1 free upload kit per month for uncached lanes.</p>
        </form>
      )}

      {pageStatus === "results" && result && (() => {
        const [topResult, ...rest] = result.results;
        return (
          <div className="space-y-6">
            <div>
              {isFull(topResult) ? (
                <UploadKitCard result={topResult} isPaid={result.isPaid} laneCheckId={result.laneCheckId} isTopLane laneCount={result.results.length} />
              ) : (
                <LockedLaneCard result={topResult} />
              )}

              {rest.length > 0 && (
                <div className="mt-4">
                  {rest.map((r) =>
                    isFull(r) ? (
                      <UploadKitCard key={r.laneId} result={r} isPaid={result.isPaid} laneCheckId={result.laneCheckId} isTopLane={false} laneCount={result.results.length} />
                    ) : (
                      <LockedLaneCard key={r.laneId} result={r} />
                    )
                  )}
                </div>
              )}

              {isFull(topResult) && (
                <AlsoConsider trendingArtists={result.trendingArtists} bestOpenLane={result.bestOpenLane} isPaid={result.isPaid} genre={result.genre} />
              )}
            </div>

            {result.requiresEmail && (
              <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-6 py-6">
                {emailStatus === "sent" ? (
                  <div>
                    <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Check your inbox</p>
                    <p className="text-lg font-bold mb-2">Your Upload Kit is on its way.</p>
                    <p className="text-[#94a3b8] text-sm leading-relaxed">
                      We sent a link to <span className="text-white">{email}</span>.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleUnlock} className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold mb-1">Get your Upload Kit — free.</p>
                      <p className="text-[#94a3b8] text-xs leading-relaxed mb-4">
                        Titles, tags, and packaging for your top lane, built from what&apos;s
                        actually winning right now.
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
                      {emailStatus === "loading" ? "Sending…" : "Send me my Upload Kit →"}
                    </button>
                  </form>
                )}
              </div>
            )}

            <button onClick={reset} className="text-[#94a3b8] text-sm hover:text-white transition-colors">
              ← Check different lanes
            </button>
          </div>
        );
      })()}
    </section>
  );
}

// "Check this lane →" links (Also Consider, trending, etc.) navigate to
// /upload-kit?artist=...&genre=... while already on this route. A same-route
// Link transition re-renders in place rather than remounting, which is too
// fragile to rely on for resetting form state — so this wrapper forces a
// real remount via `key` whenever the target artist/genre changes, which
// guarantees UploadKitForm's useState initializers see the fresh values.
function UploadKitFormRemountOnPrefillChange() {
  const searchParams = useSearchParams();
  const formKey = `${searchParams.get("artist") ?? ""}|${searchParams.get("genre") ?? ""}`;
  return <UploadKitForm key={formKey} />;
}

export default function UploadKitPage() {
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
        <UploadKitFormRemountOnPrefillChange />
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
