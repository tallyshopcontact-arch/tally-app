"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { extractKeywords } from "@/lib/keywords";
import type { NicheVideo } from "@/lib/keywords";
import { IconChartBar, IconFileText } from "@tabler/icons-react";
import { ArrowUpRight, RefreshCw } from "lucide-react";

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

export default function DashboardHome() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [kitsThisMonth, setKitsThisMonth] = useState<number>(0);
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

      const [profileRes, channelRes, reportRes, kitsRes] = await Promise.all([
        supabase.from("profiles").select("name, genre, youtube_channel_url").eq("id", user.id).single(),
        supabase.from("channel_data").select("monthly_views, monthly_subscribers, monthly_videos, niche_data").eq("producer_id", user.id).eq("month", month).eq("year", year).single(),
        supabase.from("reports").select("tally_score, action_plan").eq("producer_id", user.id).eq("month", month).eq("year", year).single(),
        supabase.from("upload_kits").select("id", { count: "exact" }).eq("producer_id", user.id).gte("created_at", new Date(year, month - 1, 1).toISOString()).lt("created_at", new Date(year, month, 1).toISOString()),
      ]);

      if (profileRes.data) setProfile(profileRes.data as UserProfile);
      if (channelRes.data) setChannelData(channelRes.data as ChannelData);
      if (reportRes.data) setReport(reportRes.data as ReportSummary);
      setKitsThisMonth(kitsRes.count ?? 0);
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <nav className="h-14 border-b border-[#1a1a1a] px-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
        <div className="flex items-center gap-5">
          {!loading && (
            <span className="text-xs text-[#475569] hidden sm:block">
              {displayName}{profile?.genre ? ` · ${profile.genre}` : ""}
            </span>
          )}
          <Link href="/settings" className="text-xs text-[#475569] hover:text-white transition-colors hidden sm:block">Settings</Link>
          <button onClick={handleSignOut} className="text-xs text-[#475569] hover:text-white transition-colors cursor-pointer">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <p className="text-xs text-[#475569] uppercase tracking-widest mb-2">{monthLabel}</p>
          <h1 className="text-3xl font-bold">
            Welcome back, {loading ? "..." : displayName}
          </h1>
        </div>

        {/* Two cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {/* Monthly Report card */}
          <div className="border border-[#1a1a1a] p-7 flex flex-col bg-[#0a0a0a] hover:bg-[#0d0d0d] transition-colors">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-[#111] border border-[#1e1e1e] flex items-center justify-center shrink-0">
                <IconChartBar size={18} stroke={1.5} className="text-[#60a5fa]" />
              </div>
              <div>
                <p className="font-semibold text-sm">Monthly Report</p>
                <p className="text-[#475569] text-xs mt-0.5">
                  {report ? `${monthLabel} report is ready` : loading ? "Loading..." : "Generating..."}
                </p>
              </div>
            </div>

            {report && report.tally_score > 0 ? (
              <div className="mb-6">
                <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">TALLY Score</p>
                <p className={`text-5xl font-bold ${scoreColor(report.tally_score)}`}>
                  {report.tally_score}
                  <span className="text-xl text-[#1e1e1e]">/100</span>
                </p>
              </div>
            ) : (
              <div className="mb-6 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-[#2a2a2a] animate-spin" />
                <p className="text-[#2a2a2a] text-xs">Generating your report...</p>
              </div>
            )}

            <div className="mt-auto">
              <Link
                href="/dashboard/report"
                className="flex items-center justify-center gap-2 w-full bg-white text-black text-xs font-semibold py-3 hover:bg-[#e8e8e8] transition-colors"
              >
                View Report
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Upload Kit Generator card */}
          <div className="border border-[#1a1a1a] p-7 flex flex-col bg-[#0a0a0a] hover:bg-[#0d0d0d] transition-colors">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-[#111] border border-[#1e1e1e] flex items-center justify-center shrink-0">
                <IconFileText size={18} stroke={1.5} className="text-[#4ade80]" />
              </div>
              <div>
                <p className="font-semibold text-sm">Upload Kit Generator</p>
                <p className="text-[#475569] text-xs mt-0.5">Generate your YouTube package for any beat</p>
              </div>
            </div>

            <div className="mb-6">
              <p className={`text-5xl font-bold ${kitsThisMonth > 0 ? "text-white" : "text-[#1e1e1e]"}`}>
                {loading ? "..." : kitsThisMonth}
              </p>
              <p className="text-[#475569] text-xs mt-1">kits generated this month</p>
            </div>

            <div className="mt-auto">
              <Link
                href="/dashboard/upload-kit"
                className="flex items-center justify-center gap-2 w-full border border-white text-white text-xs font-semibold py-3 hover:bg-white hover:text-black transition-colors"
              >
                Create Kit
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a1a1a]">
          {statsRow.map(({ label, value, color }) => (
            <div key={label} className="bg-[#0a0a0a] px-5 py-5">
              <p className="text-xs text-[#475569] uppercase tracking-widest mb-2">{label}</p>
              <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/dashboard/upload-kit" className="text-xs text-[#475569] hover:text-white transition-colors">
            → Upload Kit Generator
          </Link>
          <Link href="/dashboard/report" className="text-xs text-[#475569] hover:text-white transition-colors">
            → Monthly Report
          </Link>
          <Link href="/settings" className="text-xs text-[#475569] hover:text-white transition-colors">
            → Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
