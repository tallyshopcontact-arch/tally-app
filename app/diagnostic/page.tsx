"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types (mirrors app/api/diagnostic/run response) ────────────────────────

type CheckStatus = "pass" | "warn" | "fail";

interface TeaserFinding {
  id: string;
  category: string;
  status: CheckStatus;
  headline: string;
}

interface RunResult {
  diagnosticId: string;
  channelTitle: string;
  tallyScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  teaser: TeaserFinding[];
}

type PageStatus = "idle" | "loading" | "results" | "error";
type EmailStatus = "idle" | "loading" | "sent" | "error";

// ── Shared style primitives (from WaitlistForm.tsx / signup/page.tsx) ──────

const inputClass =
  "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";
const labelClass = "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

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

// ── Turnstile widget — renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set ──

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  }
}

function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;

    const render = () => {
      if (containerRef.current && window.turnstile) {
        window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: onVerify,
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }

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

// ── Page ─────────────────────────────────────────────────────────────────

export default function DiagnosticPage() {
  const [channelInput, setChannelInput] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailError, setEmailError] = useState("");

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/diagnostic/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelInput, turnstileToken }),
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
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    setEmailStatus("loading");
    setEmailError("");

    try {
      const res = await fetch("/api/diagnostic/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosticId: result.diagnosticId, email }),
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
    setChannelInput("");
    setResult(null);
    setPageStatus("idle");
    setErrorMessage("");
    setEmail("");
    setEmailStatus("idle");
    setEmailError("");
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Simplified nav */}
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

      <section className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-6">
          Free Channel Diagnostic
        </p>
        <h1 className="text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight mb-6">
          Find out why your beats aren&apos;t getting found.
        </h1>
        <p className="text-[#cbd5e1] text-base leading-relaxed mb-10">
          Paste your YouTube channel below. We&apos;ll run a free diagnostic across 6 growth
          checks — lane performance, hit dependence, cadence, and more — and give you a TALLY
          Score in seconds.
        </p>

        {pageStatus !== "results" && (
          <form onSubmit={handleRun} className="space-y-5">
            <div>
              <label htmlFor="channelInput" className={labelClass}>
                Your YouTube Channel
              </label>
              <input
                id="channelInput"
                type="text"
                required
                autoFocus
                disabled={pageStatus === "loading"}
                value={channelInput}
                onChange={(e) => {
                  setChannelInput(e.target.value);
                  if (pageStatus === "error") setPageStatus("idle");
                }}
                placeholder="@yourchannel or youtube.com/@yourchannel"
                className={inputClass}
              />
            </div>

            <TurnstileWidget onVerify={setTurnstileToken} />

            {pageStatus === "error" && (
              <p className="text-[#f87171] text-sm">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={pageStatus === "loading"}
              className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              {pageStatus === "loading" && (
                <span className="w-4 h-4 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin shrink-0" />
              )}
              {pageStatus === "loading" ? "Analyzing your channel…" : "Run my free diagnostic →"}
            </button>
            <p className="text-center text-xs text-[#475569]">
              No signup required. 5 free diagnostics per day.
            </p>
          </form>
        )}

        {pageStatus === "results" && result && (
          <div className="space-y-10">
            {/* Score */}
            <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-8 py-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-[#94a3b8] text-xs uppercase tracking-widest mb-1">
                  {result.channelTitle}
                </p>
                <p className={`text-6xl font-bold ${scoreColor(result.tallyScore)}`}>
                  {result.tallyScore}
                  <span className="text-2xl text-[#475569]">/100</span>
                </p>
              </div>
              <div className={`text-4xl font-bold ${scoreColor(result.tallyScore)}`}>
                {result.grade}
              </div>
            </div>

            {/* Teaser findings */}
            <div>
              <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
                6 growth checks
              </p>
              <div className="grid grid-cols-1 gap-px bg-[#1a1a1a]">
                {result.teaser.map((f) => (
                  <div key={f.id} className="bg-[#0a0a0a] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[10px] font-semibold tracking-[0.15em] uppercase border px-2 py-0.5 ${STATUS_BADGE[f.status]}`}
                      >
                        {STATUS_LABEL[f.status]}
                      </span>
                      <span className="text-[#64748b] text-xs">{f.category}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{f.headline}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Email capture */}
            <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-6 py-6">
              {emailStatus === "sent" ? (
                <div>
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
                    Check your inbox
                  </p>
                  <p className="text-lg font-bold mb-2">Your full report is on its way.</p>
                  <p className="text-[#94a3b8] text-sm leading-relaxed">
                    We sent a link to <span className="text-white">{email}</span>. Click it to
                    see the full breakdown of what&apos;s holding your channel back.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleUnlock} className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-1">
                      Unlock the other 4 findings — free.
                    </p>
                    <p className="text-[#94a3b8] text-xs leading-relaxed mb-4">
                      Enter your email and we&apos;ll send you the full report, including exactly
                      what to fix first.
                    </p>
                    <label htmlFor="email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      disabled={emailStatus === "loading"}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailStatus === "error") setEmailStatus("idle");
                      }}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>

                  {emailStatus === "error" && (
                    <p className="text-[#f87171] text-sm">{emailError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={emailStatus === "loading"}
                    className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {emailStatus === "loading" ? "Sending…" : "Send me the full report →"}
                  </button>
                </form>
              )}
            </div>

            <button
              onClick={reset}
              className="text-[#94a3b8] text-sm hover:text-white transition-colors"
            >
              ← Check another channel
            </button>
          </div>
        )}
      </section>

      {/* Footer */}
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
