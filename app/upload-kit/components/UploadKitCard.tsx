"use client";

// Upload Kit reframe — the assembled Kit card. Shared between the inline
// results view on /upload-kit and the emailed-magic-link destination
// /upload-kit/report, so the Kit UI only exists in one place.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import ScoreMeter from "./ScoreMeter";
import StatusBadge, { type LaneStatusColor } from "./StatusBadge";
import TopVideosThisLane, { type GalleryVideo } from "./TopVideosThisLane";

// ── Types (mirrors lib/lanes/present.ts response shapes) ───────────────────

export interface PatternStats {
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

export interface LaneSummary {
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
  note?: string;
}

export interface FullLaneDetail extends LaneSummary {
  patterns: PatternStats;
  winnerVideos: GalleryVideo[];
  topVideos: GalleryVideo[];
}

export type LaneResult = LaneSummary | FullLaneDetail;

export function isFull(l: LaneResult): l is FullLaneDetail {
  return "patterns" in l;
}

export interface TrendingArtist {
  artist: string;
  count: number;
}

export interface BestOpenLane {
  laneId: string;
  laneSlug: string;
  displayName: string;
  opportunity: number;
  statusColor: LaneStatusColor;
  daysAgo: number;
}

interface ScoredTitle {
  title: string;
  score: number;
  explanation: string;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const scoreColor = (s: number) => (s >= 80 ? "text-[#4ade80]" : s >= 50 ? "text-[#fbbf24]" : "text-[#f87171]");

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
      aria-label={label ?? "Copy"}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label ? (copied ? "Copied" : label) : null}
    </button>
  );
}

// ── Titles — auto-fetched on mount, no manual beat-name input ──────────────

function TitlesSection({ laneCheckId, laneId, isPaid }: { laneCheckId: string; laneId: string; isPaid: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [titles, setTitles] = useState<ScoredTitle[]>([]);
  const [error, setError] = useState("");
  const offsetRef = useRef(0);

  const fetchTitles = async (offset: number) => {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/lane-check/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laneCheckId, laneId, offset }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setTitles(data.titles);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Network error. Please check your connection and try again.");
    }
  };

  useEffect(() => {
    offsetRef.current = 0;
    fetchTitles(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneCheckId, laneId]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase">Titles</p>
        {isPaid && (
          <button
            onClick={() => {
              offsetRef.current += 1;
              fetchTitles(offsetRef.current);
            }}
            disabled={status === "loading"}
            className="text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            {status === "loading" ? "Regenerating…" : "Regenerate →"}
          </button>
        )}
      </div>

      {status === "loading" && titles.length === 0 && (
        <div className="flex items-center gap-3 text-[#94a3b8] text-sm px-1 py-2">
          <div className="w-3.5 h-3.5 border border-[#475569] border-t-[#e8833a] rounded-full animate-spin shrink-0" />
          Generating titles…
        </div>
      )}
      {status === "error" && <p className="text-[#f87171] text-sm">{error}</p>}

      {titles.length > 0 && (
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

      {!isPaid && status === "ready" && titles.length > 0 && (
        <p className="text-[#475569] text-xs mt-3">2 of 5 titles. Upgrade for all 5, plus regenerate.</p>
      )}
    </div>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────

function TagsSection({ patterns, isPaid }: { patterns: PatternStats; isPaid: boolean }) {
  if (!patterns.topTags.length) return null;
  const shown = isPaid ? patterns.topTags : patterns.topTags.slice(0, 6);
  const allTagsText = shown.map((t) => t.tag).join(", ");

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase">Tags</p>
        <CopyButton text={allTagsText} label="Copy all tags" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => (
          <span key={t.tag} className="text-[10px] bg-[#0a0a0a] border border-[#1a1a1a] text-[#94a3b8] px-2 py-0.5">
            {t.tag}
            {isPaid ? ` (${t.count})` : ""}
          </span>
        ))}
      </div>
      {!isPaid && (
        <p className="text-[#475569] text-xs mt-2">Top {shown.length} tags. Upgrade for the full list with counts.</p>
      )}
    </div>
  );
}

// ── Format guidance ──────────────────────────────────────────────────────

function FormatGuidance({ patterns }: { patterns: PatternStats }) {
  if (patterns.empty) return null;
  const stats = [
    `${patterns.freePrefixPct}% of winners use a [FREE] prefix`,
    `Median length ${formatDuration(patterns.medianDurationSeconds)}`,
    `${patterns.quotedNamePct}% include a quoted beat name`,
  ];
  return (
    <div className="mb-6">
      <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-2">Winners in this lane</p>
      <p className="text-[#cbd5e1] text-sm leading-relaxed">{stats.join("  ·  ")}</p>
    </div>
  );
}

// ── The Kit card ─────────────────────────────────────────────────────────

export default function UploadKitCard({
  result,
  isPaid,
  laneCheckId,
  isTopLane,
  laneCount,
}: {
  result: FullLaneDetail;
  isPaid: boolean;
  laneCheckId: string;
  isTopLane: boolean;
  /** How many lanes were actually requested — only 2 when a second artist
   * was given, since it's optional. Determines whether the top-lane reason
   * line can accurately say "of your two lanes" or just states the fact. */
  laneCount: number;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8 mb-4">
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
        {isTopLane ? "Your Upload Kit" : "Upload Kit"} — {result.displayName}
      </p>
      {isTopLane && result.winnability !== undefined && (
        <p className="text-[#cbd5e1] text-sm mb-4 leading-relaxed">
          {laneCount > 1
            ? `Most winnable of your two lanes right now — ${result.winnability}% of top performers are small channels.`
            : `${result.winnability}% of top performers in this lane are small channels.`}
        </p>
      )}

      <div className="mb-4">
        <ScoreMeter score={result.opportunity ?? 0} />
      </div>
      {result.statusColor && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <StatusBadge status={result.statusColor} />
          <span className="text-[#94a3b8] text-sm">{result.verdict}</span>
        </div>
      )}

      <TitlesSection laneCheckId={laneCheckId} laneId={result.laneId} isPaid={isPaid} />
      <TagsSection patterns={result.patterns} isPaid={isPaid} />
      <FormatGuidance patterns={result.patterns} />

      <TopVideosThisLane videos={result.topVideos} />
    </div>
  );
}

