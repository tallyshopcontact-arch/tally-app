"use client";

// Upload Kit reframe — the assembled Kit card. Shared between the inline
// results view on /upload-kit and the emailed-magic-link destination
// /upload-kit/report, so the Kit UI only exists in one place.

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import ScoreMeter from "./ScoreMeter";
import StatusBadge, { type LaneStatusColor } from "./StatusBadge";
import TopVideosThisLane, { type GalleryVideo } from "./TopVideosThisLane";
import { generateGalleryTitles } from "@/lib/lanes/titles";

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

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

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

// ── Titles — computed client-side from the same bracket-winner videos as
// the gallery below (see lib/lanes/titles.ts), no fetch involved ───────────

const FREE_TITLE_COUNT = 2;

function TitlesSection({
  topVideos,
  beatName,
  isPaid,
}: {
  topVideos: GalleryVideo[];
  beatName: string | null;
  isPaid: boolean;
}) {
  const titles = generateGalleryTitles(topVideos, beatName);
  if (!titles.length) return null;
  const shown = isPaid ? titles : titles.slice(0, FREE_TITLE_COUNT);

  return (
    <div className="mb-6">
      <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-3">Titles</p>
      <div className="space-y-2">
        {shown.map((t, i) => (
          <div key={i} className="bg-[#0a0a0a] border border-[#1a1a1a] px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm text-white">{t.title}</span>
              <CopyButton text={t.title} />
            </div>
            <p className="text-[#64748b] text-xs leading-relaxed">{t.label}</p>
          </div>
        ))}
      </div>

      {!isPaid && shown.length < titles.length && (
        <p className="text-[#475569] text-xs mt-3">{shown.length} of {titles.length} titles. Upgrade to see every format.</p>
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
    { label: "[FREE] prefix", value: `${patterns.freePrefixPct}%` },
    { label: "Median length", value: formatDuration(patterns.medianDurationSeconds) },
    { label: "Quoted beat name", value: `${patterns.quotedNamePct}%` },
  ];
  return (
    <div className="mb-6">
      <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-3">Winners in this lane</p>
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-white text-sm font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── The Kit card ─────────────────────────────────────────────────────────

export default function UploadKitCard({
  result,
  isPaid,
  beatName,
  isTopLane,
  laneCount,
}: {
  result: FullLaneDetail;
  isPaid: boolean;
  beatName: string | null;
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

      <TitlesSection topVideos={result.topVideos} beatName={beatName} isPaid={isPaid} />
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
  genre,
}: {
  trendingArtists: TrendingArtist[];
  bestOpenLane: BestOpenLane | null;
  isPaid: boolean;
  /** Carried into each "Check this lane" link so re-running lands the
   * producer back on the same genre instead of an empty dropdown. */
  genre?: string;
}) {
  const genreQuery = genre ? `&genre=${encodeURIComponent(genre)}` : "";
  const suggestions: { key: string; label: string; sub: string; href: string }[] = [];
  if (bestOpenLane) {
    suggestions.push({
      key: `open:${bestOpenLane.laneId}`,
      label: bestOpenLane.displayName,
      sub: `Scored ${bestOpenLane.opportunity}/100 when we analyzed it ${formatDaysAgo(bestOpenLane.daysAgo)}.`,
      href: `/upload-kit?artist=${encodeURIComponent(bestOpenLane.displayName)}${genreQuery}`,
    });
  }
  for (const t of trendingArtists) {
    suggestions.push({
      key: `trend:${t.artist}`,
      label: t.artist,
      sub: "Co-mentioned by winners across other producers' checks in this genre.",
      href: `/upload-kit?artist=${encodeURIComponent(t.artist)}${genreQuery}`,
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
