"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

const inputClass =
  "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8833a] transition-colors";

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 50 ? "text-[#fbbf24]" : "text-[#f87171]";

interface ScoredTitle {
  title: string;
  score: number;
  explanation: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
      aria-label="Copy title"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function TitleGenerator({ laneId }: { laneId: string }) {
  const [beatName, setBeatName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [titles, setTitles] = useState<ScoredTitle[]>([]);
  const [error, setError] = useState("");
  // Cache per (lane, beatName) for the session — avoids re-billing a Haiku call
  // for the same input while the user is still on this page.
  const cache = useRef<Map<string, ScoredTitle[]>>(new Map());

  const handleGenerate = async () => {
    const key = `${laneId}:${beatName.trim().toLowerCase()}`;
    const cached = cache.current.get(key);
    if (cached) {
      setTitles(cached);
      setStatus("ready");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/lane-check/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneId, beatName: beatName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      cache.current.set(key, data.titles);
      setTitles(data.titles);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Network error. Please check your connection and try again.");
    }
  };

  return (
    <div className="border-t border-[#1a1a1a] pt-6 mt-2">
      <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-4">
        Title generator
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={beatName}
          onChange={(e) => setBeatName(e.target.value)}
          placeholder="Beat name (optional)"
          disabled={status === "loading"}
          className={inputClass}
        />
        <button
          onClick={handleGenerate}
          disabled={status === "loading"}
          className="shrink-0 text-[#0a0a0a] text-sm font-semibold px-6 py-3 hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          style={{ backgroundColor: "#e8833a" }}
        >
          {status === "loading" ? "Generating…" : "Generate 5 titles"}
        </button>
      </div>

      {status === "error" && <p className="text-[#f87171] text-sm mb-4">{error}</p>}

      {status === "ready" && titles.length > 0 && (
        <div className="space-y-2">
          {titles.map((t, i) => (
            <div key={i} className="bg-[#0a0a0a] border border-[#1a1a1a] px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-sm text-white">{t.title}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-semibold font-[family-name:var(--font-display)] ${scoreColor(t.score)}`}>
                    {t.score}
                  </span>
                  <CopyButton text={t.title} />
                </div>
              </div>
              <p className="text-[#64748b] text-xs leading-relaxed">{t.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
