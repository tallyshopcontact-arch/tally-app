"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { extractKeywords, getTopNicheVideos } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";
import { AlertTriangle, ArrowUpRight, Check, Copy, Lock, Menu, RefreshCw, X } from "lucide-react";
import {
  IconLayoutDashboard,
  IconChartBar,
  IconTrophy,
  IconTrendingUp,
  IconRocket,
  IconTag,
  IconPhoto,
  IconAlertTriangle,
  IconChecklist,
  IconFileText,
  IconUsers,
  IconEye,
  IconPuzzle,
  IconSearch,
  IconChartLine,
} from "@tabler/icons-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  name: string | null;
  genre: string | null;
  youtube_channel_url: string | null;
}

interface ChannelData {
  id: string;
  channel_id: string;
  channel_name: string;
  subscriber_count: number;
  total_views: number;
  video_count: number;
  monthly_views: number;
  monthly_subscribers: number;
  monthly_videos: number;
  monthly_likes: number;
  best_video_title: string | null;
  best_video_views: number | null;
  best_video_id: string | null;
  niche_data: NicheVideo[];
  month: number;
  year: number;
  pulled_at: string;
}

interface ScoreCategory {
  category: string;
  score: number;
  max: number;
}

interface ReportData {
  id: string;
  channel_summary: string;
  benchmark_insights: string;
  trending_breakdowns: Array<{ videoId: string; breakdown: string }>;
  rising_artists: Array<{ name: string; growth: string; why: string; youtube_url: string }>;
  what_to_avoid: Array<{ pattern: string; explanation: string; fix: string }>;
  action_plan: Array<{ action: string; priority: "High" | "Medium" | "Low"; why: string }>;
  upload_kits: Array<{ title: string; description: string; tags: string[]; thumbnail_brief: string }>;
  tally_score: number;
  score_breakdown: { categories: ScoreCategory[]; tip: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

const scoreBarColor = (s: number) =>
  s >= 80 ? "bg-[#4ade80]" : s >= 60 ? "bg-[#fbbf24]" : "bg-[#f87171]";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Navigation config ─────────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "snapshot"
  | "benchmark"
  | "top-videos"
  | "rising-artists"
  | "keywords"
  | "thumbnails"
  | "avoid"
  | "action-plan"
  | "upload-kit"
  | "competitors"
  | "audience"
  | "content-gaps"
  | "seo-audit"
  | "growth-forecast";

const SOON_TABS: ReadonlySet<Tab> = new Set([
  "competitors",
  "audience",
  "content-gaps",
  "seo-audit",
  "growth-forecast",
]);

type TablerIcon = React.ComponentType<{
  size?: number;
  stroke?: number;
  className?: string;
}>;

interface NavItem {
  id: Tab;
  label: string;
  Icon: TablerIcon;
  soon?: true;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview",        label: "Overview",        Icon: IconLayoutDashboard },
  { id: "snapshot",        label: "Snapshot",        Icon: IconChartBar },
  { id: "benchmark",       label: "Benchmark",       Icon: IconTrophy },
  { id: "top-videos",      label: "Top Videos",      Icon: IconTrendingUp },
  { id: "rising-artists",  label: "Rising Artists",  Icon: IconRocket },
  { id: "keywords",        label: "Keyword Map",     Icon: IconTag },
  { id: "thumbnails",      label: "Thumbnails",      Icon: IconPhoto },
  { id: "avoid",           label: "What to Avoid",   Icon: IconAlertTriangle },
  { id: "action-plan",     label: "Action Plan",     Icon: IconChecklist },
  { id: "upload-kit",      label: "Upload Kit",      Icon: IconFileText },
  { id: "competitors",     label: "Competitors",     Icon: IconUsers,     soon: true },
  { id: "audience",        label: "Audience",        Icon: IconEye,       soon: true },
  { id: "content-gaps",    label: "Content Gaps",    Icon: IconPuzzle,    soon: true },
  { id: "seo-audit",       label: "SEO Audit",       Icon: IconSearch,    soon: true },
  { id: "growth-forecast", label: "Growth Forecast", Icon: IconChartLine, soon: true },
];

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab({
  profile,
  channelData,
  report,
  nicheRank,
}: {
  profile: UserProfile | null;
  channelData: ChannelData | null;
  report: ReportData | null;
  nicheRank: { rank: number; total: number } | null;
}) {
  const displayName = profile?.name || "Producer";
  const displayGenre = profile?.genre || "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-8">
      {/* Channel header */}
      <div className="flex items-center gap-5 pb-8 border-b border-[#1a1a1a]">
        <div className="w-14 h-14 bg-[#1a1a1a] flex items-center justify-center font-bold text-lg tracking-wide shrink-0">
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">
              {channelData?.channel_name || displayName}
            </h2>
            {displayGenre && (
              <span className="text-xs text-[#94a3b8] border border-[#2a2a2a] px-2 py-0.5">
                {displayGenre}
              </span>
            )}
          </div>
          {profile?.youtube_channel_url ? (
            <p className="text-[#94a3b8] text-sm truncate max-w-sm">
              {profile.youtube_channel_url}
            </p>
          ) : (
            <p className="text-[#475569] text-sm italic">
              No channel URL set — complete your profile.
            </p>
          )}
        </div>
      </div>

      {/* AI channel summary */}
      {report?.channel_summary && (
        <p className="text-[#94a3b8] text-sm leading-relaxed">
          {report.channel_summary}
        </p>
      )}

      {/* TALLY score */}
      {report && report.tally_score > 0 ? (
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="shrink-0 text-center sm:text-left">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">
                TALLY Score
              </p>
              <p className={`text-6xl font-bold ${scoreColor(report.tally_score)}`}>
                {report.tally_score}
                <span className="text-2xl text-[#475569]">/100</span>
              </p>
              {nicheRank && (
                <p className="text-xs text-[#475569] mt-2">
                  Rank{" "}
                  <span className="text-white font-semibold">
                    #{nicheRank.rank}
                  </span>{" "}
                  of {nicheRank.total} in your genre
                </p>
              )}
            </div>
            <div className="flex-1 space-y-2.5">
              {report.score_breakdown?.categories?.map((cat) => (
                <div key={cat.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#94a3b8]">{cat.category}</span>
                    <span
                      className={scoreColor(
                        Math.round((cat.score / cat.max) * 100)
                      )}
                    >
                      {cat.score}/{cat.max}
                    </span>
                  </div>
                  <div className="h-1 bg-[#1a1a1a]">
                    <div
                      className={`h-full ${scoreBarColor(
                        Math.round((cat.score / cat.max) * 100)
                      )}`}
                      style={{ width: `${(cat.score / cat.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {report.score_breakdown?.tip && (
                <p className="text-xs text-[#475569] pt-1">
                  <span className="text-[#fbbf24]">Tip: </span>
                  {report.score_breakdown.tip}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : channelData && !report ? (
        <div className="border border-[#1a1a1a] p-6 text-center">
          <p className="text-[#475569] text-sm">
            Generating your TALLY score...
          </p>
        </div>
      ) : null}

      {!channelData && (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Channel data will appear here once your report is ready.
          </p>
        </div>
      )}
    </div>
  );
}

function SnapshotTab({ channelData }: { channelData: ChannelData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const avgViews =
    channelData && channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : null;

  const stats = channelData
    ? [
        {
          label: "Videos this month",
          value: channelData.monthly_videos.toString(),
          sub: "uploaded",
        },
        {
          label: "Views this month",
          value: formatNum(channelData.monthly_views),
          sub: "total views",
        },
        {
          label: "Avg views / video",
          value: avgViews !== null ? formatNum(avgViews) : "—",
          sub: "across uploads",
        },
        {
          label: "Likes this month",
          value: formatNum(channelData.monthly_likes),
          sub: "across uploads",
        },
        {
          label: "Watch Time",
          value: "Pro feature",
          sub: "connect Google account",
          locked: true,
        },
        {
          label: "Subscribers Gained",
          value: "Pro feature",
          sub: "this month",
          locked: true,
        },
      ]
    : null;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          Monthly Snapshot — {monthLabel}
        </h2>
        <p className="text-[#94a3b8] text-sm">
          Your channel&apos;s performance this month at a glance.
        </p>
      </div>

      {!channelData ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Snapshot will appear once your channel data is pulled.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#1a1a1a]">
            {stats!.map(({ label, value, sub, locked }) => (
              <div
                key={label}
                className={`bg-[#0a0a0a] p-6 ${locked ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-4">
                  {locked && (
                    <Lock className="w-3 h-3 text-[#475569] shrink-0" />
                  )}
                  <p className="text-[#94a3b8] text-xs uppercase tracking-widest">
                    {label}
                  </p>
                </div>
                <p
                  className={`text-3xl font-bold mb-1 ${
                    locked ? "text-[#2a2a2a]" : ""
                  }`}
                >
                  {value}
                </p>
                <p className="text-xs text-[#475569]">{sub}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-[#1a1a1a] px-5 py-4 bg-[#0d0d0d]">
            <div className="flex items-center gap-2.5">
              <Lock className="w-3.5 h-3.5 text-[#475569] shrink-0" />
              <p className="text-xs text-[#475569]">
                Unlock full analytics by connecting your Google account —
                available on Pro plan
              </p>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 text-xs font-semibold text-black bg-white px-4 py-2 hover:bg-[#e8e8e8] transition-colors"
            >
              Upgrade to Pro
            </Link>
          </div>

          {channelData.best_video_id && (
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
                Best Performing Video — {monthLabel}
              </p>
              <p className="text-white font-medium leading-snug mb-3">
                {channelData.best_video_title}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">
                  {formatNum(channelData.best_video_views ?? 0)}
                </span>
                <span className="text-[#475569] text-sm">views</span>
                <a
                  href={`https://www.youtube.com/watch?v=${channelData.best_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-[#4ade80] hover:underline"
                >
                  Watch on YouTube
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          <div className="border border-[#1a1a1a] p-6">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
              Channel Totals
            </p>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-2xl font-bold">
                  {formatNum(channelData.subscriber_count)}
                </p>
                <p className="text-xs text-[#475569] mt-1">subscribers</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatNum(channelData.total_views)}
                </p>
                <p className="text-xs text-[#475569] mt-1">total views</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatNum(channelData.video_count)}
                </p>
                <p className="text-xs text-[#475569] mt-1">videos</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BenchmarkTab({
  channelData,
  report,
}: {
  channelData: ChannelData | null;
  report: ReportData | null;
}) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const nicheVideos = channelData?.niche_data ?? [];
  const nicheAvg =
    nicheVideos.length > 0
      ? Math.round(
          nicheVideos.reduce((s, v) => s + v.viewCount, 0) / nicheVideos.length
        )
      : 0;
  const top10 = [...nicheVideos]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 10);
  const top10Avg =
    top10.length > 0
      ? Math.round(top10.reduce((s, v) => s + v.viewCount, 0) / top10.length)
      : 0;
  const producerAvg =
    channelData && channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : 0;
  const maxVal = Math.max(producerAvg, nicheAvg, top10Avg, 1);

  const bars = [
    {
      label: channelData?.channel_name ?? "You",
      value: producerAvg,
      color: "bg-white",
    },
    { label: "Niche Average", value: nicheAvg, color: "bg-[#60a5fa]" },
    { label: "Top 10 Average", value: top10Avg, color: "bg-[#4ade80]" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Benchmark — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          How your avg views per video compares to your niche right now.
        </p>
      </div>

      {!channelData ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Benchmark will appear once data is loaded.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border border-[#1a1a1a] p-6 space-y-5">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#94a3b8]">{bar.label}</span>
                  <span className="text-white font-semibold">
                    {formatNum(bar.value)} views/video
                  </span>
                </div>
                <div className="h-2 bg-[#1a1a1a]">
                  <div
                    className={`h-full ${bar.color}`}
                    style={{ width: `${(bar.value / maxVal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {report?.benchmark_insights ? (
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
                AI Insights
              </p>
              <p className="text-[#cbd5e1] text-sm leading-relaxed">
                {report.benchmark_insights}
              </p>
            </div>
          ) : (
            <div className="border border-[#1a1a1a] p-6 text-center">
              <p className="text-[#475569] text-sm">
                AI insights loading...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopVideosTab({
  channelData,
  report,
}: {
  channelData: ChannelData | null;
  report: ReportData | null;
}) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const topVideos =
    channelData && channelData.niche_data?.length
      ? getTopNicheVideos(channelData.niche_data)
      : [];
  const getBreakdown = (videoId: string) =>
    report?.trending_breakdowns?.find((b) => b.videoId === videoId)
      ?.breakdown ?? null;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          Trending in Your Niche — {monthLabel}
        </h2>
        <p className="text-[#94a3b8] text-sm">
          Top 3 videos by view count from the last 30 days in your genre.
        </p>
      </div>

      {!channelData ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Trending videos will appear once your channel data is pulled.
          </p>
        </div>
      ) : topVideos.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No niche videos found for the last 30 days.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-[#1a1a1a]">
          {topVideos.map((video, i) => (
            <div
              key={video.videoId}
              className="bg-[#0a0a0a] p-6 flex flex-col md:flex-row md:items-start gap-5"
            >
              <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white font-medium mb-1 leading-snug hover:underline inline-flex items-start gap-1 group"
                >
                  {video.title}
                  <ArrowUpRight className="w-3 h-3 shrink-0 mt-1 text-[#475569] group-hover:text-white transition-colors" />
                </a>
                <p className="text-[#94a3b8] text-xs mt-1 mb-3">
                  {video.channelName}
                </p>
                {video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {video.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-[#475569] bg-[#111] border border-[#1e1e1e] px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {getBreakdown(video.videoId) && (
                  <p className="text-[#64748b] text-xs leading-relaxed border-l-2 border-[#1e1e1e] pl-3">
                    {getBreakdown(video.videoId)}
                  </p>
                )}
              </div>
              <div className="shrink-0 md:text-right">
                <p className="text-white font-bold text-xl">
                  {formatNum(video.viewCount)}
                </p>
                <p className="text-[#475569] text-xs mt-0.5">views</p>
                <p className="text-[#475569] text-xs mt-2">
                  {new Date(video.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RisingArtistsTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const artists = report?.rising_artists ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          Rising Artists — {monthLabel}
        </h2>
        <p className="text-[#94a3b8] text-sm">
          Beat producers gaining momentum in your niche right now.
        </p>
      </div>

      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Rising artists will appear once the AI report is generated.
          </p>
        </div>
      ) : artists.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No rising artists identified this month. Try refreshing your data
            to get a fresh analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-[#1a1a1a]">
          {artists.map((artist, i) => (
            <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
              <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <p className="text-white font-semibold">{artist.name}</p>
                  {artist.growth && (
                    <span className="text-[#4ade80] text-xs">
                      {artist.growth}
                    </span>
                  )}
                </div>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-3">
                  {artist.why}
                </p>
                {artist.youtube_url && (
                  <a
                    href={artist.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#60a5fa] hover:text-white transition-colors"
                  >
                    View Channel
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const badgeStyle: Record<string, string> = {
  hot: "bg-[#1f0a0a] text-[#f87171]",
  stable: "bg-[#1f1800] text-[#fbbf24]",
  rising: "bg-[#0a1020] text-[#60a5fa]",
};

function KeywordsTab({ channelData }: { channelData: ChannelData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const keywords =
    channelData && channelData.niche_data?.length
      ? extractKeywords(channelData.niche_data)
      : [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          Keyword Heat Map — {monthLabel}
        </h2>
        <p className="text-[#94a3b8] text-sm">
          Tags appearing most frequently across top-performing videos in your
          niche.
          {channelData &&
            ` Extracted from ${channelData.niche_data?.length ?? 0} niche videos.`}
        </p>
      </div>

      {!channelData ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Keywords will appear once your channel data is pulled.
          </p>
        </div>
      ) : keywords.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No tagged videos found in your niche for the last 30 days.
          </p>
        </div>
      ) : (
        <div className="border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                {["#", "Keyword / Tag", "Niche frequency", "Heat"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors"
                >
                  <td className="px-5 py-4 text-[#475569] text-xs font-bold w-10">
                    {i + 1}
                  </td>
                  <td className="px-5 py-4 text-white font-medium">
                    {row.tag}
                  </td>
                  <td className="px-5 py-4 text-[#94a3b8]">{row.count}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`text-xs px-2 py-1 capitalize ${
                        badgeStyle[row.badge]
                      }`}
                    >
                      {row.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ThumbnailsTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const concepts =
    report?.upload_kits?.filter((k) => k.thumbnail_brief).slice(0, 3) ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">
          Thumbnails — {monthLabel}
        </h2>
        <p className="text-[#94a3b8] text-sm">
          AI-generated thumbnail concepts from your upload kits this month.
        </p>
      </div>

      {concepts.length === 0 ? (
        <div className="border border-[#1a1a1a] p-10 text-center">
          <IconPhoto
            size={28}
            stroke={1.5}
            className="text-[#475569] mx-auto mb-3"
          />
          <p className="text-white font-medium mb-1">
            Thumbnail concepts will appear here
          </p>
          <p className="text-[#475569] text-sm max-w-xs mx-auto leading-relaxed">
            Generate your Upload Kit to see AI-written thumbnail briefs for
            your next 3 beats.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((kit, i) => (
            <div key={i} className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#475569] uppercase tracking-widest mb-2">
                Concept {i + 1}
              </p>
              <p className="text-white font-medium text-sm mb-3">{kit.title}</p>
              <p className="text-[#94a3b8] text-sm leading-relaxed border-l-2 border-[#1e1e1e] pl-3">
                {kit.thumbnail_brief}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AvoidTab({ report }: { report: ReportData | null }) {
  const items = report?.what_to_avoid ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">What to Avoid This Month</h2>
        <p className="text-[#94a3b8] text-sm">
          Patterns pulling down performance in your genre, identified by AI
          from your niche data.
        </p>
      </div>

      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">Loading AI analysis...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No patterns identified yet. Try refreshing your data to get a
            fresh analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-[#1a1a1a]">
          {items.map((item, i) => (
            <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
              <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-white">{item.pattern}</h3>
                  <span className="shrink-0 text-xs text-[#f87171] bg-[#1f0a0a] px-2 py-1">
                    Impact
                  </span>
                </div>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-2">
                  {item.explanation}
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed border-l-2 border-[#2a2a2a] pl-3">
                  Fix: {item.fix}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const priorityStyle: Record<string, string> = {
  High: "text-[#f87171] bg-[#1f0a0a]",
  Medium: "text-[#fbbf24] bg-[#1f1800]",
  Low: "text-[#60a5fa] bg-[#0a1020]",
};

function ActionPlanTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const actions = report?.action_plan ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Action Plan — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          Prioritized steps to grow your channel this month, tailored to your
          data.
        </p>
      </div>

      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Action plan will appear once the AI report is generated.
          </p>
        </div>
      ) : actions.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No actions generated. Try refreshing your data to trigger a new
            report.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-[#1a1a1a]">
          {actions.map((item, i) => (
            <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
              <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <p className="text-white font-semibold">{item.action}</p>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 ${
                      priorityStyle[item.priority] ?? ""
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className="text-[#94a3b8] text-sm leading-relaxed">
                  {item.why}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadKitTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const kits = report?.upload_kits ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Upload Kit — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          AI-generated ready-to-use upload packages built from this
          month&apos;s niche data.
        </p>
      </div>

      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Upload kits will appear once the AI report is generated.
          </p>
        </div>
      ) : kits.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            No kits generated. Try refreshing your data to trigger a new
            report.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {kits.map((kit, i) => (
            <div key={i} className="space-y-3">
              <p className="text-xs text-[#475569] uppercase tracking-widest">
                Kit {i + 1}
              </p>
              <div className="border border-[#1a1a1a] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest">
                    Title
                  </p>
                  <CopyButton text={kit.title} />
                </div>
                <p className="text-white font-medium">{kit.title}</p>
              </div>
              <div className="border border-[#1a1a1a] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest">
                    Description
                  </p>
                  <CopyButton text={kit.description} />
                </div>
                <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {kit.description}
                </pre>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-[#1a1a1a] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[#94a3b8] uppercase tracking-widest">
                      Tags
                    </p>
                    <CopyButton text={kit.tags.join(", ")} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {kit.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-[#94a3b8] bg-[#111] border border-[#1e1e1e] px-3 py-1.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="border border-[#1a1a1a] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
                    Thumbnail Concept
                  </p>
                  <p className="text-[#cbd5e1] text-sm leading-relaxed">
                    {kit.thumbnail_brief}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-5">
        <Lock className="w-5 h-5 text-[#475569]" />
      </div>
      <h2 className="text-xl font-bold mb-2">{label}</h2>
      <p className="text-[#475569] text-sm max-w-xs leading-relaxed">
        Coming soon — we&apos;re building this now.
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [nicheRank] = useState<{ rank: number; total: number } | null>(null);

  const generateReport = useCallback(async () => {
    console.log("[TALLY] generateReport: starting");
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/report/generate", { method: "POST" });
      const json = await res.json();
      console.log(
        "[TALLY] generateReport: ok=",
        res.ok,
        "| rising_artists=",
        json.rising_artists?.length ?? "missing",
        "| action_plan=",
        json.action_plan?.length ?? "missing",
        "| what_to_avoid=",
        json.what_to_avoid?.length ?? "missing",
        "| upload_kits=",
        json.upload_kits?.length ?? "missing"
      );
      if (res.ok) {
        setReport(json as ReportData);
      } else {
        console.error("[TALLY] generateReport: API error:", json.error);
      }
    } catch (e) {
      console.error("[TALLY] generateReport: exception:", e);
    } finally {
      setGeneratingReport(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
    console.log("[TALLY] handleRefresh: clearing channel_data + report for this month");
    setPulling(true);
    setPullError(null);
    setReport(null);
    const supabase = createSupabaseBrowserClient();
    const now = new Date();
    await Promise.all([
      supabase
        .from("channel_data")
        .delete()
        .eq("producer_id", userId)
        .eq("month", now.getMonth() + 1)
        .eq("year", now.getFullYear()),
      supabase
        .from("reports")
        .delete()
        .eq("producer_id", userId)
        .eq("month", now.getMonth() + 1)
        .eq("year", now.getFullYear()),
    ]);
    try {
      const res = await fetch("/api/youtube/pull", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pull failed");
      console.log("[TALLY] handleRefresh: pull complete, channel=", json.channel_name);
      setChannelData(json as ChannelData);
      generateReport();
    } catch (err: unknown) {
      setPullError(
        err instanceof Error ? err.message : "Failed to pull channel data"
      );
    } finally {
      setPulling(false);
    }
  }, [userId, generateReport]);

  const triggerPull = useCallback(async () => {
    console.log("[TALLY] triggerPull: starting");
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch("/api/youtube/pull", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pull failed");
      console.log("[TALLY] triggerPull: complete, channel=", json.channel_name);
      setChannelData(json as ChannelData);
    } catch (err: unknown) {
      setPullError(
        err instanceof Error ? err.message : "Failed to pull channel data"
      );
    } finally {
      setPulling(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log("[TALLY] getUser:", user?.id ?? "not authenticated");
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email ?? null);
      setUserId(user.id);

      supabase
        .from("profiles")
        .select("name, genre, youtube_channel_url")
        .eq("id", user.id)
        .single()
        .then(async ({ data }) => {
          console.log(
            "[TALLY] profile: name=",
            data?.name,
            "genre=",
            data?.genre,
            "url=",
            data?.youtube_channel_url ? "set" : "missing"
          );
          if (data) setProfile(data as UserProfile);
          setLoadingUser(false);

          if (!data?.youtube_channel_url) {
            console.log("[TALLY] no youtube_channel_url — skipping auto-pull");
            return;
          }

          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          console.log("[TALLY] checking channel_data for", month, "/", year);

          const { data: existing } = await supabase
            .from("channel_data")
            .select("*")
            .eq("producer_id", user.id)
            .eq("month", month)
            .eq("year", year)
            .single();

          console.log(
            "[TALLY] existing channel_data:",
            existing
              ? `videos=${existing.monthly_videos}, views=${existing.monthly_views}`
              : "none — will pull"
          );

          if (existing) {
            setChannelData(existing as ChannelData);

            // Check for a cached report for this month
            const { data: cachedReport } = await supabase
              .from("reports")
              .select("*")
              .eq("producer_id", user.id)
              .eq("month", month)
              .eq("year", year)
              .single();

            console.log(
              "[TALLY] cached report:",
              cachedReport
                ? `rising_artists=${cachedReport.rising_artists?.length}, action_plan=${cachedReport.action_plan?.length}, what_to_avoid=${cachedReport.what_to_avoid?.length}, upload_kits=${cachedReport.upload_kits?.length}`
                : "none"
            );

            if (cachedReport) {
              // If key sections are empty arrays the previous AI generation
              // partially failed (e.g. rising_artists required >= 2 videos from
              // same channel — now fixed). Regenerate so all sections populate.
              const incomplete =
                !cachedReport.rising_artists?.length ||
                !cachedReport.action_plan?.length ||
                !cachedReport.what_to_avoid?.length ||
                !cachedReport.upload_kits?.length;

              if (incomplete) {
                console.log(
                  "[TALLY] cached report is incomplete — regenerating (fixed rising_artists bug)"
                );
                generateReport();
              } else {
                console.log("[TALLY] loaded complete cached report");
                setReport(cachedReport as ReportData);
              }
            } else {
              console.log("[TALLY] no report cached — generating now");
              generateReport();
            }
          } else {
            // No channel data for this month — pull it first
            console.log("[TALLY] pulling channel data from YouTube...");
            setPulling(true);
            setPullError(null);
            try {
              const res = await fetch("/api/youtube/pull", { method: "POST" });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Pull failed");
              console.log(
                "[TALLY] auto-pull complete: channel=",
                json.channel_name,
                "videos=",
                json.monthly_videos
              );
              setChannelData(json as ChannelData);
              generateReport();
            } catch (err: unknown) {
              console.error("[TALLY] auto-pull failed:", err);
              setPullError(
                err instanceof Error
                  ? err.message
                  : "Failed to pull channel data"
              );
            } finally {
              setPulling(false);
            }
          }
        });
    });
  }, [router, triggerPull, generateReport]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const displayName =
    profile?.name || userEmail?.split("@")[0] || "Producer";
  const activeNavItem = NAV_ITEMS.find((n) => n.id === tab);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0a0a0a] text-white">
      {/* ── Top header ── */}
      <nav className="shrink-0 h-14 border-b border-[#1a1a1a] px-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/dashboard" className="text-[#475569] hover:text-[#94a3b8] transition-colors text-xs hidden sm:flex items-center gap-1">
            ← Dashboard
          </Link>
          <Link href="/dashboard" className="text-sm font-bold tracking-[0.25em]">
            TALLY
          </Link>
          <span className="text-[#2a2a2a] hidden sm:block">|</span>
          <span className="text-xs text-[#475569] hidden sm:block">Monthly Report</span>
        </div>

        <div className="flex items-center gap-4">
          {!loadingUser && (
            <span className="text-xs text-[#94a3b8] hidden sm:block">
              {displayName}
              {profile?.genre ? ` · ${profile.genre}` : ""}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={pulling || loadingUser}
            title="Delete this month's data and re-pull from YouTube"
            className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${pulling ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {pulling ? "Refreshing…" : "Refresh data"}
            </span>
          </button>
          <span className="hidden sm:flex items-center gap-2 text-xs border border-[#1e1e1e] px-2.5 py-1">
            <span className="text-[#475569]">Free Trial</span>
            <Link
              href="/pricing"
              className="text-white font-semibold hover:text-[#94a3b8] transition-colors"
            >
              Upgrade
            </Link>
          </span>
          <Link
            href="/settings"
            className="text-sm text-[#94a3b8] hover:text-white transition-colors hidden sm:block"
          >
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={`
            fixed top-0 left-0 h-full w-[220px] z-40 flex flex-col
            bg-[#111111] border-r border-[#1a1a1a]
            transition-transform duration-200
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            lg:relative lg:translate-x-0 lg:z-auto
          `}
        >
          {/* Mobile close row */}
          <div className="lg:hidden flex items-center justify-between px-4 py-4 border-b border-[#1a1a1a] shrink-0">
            <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-[#94a3b8] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3">
            {NAV_ITEMS.map((item) => {
              const isActive = tab === item.id;
              const isSoon = !!item.soon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`
                    flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left
                    transition-colors duration-150 border-l-[3px] cursor-pointer
                    ${
                      isActive
                        ? "border-white bg-[#1a1a1a] text-white"
                        : "border-transparent text-[#64748b] hover:text-[#94a3b8] hover:bg-[#161616]"
                    }
                    ${isSoon ? "opacity-60" : ""}
                  `}
                >
                  <item.Icon size={16} stroke={1.5} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {isSoon && (
                    <span className="text-[10px] text-[#475569] bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 leading-none shrink-0">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Status banners */}
          {(pulling || generatingReport || pullError) && (
            <div className="px-8 pt-6 space-y-3">
              {pulling && (
                <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
                  <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin shrink-0" />
                  Pulling your channel data from YouTube...
                </div>
              )}
              {generatingReport && !pulling && (
                <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
                  <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
                  TALLY is analyzing your channel...
                </div>
              )}
              {pullError && !pulling && (
                <div className="flex items-start gap-3 border border-[#f87171]/30 px-5 py-4">
                  <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#f87171] text-sm">{pullError}</p>
                    <button
                      onClick={triggerPull}
                      className="text-xs text-white underline underline-offset-2 mt-2 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab content — key forces remount + fade animation on tab change */}
          <div key={tab} className="px-8 py-8 tab-content">
            {tab === "overview" && (
              <OverviewTab
                profile={profile}
                channelData={channelData}
                report={report}
                nicheRank={nicheRank}
              />
            )}
            {tab === "snapshot" && (
              <SnapshotTab channelData={channelData} />
            )}
            {tab === "benchmark" && (
              <BenchmarkTab channelData={channelData} report={report} />
            )}
            {tab === "top-videos" && (
              <TopVideosTab channelData={channelData} report={report} />
            )}
            {tab === "rising-artists" && (
              <RisingArtistsTab report={report} />
            )}
            {tab === "keywords" && (
              <KeywordsTab channelData={channelData} />
            )}
            {tab === "thumbnails" && <ThumbnailsTab report={report} />}
            {tab === "avoid" && <AvoidTab report={report} />}
            {tab === "action-plan" && <ActionPlanTab report={report} />}
            {tab === "upload-kit" && <UploadKitTab report={report} />}
            {SOON_TABS.has(tab) && (
              <ComingSoonTab label={activeNavItem?.label ?? tab} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
