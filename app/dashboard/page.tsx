"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { extractKeywords, getTopNicheVideos } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Lock,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Users,
  Globe,
  Smartphone,
  Monitor,
  Search,
  Target,
  BarChart2,
  Zap,
} from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const avoidItems = [
  {
    title: "Trap-Boom Bap Hybrid Titles",
    impact: "−31% avg views",
    detail:
      "Boom bap audiences actively filter out trap crossovers. Mixed positioning confuses both the algorithm and your audience. Keep genre identity clear in every title.",
  },
  {
    title: '"Type Beat 2026" Without a Genre Keyword',
    impact: "−40% CTR",
    detail:
      'Your niche searches by genre first, year second. A title like "boom bap type beat 2026" consistently outperforms "type beat 2026". Never lead with the year.',
  },
  {
    title: "Lo-fi Boom Bap Crossover Tags",
    impact: "High bounce rate",
    detail:
      "Tagging boom bap beats with lo-fi terms pulls the wrong audience. They expect lo-fi aesthetics, close the tab in seconds, and destroy your watch-time signal.",
  },
  {
    title: "Collab-Implied Titles Without a Featured Artist",
    impact: "Misleads intent",
    detail:
      "Titles like 'ft. [Artist]' without an actual rapper mislead search intent. Viewers expect a finished track, find a raw instrumental, and leave immediately.",
  },
];

const uploadKit = {
  title: 'FREE | "Midnight Cipher" | Jazz Boom Bap Type Beat | Sample Flip 2026',
  description: `FREE "Midnight Cipher" — Jazz Boom Bap Type Beat | Sample Flip 2026

▶ Licensing info: [your email]
🎵 Free download: [your link]

Free for non-profit / mixtape use. Purchase a license for commercial releases.

#BoomBap #JazzBoomBap #TypeBeat #FreeBeat #SampleFlip #HipHopInstrumental`,
  tags: [
    "boom bap type beat",
    "jazz boom bap",
    "sample flip beat",
    "free boom bap instrumental",
    "underground hip hop beat",
    "grimy rap beat",
    "90s boom bap 2026",
    "dusty loop beat",
    "boom bap for rappers",
    "free instrumental 2026",
    "jazz hip hop beat",
    "sample flip 2026",
  ],
  thumbnail:
    "Dark navy background. 'MIDNIGHT CIPHER' in bold white stencil or slab-serif font. Saxophone silhouette on the left, slightly desaturated. Vinyl record texture behind the title. Small 'FREE' badge in the top-right corner. Gritty grain overlay. High contrast — readable at 120px thumbnail size.",
  uploadTime: "Thursday or Friday · 2:00–5:00 pm EST",
  uploadNote:
    "Boom bap uploads on these days average 34% higher first-week views vs Monday–Wednesday.",
};

const competitors = [
  {
    channel: "NinetyFlip",
    handle: "@NinetyFlip",
    subs: "48.2K",
    monthlyViews: "312K",
    freq: "3× / week",
    trend: "+12%",
    trending: true,
    topVideo: '"Foundation" Jazz Boom Bap Type Beat 2026',
    insight: "Owns the jazz sub-niche. High consistency — never misses a Thursday upload.",
  },
  {
    channel: "Vinyl Era Beats",
    handle: "@VinylEraBeats",
    subs: "31.5K",
    monthlyViews: "198K",
    freq: "2× / week",
    trend: "+19%",
    trending: true,
    topVideo: '"Smoky Room" Jazz Boom Bap Instrumental',
    insight: "Fastest growing competitor this month. Minimal thumbnails driving above-average CTR.",
  },
  {
    channel: "BoomBap Society",
    handle: "@BoomBapSociety",
    subs: "67.1K",
    monthlyViews: "445K",
    freq: "5× / week",
    trend: "+3%",
    trending: true,
    topVideo: 'Grimy Boom Bap "No Surrender" | FREE USE',
    insight: "Largest channel but slowing. High volume diluting per-video quality signals.",
  },
  {
    channel: "Dusty Crates",
    handle: "@DustyCrates",
    subs: "22.8K",
    monthlyViews: "156K",
    freq: "2× / week",
    trend: "+8%",
    trending: true,
    topVideo: '"Sample Season" Boom Bap Instrumental',
    insight: "Sample-flip positioning is catching fire — directly competing with your opportunity.",
  },
  {
    channel: "Classic Mode Beats",
    handle: "@ClassicModeBeats",
    subs: "19.3K",
    monthlyViews: "112K",
    freq: "1× / week",
    trend: "-4%",
    trending: false,
    topVideo: '90s Boom Bap "Concrete Jungle" [FREE]',
    insight: "Declining. Pure nostalgia framing without jazz or sample-flip hooks is losing ground.",
  },
];