// ── Locked lane card (non-top, non-paid) ────────────────────────────────────

export function LockedLaneCard({ result, onUpgrade }: { result: LaneSummary; onUpgrade?: () => void }) {
  return (
    <div className="bg-[#0a0a0a] p-5">
      <p className="text-[#94a3b8] text-xs uppercase tracking-widest mb-2">{result.displayName}</p>
      {result.status === "ready" ? (
        <>
          <div className="mb-3">
            <ScoreMeter score={result.opportunity ?? 0} size="sm" />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {result.statusColor && <StatusBadge status={result.statusColor} />}
            <span className="text-[#94a3b8] text-xs">{result.verdict}</span>
          </div>
          <p className="text-[#64748b] text-xs mb-3">Kit locked — titles, tags, and packaging for this lane.</p>
          {onUpgrade ? (
            <button
              onClick={onUpgrade}
              className="text-xs text-[#0a0a0a] font-semibold px-3 py-2 hover:brightness-110 transition-all cursor-pointer"
              style={{ backgroundColor: "#e8833a" }}
            >
              Upgrade to unlock →
            </button>
          ) : (
            <Link
              href="/pricing"
              className="inline-block text-xs text-[#0a0a0a] font-semibold px-3 py-2 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Upgrade to unlock →
            </Link>
          )}
        </>
      ) : (
        <p className="text-[#fbbf24] text-xs">{result.note ?? "Queued — check back soon."}</p>
      )}
    </div>
  );
}

// ── "Also consider" — merged trending co-mentions + best open lane ─────────

export function AlsoConsider({
  trendingArtists,
  bestOpenLane,
  isPaid,
}: {
  trendingArtists: TrendingArtist[];
  bestOpenLane: BestOpenLane | null;
  isPaid: boolean;
}) {
  const suggestions: { key: string; label: string; sub: string; href: string }[] = [];
  if (bestOpenLane) {
    suggestions.push({
      key: `open:${bestOpenLane.laneId}`,
      label: bestOpenLane.displayName,
      sub: `Scored ${bestOpenLane.opportunity}/100 when we analyzed it ${formatDaysAgo(bestOpenLane.daysAgo)}.`,
      href: `/upload-kit?artist=${encodeURIComponent(bestOpenLane.displayName)}`,
    });
  }
  for (const t of trendingArtists) {
    suggestions.push({
      key: `trend:${t.artist}`,
      label: t.artist,
      sub: "Co-mentioned by winners across other producers' checks in this genre.",
      href: `/upload-kit?artist=${encodeURIComponent(t.artist)}`,
    });
  }
  if (!suggestions.length) return null;

  const shown = isPaid ? suggestions : suggestions.slice(0, 1);

  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8 mt-6">
      <p className="text-sm font-semibold mb-4">Artists that could work for this beat</p>
      <div className="space-y-4">
        {shown.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[#cbd5e1] text-sm">{s.label}</p>
              <p className="text-[#64748b] text-xs mt-0.5">{s.sub}</p>
            </div>
            <Link
              href={s.href}
              className="shrink-0 text-xs text-[#0a0a0a] font-semibold px-3 py-2 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Check this lane →
            </Link>
          </div>
        ))}
      </div>
      {!isPaid && (
        <p className="text-[#475569] text-xs mt-4">Upgrade to see every suggestion.</p>
      )}
    </div>
  );
}
