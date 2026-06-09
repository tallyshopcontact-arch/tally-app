"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { extractKeywords } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";
import {
  IconChartBar,
  IconFileText,
  IconTag,
  IconUsers,
} from "@tabler/icons-react";
import { ArrowUpRight, RefreshCw, TrendingDown, TrendingUp, Type } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  name: string | null;
  genre: string | null;
  youtube_channel_url: string | null;
}

interface ChannelData {
  monthly_views: number;
  monthly_subscribers: number;
  monthly_videos: number;
  niche_data: NicheVideo[];
}

interface ReportSummary {
  tally_score: number;
  action_plan: unknown[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

// ── Page ──────────────────────────────────────────────────────────────────────

function SubscribedBanner() {
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (searchParams.get("subscribed") === "true") {
      setShow(true);
      const t = setTimeout(() => setShow(false), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  if (!show) return null;
  return (
    <div className="bg-[#0a1a0a] border-b border-[#1a3a1a] px-6 py-3 text-center">
      <p className="text-sm text-[#4ade80] font-medium">
        Welcome to TALLY Pro! Your trial has started — explore all 7 tools.
      </p>
    </div>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [kitsThisMonth, setKitsThisMonth] = useState<number>(0);
  const [scoreHistory, setScoreHistory] = useState<Array<{ score: number }>>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email ?? null);

      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const [profileRes, channelRes, reportRes, kitsRes, historyRes] = await Promise.all([
        supabase.from("profiles").select("name, genre, youtube_channel_url").eq("id", user.id).single(),
        supabase.from("channel_data").select("monthly_views, monthly_subscribers, monthly_videos, niche_data").eq("producer_id", user.id).eq("month", month).eq("year", year).single(),
        supabase.from("reports").select("tally_score, action_plan").eq("producer_id", user.id).eq("month", month).eq("year", year).single(),
        supabase.from("upload_kits").select("id", { count: "exact" }).eq("producer_id", user.id).gte("created_at", new Date(year, month - 1, 1).toISOString()).lt("created_at", new Date(year, month, 1).toISOString()),
        supabase.from("scores_history").select("score").eq("producer_id", user.id).order("year", { ascending: true }).order("month", { ascending: true }).limit(6),
      ]);

      if (profileRes.data) setProfile(profileRes.data as UserProfile);
      if (channelRes.data) setChannelData(channelRes.data as ChannelData);
      if (reportRes.data) setReport(reportRes.data as ReportSummary);
      setKitsThisMonth(kitsRes.count ?? 0);
      if (historyRes.data && historyRes.data.length > 0) setScoreHistory(historyRes.data);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const displayName = profile?.name || userEmail?.split("@")[0] || "Producer";
  const topKeyword = channelData?.niche_data?.length
    ? extractKeywords(channelData.niche_data)[0]?.tag ?? null
    : null;

  const statsRow = [
    { label: "Views this month", value: channelData ? formatNum(channelData.monthly_views) : "—" },
    { label: "Videos uploaded", value: channelData ? channelData.monthly_videos.toString() : "—" },
    { label: "Top keyword", value: topKeyword ?? "—" },
    { label: "TALLY score", value: report ? report.tally_score.toString() : "—", color: report ? scoreColor(report.tally_score) : "" },
  ];

  const tools: {
    label: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    iconColor: string;
    stat?: string;
    statLabel?: string;
    cta: string;
    ctaStyle: "primary" | "secondary";
  }[] = [
    {
      label: "Monthly Report",
      description: report ? `${monthLabel} report is ready` : loading ? "Loading..." : "Generating...",
      href: "/dashboard/report",
      icon: <IconChartBar size={18} stroke={1.5} className="text-[#60a5fa]" />,
      iconColor: "text-[#60a5fa]",
      stat: report && report.tally_score > 0 ? report.tally_score.toString() : undefined,
      statLabel: "TALLY Score",
      cta: "View Report",
      ctaStyle: "primary",
    },
    {
      label: "Upload Kit Generator",
      description: "Generate your YouTube package for any beat",
      href: "/dashboard/upload-kit",
      icon: <IconFileText size={18} stroke={1.5} className="text-[#4ade80]" />,
      iconColor: "text-[#4ade80]",
      stat: loading ? "..." : kitsThisMonth.toString(),
      statLabel: "kits this month",
      cta: "Create Kit",
      ctaStyle: "secondary",
    },
    {
      label: "Title Tester",
      description: "Score your YouTube titles for SEO and clicks",
      href: "/dashboard/title-tester",
      icon: <Type className="w-[18px] h-[18px] text-[#fbbf24]" />,
      iconColor: "text-[#fbbf24]",
      cta: "Test a Title",
      ctaStyle: "secondary",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Suspense fallback={null}>
        <SubscribedBanner />
      </Suspense>

      {/* Header */}
      <nav className="h-14 border-b border-[#1a1a1a] px-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
        <div className="flex items-center gap-5">
          {!loading && (
            <span className="text-xs text-[#94a3b8] hidden sm:block">
              {displayName}{profile?.genre ? ` · ${profile.genre}` : ""}
            </span>
          )}
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">Settings</Link>
          <button onClick={handleSignOut} className="text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">{monthLabel}</p>
          <h1 className="text-3xl font-bold">
            Welcome back, {loading ? "..." : displayName}
          </h1>
        </div>

        {/* 2×2 tool grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {tools.map((tool) => (
            <div key={tool.href} className="border border-[#1a1a1a] p-7 flex flex-col bg-[#0a0a0a] hover:bg-[#0d0d0d] transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-[#111] border border-[#1e1e1e] flex items-center justify-center shrink-0">
                  {tool.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm">{tool.label}</p>
                  <p className="text-[#94a3b8] text-xs mt-0.5">{tool.description}</p>
                </div>
              </div>

              {tool.stat !== undefined ? (
                <div className="mb-6">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">{tool.statLabel}</p>
                  <div className="flex items-end gap-4">
                    <p className={`text-5xl font-bold ${tool.label === "Monthly Report" && report ? scoreColor(report.tally_score) : "text-white"}`}>
                      {tool.stat}
                      {tool.label === "Monthly Report" && report && (
                        <span className="text-xl text-[#1e1e1e]">/100</span>
                      )}
                    </p>
                    {tool.label === "Monthly Report" && scoreHistory.length >= 2 && (
                      <div className="flex-1 flex flex-col items-end gap-1 pb-1">
                        <ResponsiveContainer width="100%" height={32}>
                          <LineChart data={scoreHistory}>
                            <Line type="monotone" dataKey="score" stroke={report && report.tally_score >= 70 ? "#4ade80" : report && report.tally_score >= 40 ? "#fbbf24" : "#f87171"} strokeWidth={1.5} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                        {(() => {
                          const trend = scoreHistory[scoreHistory.length - 1].score - scoreHistory[scoreHistory.length - 2].score;
                          return trend > 0
                            ? <span className="text-[10px] text-[#4ade80] flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> improving</span>
                            : trend < 0
                            ? <span className="text-[10px] text-[#f87171] flex items-center gap-0.5"><TrendingDown className="w-3 h-3" /> declining</span>
                            : <span className="text-[10px] text-[#475569]">stable</span>;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-[#475569] animate-spin" />
                      <p className="text-[#475569] text-xs">Loading...</p>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-auto">
                <Link
                  href={tool.href}
                  className={`flex items-center justify-center gap-2 w-full text-xs font-semibold py-3 transition-colors ${
                    tool.ctaStyle === "primary"
                      ? "bg-white text-black hover:bg-[#e8e8e8]"
                      : "border border-white text-white hover:bg-white hover:text-black"
                  }`}
                >
                  {tool.cta}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Competitor Tracker — 5th card full width */}
        <div className="border border-[#1a1a1a] p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-[#0a0a0a] hover:bg-[#0d0d0d] transition-colors mb-10">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-[#111] border border-[#1e1e1e] flex items-center justify-center shrink-0">
              <IconUsers size={18} stroke={1.5} className="text-[#a78bfa]" />
            </div>
            <div>
              <p className="font-semibold text-sm">Competitor Tracker</p>
              <p className="text-[#94a3b8] text-xs mt-0.5">Track up to 5 competitor channels and compare stats</p>
            </div>
          </div>
          <Link
            href="/dashboard/competitors"
            className="shrink-0 flex items-center justify-center gap-2 border border-white text-white text-xs font-semibold px-6 py-3 hover:bg-white hover:text-black transition-colors"
          >
            View Tracker
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a1a1a]">
          {statsRow.map(({ label, value, color }) => (
            <div key={label} className="bg-[#0a0a0a] px-5 py-5">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">{label}</p>
              <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/dashboard/report" className="text-xs text-[#94a3b8] hover:text-white transition-colors">→ Monthly Report</Link>
          <Link href="/dashboard/upload-kit" className="text-xs text-[#94a3b8] hover:text-white transition-colors">→ Upload Kit Generator</Link>
          <Link href="/dashboard/title-tester" className="text-xs text-[#94a3b8] hover:text-white transition-colors">→ Title Tester</Link>
          <Link href="/dashboard/competitors" className="text-xs text-[#94a3b8] hover:text-white transition-colors">→ Competitor Tracker</Link>
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors">→ Settings</Link>
        </div>
      </div>
    </div>
  );
}