const audience = {
  ageGroups: [
    { label: "18–24", pct: 42 },
    { label: "25–34", pct: 38 },
    { label: "35–44", pct: 14 },
    { label: "45+",   pct: 6  },
  ],
  countries: [
    { country: "United States", flag: "🇺🇸", pct: 54 },
    { country: "United Kingdom", flag: "🇬🇧", pct: 12 },
    { country: "Canada",         flag: "🇨🇦", pct: 8  },
    { country: "Germany",        flag: "🇩🇪", pct: 5  },
    { country: "France",         flag: "🇫🇷", pct: 4  },
    { country: "Other",          flag: "🌐", pct: 17 },
  ],
  devices: [
    { label: "Mobile",  pct: 61, icon: "mobile"  },
    { label: "Desktop", pct: 33, icon: "desktop" },
    { label: "Tablet",  pct: 6,  icon: "tablet"  },
  ],
  traffic: [
    { source: "YouTube Search",    pct: 44, color: "#4ade80" },
    { source: "Suggested Videos",  pct: 29, color: "#60a5fa" },
    { source: "External",          pct: 12, color: "#c084fc" },
    { source: "Browse Features",   pct: 9,  color: "#fbbf24" },
    { source: "Other",             pct: 6,  color: "#475569" },
  ],
};

const contentGaps = [
  {
    topic: "Boom Bap Drill Fusion Beat",
    searches: "8,400",
    supply: 0,
    opportunity: "Very High",
    why: "Zero competitor videos this month targeting this crossover. Growing search trend driven by NY rap resurgence.",
  },
  {
    topic: "Jazz Soul Boom Bap Instrumental",
    searches: "9,100",
    supply: 4,
    opportunity: "High",
    why: "Only 4 videos in the last 30 days vs ~9K monthly searches. Jazz + soul combo is underserved.",
  },
  {
    topic: "Boom Bap Beat Breakdown Tutorial",
    searches: "7,200",
    supply: 3,
    opportunity: "High",
    why: "Producers want to learn. Tutorial content builds authority and drives sustained long-tail traffic.",
  },
  {
    topic: "Sample Pack Showcase — Boom Bap",
    searches: "5,100",
    supply: 2,
    opportunity: "High",
    why: "Sample pack videos average 4× longer watch time. Builds community and drives affiliate/kit sales.",
  },
  {
    topic: "Old School Hip Hop Beat 2026",
    searches: "14,300",
    supply: 9,
    opportunity: "Medium",
    why: "Decent volume but growing competition. Differentiate with a strong visual brand or unique sub-style.",
  },
  {
    topic: "Grimy Trap Beat (Boom Bap Adjacent)",
    searches: "21,600",
    supply: 31,
    opportunity: "Low",
    why: "Heavily saturated. Unless you have a unique angle, better to focus on pure boom bap territory.",
  },
];

const seoAudit = [
  {
    category: "Title Optimization",
    score: 72,
    status: "Fair",
    finding: "4 of your last 8 uploads are missing the year. YouTube treats 2026 as a freshness signal for type beats.",
    fix: 'Add "2026" to all active video titles. Takes 2 minutes per video in Studio.',
  },
  {
    category: "Tag Coverage",
    score: 64,
    status: "Fair",
    finding: '6 of the top 8 trending keywords this month are missing from your recent video tags — including "sample flip" (+94%).',
    fix: "Update tags on your top 5 videos. Retroactive tag updates still influence ranking within 24–48 hrs.",
  },
  {
    category: "Description Length",
    score: 45,
    status: "Weak",
    finding: "Most descriptions are under 150 characters. YouTube reads descriptions for keyword context — optimal length is 400–600 chars.",
    fix: "Use the Upload Kit description template. It hits all relevant keywords without being spammy.",
  },
  {
    category: "Thumbnail CTR",
    score: 78,
    status: "Good",
    finding: "Your CTR is 3.8% (niche avg: 4.2%). Slightly below par — likely a contrast issue on mobile at small sizes.",
    fix: "Test one higher-contrast thumbnail variant. Even a +0.4% CTR lift compounds into thousands of extra views monthly.",
  },
  {
    category: "Channel Keyword",
    score: 88,
    status: "Good",
    finding: '"Boom bap" and "type beat" are well-placed in your channel name and about section.',
    fix: "No changes needed. Add 'jazz boom bap' to About section to capture the growing sub-niche.",
  },
  {
    category: "Playlist Structure",
    score: 33,
    status: "Weak",
    finding: "No public playlists. Playlists extend session time, improve suggested video placement, and signal content organization to YouTube.",
    fix: 'Create 3 playlists: "Jazz Boom Bap", "Free Beats 2026", "Sample Flip Beats". Populate with your existing videos.',
  },
];

const growthForecast = {
  current: 12847,
  projections: [
    {
      month: "June 2026",
      baseline: 13467,
      optimized: 13737,
      baselineDelta: "+620",
      optimizedDelta: "+890",
    },
    {
      month: "July 2026",
      baseline: 14147,
      optimized: 14877,
      baselineDelta: "+680",
      optimizedDelta: "+1,140",
    },
    {
      month: "August 2026",
      baseline: 14867,
      optimized: 16257,
      baselineDelta: "+720",
      optimizedDelta: "+1,380",
    },
  ],
  milestones: [
    { label: "15K subscribers", eta: "July 2026 (optimized)", current: false },
    { label: "20K subscribers", eta: "Q1 2027 (optimized)", current: false },
    { label: "Monetization threshold", eta: "Already eligible", current: true },
  ],
  actions: [
    { action: "Fix description length on 5 recent uploads", impact: "+8% avg views", effort: "Low" },
    { action: "Add 2026 year tag to all active titles", impact: "+12% search impressions", effort: "Low" },
    { action: "Upload 1 jazz boom bap video this month", impact: "+23% subscriber conversion", effort: "Medium" },
    { action: "Build 3 keyword playlists", impact: "+15% session duration", effort: "Low" },
    { action: "Shift to Thursday/Friday upload schedule", impact: "+34% first-week views", effort: "Low" },
  ],
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

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


const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

const scoreBarColor = (s: number) =>
  s >= 80 ? "bg-[#4ade80]" : s >= 60 ? "bg-[#fbbf24]" : "bg-[#f87171]";

// ── Types ────────────────────────────────────────────────────────────────────

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
  rising_artists: Array<{ name: string; channel: string; explanation: string }>;
  what_to_avoid: Array<{ pattern: string; impact: string; fix: string }>;
  action_plan: Array<{ action: string; priority: "High" | "Medium" | "Low"; detail: string }>;
  upload_kits: Array<{ title: string; description: string; tags: string[]; thumbnail: string }>;
  tally_score: number;
  score_breakdown: { categories: ScoreCategory[]; tip: string };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

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

  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  const avgViews =
    channelData && channelData.monthly_videos > 0
      ? Math.round(channelData.monthly_views / channelData.monthly_videos)
      : null;

  const snapshotStats = channelData
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
    <div className="space-y-8">
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

      {report?.channel_summary && (
        <p className="text-[#94a3b8] text-sm leading-relaxed -mt-2">
          {report.channel_summary}
        </p>
      )}

      {report && report.tally_score > 0 && (
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="shrink-0 text-center sm:text-left">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">TALLY Score</p>
              <p className={`text-6xl font-bold ${scoreColor(report.tally_score)}`}>
                {report.tally_score}
                <span className="text-2xl text-[#475569]">/100</span>
              </p>
              {nicheRank && (
                <p className="text-xs text-[#475569] mt-2">
                  Rank{" "}
                  <span className="text-white font-semibold">#{nicheRank.rank}</span>
                  {" "}of {nicheRank.total} in your genre
                </p>
              )}
            </div>
            <div className="flex-1 space-y-2.5">
              {report.score_breakdown?.categories?.map((cat) => (
                <div key={cat.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#94a3b8]">{cat.category}</span>
                    <span className={scoreColor(Math.round((cat.score / cat.max) * 100))}>
                      {cat.score}/{cat.max}
                    </span>
                  </div>
                  <div className="h-1 bg-[#1a1a1a]">
                    <div
                      className={`h-full ${scoreBarColor(Math.round((cat.score / cat.max) * 100))}`}
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
      )}

      {channelData && snapshotStats ? (
        <>
          <div>
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
              {monthLabel} Snapshot
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#1a1a1a]">
              {snapshotStats.map(({ label, value, sub, locked }) => (
                <div
                  key={label}
                  className={`bg-[#0a0a0a] p-6 ${locked ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-1.5 mb-4">
                    {locked && <Lock className="w-3 h-3 text-[#475569] shrink-0" />}
                    <p className="text-[#94a3b8] text-xs uppercase tracking-widest">
                      {label}
                    </p>
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${locked ? "text-[#2a2a2a]" : ""}`}>
                    {value}
                  </p>
                  <p className="text-xs text-[#475569]">{sub}</p>
                </div>
              ))}
            </div>

            {/* Upgrade banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-[#1a1a1a] px-5 py-4 bg-[#0d0d0d]">
              <div className="flex items-center gap-2.5">
                <Lock className="w-3.5 h-3.5 text-[#475569] shrink-0" />
                <p className="text-xs text-[#475569]">
                  Unlock full analytics by connecting your Google account — available on Pro plan
                </p>
              </div>
              <Link
                href="/pricing"
                className="shrink-0 text-xs font-semibold text-black bg-white px-4 py-2 hover:bg-[#e8e8e8] transition-colors"
              >
                Upgrade to Pro
              </Link>
            </div>
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
        </>
      ) : (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Channel data will appear here once your report is ready.
          </p>
        </div>
      )}
    </div>
  );
}

const badgeStyle: Record<string, string> = {
  hot:     "bg-[#1f0a0a] text-[#f87171]",
  stable:  "bg-[#1f1800] text-[#fbbf24]",
  rising:  "bg-[#0a1020] text-[#60a5fa]",
};

function KeywordsTab({ channelData }: { channelData: ChannelData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
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
          Tags appearing most frequently across top-performing videos in your niche.
          {channelData && ` Extracted from ${channelData.niche_data?.length ?? 0} niche videos.`}
        </p>
      </div>

      {!channelData ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">
            Keywords will appear here once your channel data is pulled.
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
                  <td className="px-5 py-4 text-white font-medium">{row.tag}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{row.count}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`text-xs px-2 py-1 capitalize ${badgeStyle[row.badge]}`}
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

function TopVideosTab({
  channelData,
  report,
}: {
  channelData: ChannelData | null;
  report: ReportData | null;
}) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  const topVideos =
    channelData && channelData.niche_data?.length
      ? getTopNicheVideos(channelData.niche_data)
      : [];

  const getBreakdown = (videoId: string) =>
    report?.trending_breakdowns?.find((b) => b.videoId === videoId)?.breakdown ?? null;

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
            Trending videos will appear here once your channel data is pulled.
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
                <p className="text-[#94a3b8] text-xs mt-1 mb-3">{video.channelName}</p>
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

function AvoidTab({ report }: { report: ReportData | null }) {
  const items = report?.what_to_avoid?.length
    ? report.what_to_avoid.map((p) => ({ title: p.pattern, impact: p.impact, detail: p.fix }))
    : avoidItems;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">What to Avoid This Month</h2>
        <p className="text-[#94a3b8] text-sm">
          Patterns pulling down performance in your genre right now.
          {report?.what_to_avoid?.length ? " AI-analyzed from your niche data." : ""}
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {items.map((item, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
            <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <span className="shrink-0 text-xs text-[#f87171] bg-[#1f0a0a] px-2 py-1">
                  {item.impact}
                </span>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadKitTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const kits = report?.upload_kits?.length ? report.upload_kits : null;

  if (kits) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-1">Upload Kit — {monthLabel}</h2>
          <p className="text-[#94a3b8] text-sm">
            3 AI-generated ready-to-use upload packages built from this month&apos;s niche data.
          </p>
        </div>
        <div className="space-y-8">
          {kits.map((kit, i) => (
            <div key={i} className="space-y-3">
              <p className="text-xs text-[#475569] uppercase tracking-widest">Kit {i + 1}</p>
              <div className="border border-[#1a1a1a] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Title</p>
                  <CopyButton text={kit.title} />
                </div>
                <p className="text-white font-medium">{kit.title}</p>
              </div>
              <div className="border border-[#1a1a1a] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Description</p>
                  <CopyButton text={kit.description} />
                </div>
                <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {kit.description}
                </pre>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-[#1a1a1a] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Tags</p>
                    <CopyButton text={kit.tags.join(", ")} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {kit.tags.map((tag) => (
                      <span key={tag} className="text-xs text-[#94a3b8] bg-[#111] border border-[#1e1e1e] px-3 py-1.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="border border-[#1a1a1a] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Thumbnail Concept</p>
                  <p className="text-[#cbd5e1] text-sm leading-relaxed">{kit.thumbnail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Upload Kit — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          Your ready-to-use package for your next upload, built from this month&apos;s report.
        </p>
      </div>
      <div className="space-y-4">
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Recommended Title</p>
            <CopyButton text={uploadKit.title} />
          </div>
          <p className="text-white font-medium mb-3">{uploadKit.title}</p>
          <p className="text-[#94a3b8] text-xs leading-relaxed">
            Leads with FREE · uses the top jazz boom bap keyword · includes &quot;sample flip&quot; (+94% trending) · ends with year for freshness.
          </p>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Description Template</p>
            <CopyButton text={uploadKit.description} />
          </div>
          <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {uploadKit.description}
          </pre>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Tags</p>
            <CopyButton text={uploadKit.tags.join(", ")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {uploadKit.tags.map((tag) => (
              <span key={tag} className="text-xs text-[#94a3b8] bg-[#111] border border-[#1e1e1e] px-3 py-1.5">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[#1a1a1a] p-6">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Thumbnail Concept</p>
            <p className="text-[#cbd5e1] text-sm leading-relaxed">{uploadKit.thumbnail}</p>
          </div>
          <div className="border border-[#1a1a1a] p-6">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Best Time to Upload</p>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[#4ade80]" />
              <p className="text-white font-semibold">{uploadKit.uploadTime}</p>
            </div>
            <p className="text-[#94a3b8] text-sm leading-relaxed">{uploadKit.uploadNote}</p>
          </div>
        </div>
      </div>
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
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const nicheVideos = channelData?.niche_data ?? [];
  const nicheAvg =
    nicheVideos.length > 0
      ? Math.round(nicheVideos.reduce((s, v) => s + v.viewCount, 0) / nicheVideos.length)
      : 0;
  const top10 = [...nicheVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
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
    { label: channelData?.channel_name ?? "You", value: producerAvg, color: "bg-white" },
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
          <p className="text-[#475569] text-sm">Benchmark will appear once data is loaded.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border border-[#1a1a1a] p-6 space-y-5">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#94a3b8]">{bar.label}</span>
                  <span className="text-white font-semibold">{formatNum(bar.value)} views/video</span>
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

          {report?.benchmark_insights && (
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">AI Insights</p>
              <p className="text-[#cbd5e1] text-sm leading-relaxed">{report.benchmark_insights}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RisingArtistsTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const artists = report?.rising_artists ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Rising Artists — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          Beat producers gaining momentum in your niche right now.
        </p>
      </div>
      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">Rising artists will appear once the AI report is generated.</p>
        </div>
      ) : artists.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">No rising artists identified this month.</p>
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
                  {artist.channel && (
                    <span className="text-[#475569] text-xs">{artist.channel}</span>
                  )}
                </div>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{artist.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const priorityStyle: Record<string, string> = {
  High:   "text-[#f87171] bg-[#1f0a0a]",
  Medium: "text-[#fbbf24] bg-[#1f1800]",
  Low:    "text-[#60a5fa] bg-[#0a1020]",
};

function ActionPlanTab({ report }: { report: ReportData | null }) {
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const actions = report?.action_plan ?? [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Action Plan — {monthLabel}</h2>
        <p className="text-[#94a3b8] text-sm">
          Prioritized steps to grow your channel this month, tailored to your data.
        </p>
      </div>
      {!report ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">Action plan will appear once the AI report is generated.</p>
        </div>
      ) : actions.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#475569] text-sm">No actions generated this month.</p>
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
                  <span className={`shrink-0 text-xs px-2 py-0.5 ${priorityStyle[item.priority] ?? ""}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorsTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Competitor Tracking — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Your closest competitors in boom bap. Sorted by monthly views.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {competitors.map((c, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-5">
              <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <p className="text-white font-semibold">{c.channel}</p>
                  <span className="text-[#475569] text-xs">{c.handle}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-[#94a3b8] mb-3">
                  <span><span className="text-white font-medium">{c.subs}</span> subs</span>
                  <span><span className="text-white font-medium">{c.monthlyViews}</span> views/mo</span>
                  <span>{c.freq}</span>
                </div>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  <span className="text-[#94a3b8] font-medium">Top video: </span>
                  {c.topVideo}
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed mt-1">
                  <span className="text-[#94a3b8] font-medium">Insight: </span>
                  {c.insight}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5 md:mt-1">
                {c.trending
                  ? <TrendingUp className="w-3.5 h-3.5 text-[#4ade80]" />
                  : <TrendingDown className="w-3.5 h-3.5 text-[#f87171]" />
                }
                <span className={`text-sm font-semibold ${c.trending ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                  {c.trend} MoM
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudienceTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Audience Demographics — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Who&apos;s watching your channel and where they&apos;re coming from.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Age Groups</p>
          </div>
          <div className="space-y-4">
            {audience.ageGroups.map((a) => (
              <div key={a.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#cbd5e1]">{a.label}</span>
                  <span className="text-white font-semibold">{a.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#1a1a1a]">
                  <div className="h-full bg-white transition-all" style={{ width: `${a.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            Core audience is 18–34 (80%). Skews younger than the broader hip-hop demographic — optimize for mobile-first thumbnails and short, punchy descriptions.
          </p>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Top Countries</p>
          </div>
          <div className="space-y-3">
            {audience.countries.map((c) => (
              <div key={c.country} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="text-sm text-[#cbd5e1]">{c.country}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1 bg-[#1a1a1a]">
                    <div className="h-full bg-[#94a3b8]" style={{ width: `${(c.pct / 54) * 100}%` }} />
                  </div>
                  <span className="text-sm text-white font-medium w-8 text-right">{c.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Smartphone className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Device Breakdown</p>
          </div>
          <div className="space-y-4">
            {audience.devices.map((d) => (
              <div key={d.label} className="flex items-center gap-4">
                <div className="w-24 shrink-0 flex items-center gap-2">
                  {d.icon === "mobile"  ? <Smartphone className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  {d.icon === "desktop" ? <Monitor className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  {d.icon === "tablet"  ? <Monitor className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  <span className="text-sm text-[#cbd5e1]">{d.label}</span>
                </div>
                <div className="flex-1 h-1.5 bg-[#1a1a1a]">
                  <div className="h-full bg-white" style={{ width: `${d.pct}%` }} />
                </div>
                <span className="text-sm text-white font-semibold w-8 text-right">{d.pct}%</span>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            61% mobile. Thumbnail text must be legible at 120px. Avoid small fine-print in thumbnail designs.
          </p>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Search className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Traffic Sources</p>
          </div>
          <div className="space-y-4">
            {audience.traffic.map((t) => (
              <div key={t.source}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#cbd5e1]">{t.source}</span>
                  <span className="text-white font-semibold">{t.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#1a1a1a]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            44% search-driven. Your channel is more search-dependent than average (niche avg: 31%) — improving tags and titles has outsized impact.
          </p>
        </div>
      </div>
    </div>
  );
}

function ContentGapsTab() {
  const oppBadge: Record<string, string> = {
    "Very High": "bg-[#0a1f12] text-[#4ade80]",
    High:        "bg-[#0a1f12] text-[#86efac]",
    Medium:      "bg-[#1f1800] text-[#fbbf24]",
    Low:         "bg-[#1f0a0a] text-[#f87171]",
  };
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Content Gaps — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Topics with strong search demand but low supply in boom bap right now.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {contentGaps.map((gap, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
            <Target className="w-4 h-4 text-[#4ade80] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-white">{gap.topic}</h3>
                <span className={`shrink-0 text-xs px-2 py-1 ${oppBadge[gap.opportunity]}`}>
                  {gap.opportunity}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-[#94a3b8] mb-3">
                <span><span className="text-white font-medium">{gap.searches}</span> monthly searches</span>
                <span><span className="text-white font-medium">{gap.supply}</span> competing videos this month</span>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{gap.why}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SEOAuditTab() {
  const statusColor: Record<string, string> = {
    Good: "text-[#4ade80]",
    Fair: "text-[#fbbf24]",
    Weak: "text-[#f87171]",
  };
  const overall = Math.round(seoAudit.reduce((s, a) => s + a.score, 0) / seoAudit.length);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">SEO Audit — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          How well your channel and videos are optimized for search right now.
        </p>
      </div>
      <div className="border border-[#1a1a1a] p-6 mb-6 flex items-center gap-6">
        <div>
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Overall SEO Score</p>
          <p className={`text-5xl font-bold ${scoreColor(overall)}`}>{overall}<span className="text-xl text-[#475569]">/100</span></p>
        </div>
        <div className="flex-1 hidden sm:block">
          <div className="h-2 bg-[#1a1a1a]">
            <div className={`h-full transition-all ${scoreBarColor(overall)}`} style={{ width: `${overall}%` }} />
          </div>
          <p className="text-[#94a3b8] text-xs mt-2">
            Quick wins on descriptions and tags alone could push this to 80+.
          </p>
        </div>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {seoAudit.map((item, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <BarChart2 className="w-4 h-4 text-[#64748b] shrink-0" />
                <h3 className="font-semibold text-white">{item.category}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${scoreColor(item.score)}`}>{item.score}</span>
                <span className={`text-xs ${statusColor[item.status]}`}>{item.status}</span>
              </div>
            </div>
            <div className="h-1 bg-[#1a1a1a] mb-4 ml-7">
              <div className={`h-full ${scoreBarColor(item.score)}`} style={{ width: `${item.score}%` }} />
            </div>
            <p className="text-[#94a3b8] text-sm leading-relaxed ml-7 mb-2">{item.finding}</p>
            <p className="text-xs text-[#4ade80] ml-7">
              <span className="text-[#64748b]">Fix: </span>{item.fix}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthForecastTab() {
  const effortColor: Record<string, string> = {
    Low:    "text-[#4ade80] bg-[#0a1f12]",
    Medium: "text-[#fbbf24] bg-[#1f1800]",
    High:   "text-[#f87171] bg-[#1f0a0a]",
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Growth Forecast — Next 90 Days</h2>
        <p className="text-[#94a3b8] text-sm">
          Projected growth with and without applying this month&apos;s recommendations.
        </p>
      </div>

      <div className="border border-[#1a1a1a] p-6 mb-6">
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Current Subscribers</p>
        <p className="text-4xl font-bold">{growthForecast.current.toLocaleString()}</p>
        <p className="text-[#94a3b8] text-sm mt-1">as of May 2026</p>
      </div>

      <div className="border border-[#1a1a1a] overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">Month</th>
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">No changes</th>
              <th className="text-left text-xs text-[#4ade80] uppercase tracking-widest px-5 py-4 font-medium">With optimizations</th>
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">Uplift</th>
            </tr>
          </thead>
          <tbody>
            {growthForecast.projections.map((p, i) => {
              const uplift = p.optimized - p.baseline;
              return (
                <tr key={i} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-4 text-white font-medium">{p.month}</td>
                  <td className="px-5 py-4">
                    <span className="text-white">{p.baseline.toLocaleString()}</span>
                    <span className="text-[#475569] text-xs ml-2">({p.baselineDelta})</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[#4ade80] font-semibold">{p.optimized.toLocaleString()}</span>
                    <span className="text-[#4ade80] text-xs ml-2">({p.optimizedDelta})</span>
                  </td>
                  <td className="px-5 py-4 text-[#94a3b8] text-xs">+{uplift.toLocaleString()} extra</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border border-[#1a1a1a] p-6 mb-6">
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-5">Milestones</p>
        <div className="space-y-3">
          {growthForecast.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-2 h-2 shrink-0 ${m.current ? "bg-[#4ade80]" : "bg-[#1a1a1a] border border-[#3a3a3a]"}`} />
              <span className="text-sm text-white font-medium">{m.label}</span>
              <span className="text-sm text-[#94a3b8]">—</span>
              <span className={`text-sm ${m.current ? "text-[#4ade80]" : "text-[#94a3b8]"}`}>{m.eta}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#1a1a1a] p-6">
        <div className="flex items-center gap-2 mb-5">
          <Zap className="w-4 h-4 text-[#fbbf24]" />
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Top Actions This Month</p>
        </div>
        <div className="space-y-3">
          {growthForecast.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3">
              <span className="text-[#475569] text-xs font-bold w-4 shrink-0 mt-0.5">{i + 1}.</span>
              <span className="text-sm text-[#cbd5e1] flex-1">{a.action}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[#4ade80]">{a.impact}</span>
                <span className={`text-xs px-2 py-0.5 ${effortColor[a.effort]}`}>{a.effort} effort</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "keywords"
  | "top-videos"
  | "benchmark"
  | "rising-artists"
  | "action-plan"
  | "avoid"
  | "upload-kit"
  | "competitors"
  | "audience"
  | "content-gaps"
  | "seo-audit"
  | "growth-forecast";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",        label: "Overview"        },
  { id: "keywords",        label: "Keywords"        },
  { id: "top-videos",      label: "Top Videos"      },
  { id: "benchmark",       label: "Benchmark"       },
  { id: "rising-artists",  label: "Rising Artists"  },
  { id: "action-plan",     label: "Action Plan"     },
  { id: "avoid",           label: "What to Avoid"   },
  { id: "upload-kit",      label: "Upload Kit"      },
  { id: "competitors",     label: "Competitors"     },
  { id: "audience",        label: "Audience"        },
  { id: "content-gaps",    label: "Content Gaps"    },
  { id: "seo-audit",       label: "SEO Audit"       },
  { id: "growth-forecast", label: "Growth Forecast" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [nicheRank, setNicheRank] = useState<{ rank: number; total: number } | null>(null);

  const generateReport = useCallback(async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/report/generate", { method: "POST" });
      const json = await res.json();
      if (res.ok) setReport(json as ReportData);
    } catch {
      // Silent fail — report sections show placeholder content
    } finally {
      setGeneratingReport(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!userId) return;
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
      setChannelData(json as ChannelData);
      generateReport();
    } catch (err: unknown) {
      setPullError(err instanceof Error ? err.message : "Failed to pull channel data");
    } finally {
      setPulling(false);
    }
  }, [userId, generateReport]);

  const triggerPull = useCallback(async () => {
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch("/api/youtube/pull", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pull failed");
      setChannelData(json as ChannelData);
    } catch (err: unknown) {
      setPullError(err instanceof Error ? err.message : "Failed to pull channel data");
    } finally {
      setPulling(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
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
          if (data) setProfile(data as UserProfile);
          setLoadingUser(false);

          if (!data?.youtube_channel_url) return;

          // Check for this month's channel data
          const now = new Date();
          const { data: existing } = await supabase
            .from("channel_data")
            .select("*")
            .eq("producer_id", user.id)
            .eq("month", now.getMonth() + 1)
            .eq("year", now.getFullYear())
            .single();

          if (existing) {
            setChannelData(existing as ChannelData);
            // Check for a cached report for this month
            const { data: cachedReport } = await supabase
              .from("reports")
              .select("*")
              .eq("producer_id", user.id)
              .eq("month", now.getMonth() + 1)
              .eq("year", now.getFullYear())
              .single();
            if (cachedReport) {
              setReport(cachedReport as ReportData);
            } else {
              generateReport();
            }
          } else {
            // No data for this month — pull it now
            setPulling(true);
            setPullError(null);
            try {
              const res = await fetch("/api/youtube/pull", { method: "POST" });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Pull failed");
              setChannelData(json as ChannelData);
              generateReport();
            } catch (err: unknown) {
              setPullError(
                err instanceof Error ? err.message : "Failed to pull channel data"
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

  const displayName = profile?.name || userEmail?.split("@")[0] || "Producer";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="sticky top-0 z-10 bg-[#0a0a0a]">
        <nav className="border-b border-[#1a1a1a] px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="text-sm font-bold tracking-[0.25em]">
              TALLY
            </Link>
            <div className="flex items-center gap-5">
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
                <RefreshCw className={`w-3.5 h-3.5 ${pulling ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{pulling ? "Refreshing…" : "Refresh data"}</span>
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
          </div>
        </nav>
        <div className="border-b border-[#1a1a1a] px-6">
          <div className="max-w-6xl mx-auto flex overflow-x-auto">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 text-sm px-4 py-3.5 border-b-2 transition-colors cursor-pointer ${
                  tab === id
                    ? "border-white text-white"
                    : "border-transparent text-[#94a3b8] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {pulling && (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm mb-8 border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin shrink-0" />
            Pulling your channel data from YouTube...
          </div>
        )}
        {generatingReport && !pulling && (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm mb-8 border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
            TALLY is analyzing your channel...
          </div>
        )}
        {pullError && !pulling && (
          <div className="flex items-start gap-3 mb-8 border border-[#f87171]/30 px-5 py-4">
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
        {tab === "overview"        && <OverviewTab profile={profile} channelData={channelData} report={report} nicheRank={nicheRank} />}
        {tab === "keywords"        && <KeywordsTab channelData={channelData} />}
        {tab === "top-videos"      && <TopVideosTab channelData={channelData} report={report} />}
        {tab === "benchmark"       && <BenchmarkTab channelData={channelData} report={report} />}
        {tab === "rising-artists"  && <RisingArtistsTab report={report} />}
        {tab === "action-plan"     && <ActionPlanTab report={report} />}
        {tab === "avoid"           && <AvoidTab report={report} />}
        {tab === "upload-kit"      && <UploadKitTab report={report} />}
        {tab === "competitors"     && <CompetitorsTab />}
        {tab === "audience"        && <AudienceTab />}
        {tab === "content-gaps"    && <ContentGapsTab />}
        {tab === "seo-audit"       && <SEOAuditTab />}
        {tab === "growth-forecast" && <GrowthForecastTab />}
      </main>
    </div>
  );
}
