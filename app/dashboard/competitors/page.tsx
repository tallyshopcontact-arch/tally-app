"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ArrowUpRight, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoreBreakdownItem {
  category: string;
  score: number;
  max: number;
}

interface StealThis {
  tactic: string;
  reason: string;
}

interface LastData {
  videos_this_month: number;
  top_video: { title: string; views: number; videoId: string } | null;
  avg_views: number;
  niche_avg_views?: number;
  tally_score?: number;
  score_breakdown?: ScoreBreakdownItem[];
  steal_this?: StealThis[];
  // legacy field from before deep analysis
  ai_insight?: string;
  timing?: { best_day: string | null; best_day_multiplier: number };
  title_formula?: string;
  top_artists?: string[];
  key_gap?: string;
  pulled_at: string;
}

interface Competitor {
  id: string;
  channel_url: string;
  channel_id: string;
  channel_name: string;
  subscriber_count: number;
  last_data: LastData | null;
  added_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Steal This section ────────────────────────────────────────────────────────

function StealThisSection({ items }: { items: StealThis[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[#1e2a1e]">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#0d150d] transition-colors cursor-pointer text-left"
      >
        <span className="text-xs text-[#4ade80] uppercase tracking-widest font-medium">
          Steal this ({items.length} tactics)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[#4ade80]" /> : <ChevronDown className="w-4 h-4 text-[#4ade80]" />}
      </button>
      {open && (
        <div className="border-t border-[#1e2a1e] divide-y divide-[#1a1a1a]">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-4">
              <p className="text-white text-sm font-medium mb-1">{item.tactic}</p>
              <p className="text-[#94a3b8] text-xs leading-relaxed">{item.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompetitorsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [producerAvgViews, setProducerAvgViews] = useState<number | null>(null);
  const [producerTallyScore, setProducerTallyScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserEmail(user.email ?? null);

    const now = new Date();
    const [compRes, channelRes, scoreRes] = await Promise.all([
      supabase.from("competitors").select("*").eq("producer_id", user.id).order("added_at", { ascending: true }),
      supabase.from("channel_data").select("monthly_views, monthly_videos").eq("producer_id", user.id).eq("month", now.getMonth() + 1).eq("year", now.getFullYear()).single(),
      supabase.from("scores_history").select("score").eq("producer_id", user.id).order("year", { ascending: false }).order("month", { ascending: false }).limit(1).single(),
    ]);

    if (compRes.data) setCompetitors(compRes.data as Competitor[]);
    const cd = channelRes.data;
    if (cd && cd.monthly_videos > 0) {
      setProducerAvgViews(Math.round(cd.monthly_views / cd.monthly_videos));
    }
    if (scoreRes.data?.score) setProducerTallyScore(scoreRes.data.score);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleAdd = async () => {
    if (!urlInput.trim() || competitors.length >= 5) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/competitors/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_url: urlInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add competitor");
      setUrlInput("");
      await loadData();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("competitors").delete().eq("id", id);
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        competitors.map((c) =>
          fetch("/api/competitors/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_url: c.channel_url }),
          })
        )
      );
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const displayName = userEmail?.split("@")[0] ?? "Producer";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <nav className="h-14 border-b border-[#1a1a1a] px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-[#475569] hover:text-[#94a3b8] transition-colors text-xs hidden sm:flex items-center gap-1">
            ← Dashboard
          </Link>
          <Link href="/dashboard" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
          <span className="text-[#2a2a2a] hidden sm:block">|</span>
          <span className="text-xs text-[#475569] hidden sm:block">Competitor Tracker</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-[#94a3b8] hidden sm:block">{displayName}</span>
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">Settings</Link>
          <button onClick={handleSignOut} className="text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Sign out</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">Competitor Tracker</h1>
            <p className="text-[#94a3b8] text-sm">Track up to 5 competitor YouTube channels and compare performance.</p>
          </div>
          {competitors.length > 0 && (
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="flex items-center gap-2 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white px-4 py-2.5 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh All"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
            Loading competitors...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Add competitor */}
            {competitors.length < 5 && (
              <div className="border border-[#1a1a1a] p-6">
                <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Add Competitor ({competitors.length}/5)</p>
                <div className="flex gap-3">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="https://www.youtube.com/@channelname"
                    className="flex-1 bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={adding || !urlInput.trim()}
                    className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-5 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {adding ? "Analyzing..." : "Add"}
                  </button>
                </div>
                {addError && (
                  <p className="text-[#f87171] text-xs mt-2">{addError}</p>
                )}
              </div>
            )}

            {/* No competitors yet */}
            {competitors.length === 0 && (
              <div className="border border-[#1a1a1a] p-10 text-center">
                <p className="text-white font-medium mb-1">No competitors added yet</p>
                <p className="text-[#475569] text-sm max-w-xs mx-auto">Paste a YouTube channel URL above to start tracking.</p>
              </div>
            )}

            {/* Competitor cards */}
            {competitors.map((comp) => {
              const ld = comp.last_data;
              const avgViews = ld?.avg_views ?? 0;
              const diff = producerAvgViews !== null ? avgViews - producerAvgViews : null;

              return (
                <div key={comp.id} className="border border-[#1a1a1a]">
                  {/* Channel header */}
                  <div className="flex items-start justify-between gap-4 p-6 border-b border-[#1a1a1a]">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={comp.channel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white font-bold text-lg hover:underline inline-flex items-center gap-1"
                        >
                          {comp.channel_name}
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#475569]" />
                        </a>
                      </div>
                      <p className="text-[#94a3b8] text-sm">{formatNum(comp.subscriber_count)} subscribers</p>
                    </div>
                    <button
                      onClick={() => handleDelete(comp.id)}
                      className="text-[#475569] hover:text-[#f87171] transition-colors cursor-pointer shrink-0"
                      title="Remove competitor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {ld ? (
                    <div className="p-6 space-y-4">
                      {/* Stats grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#1a1a1a]">
                        <div className="bg-[#0a0a0a] px-4 py-4">
                          <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">Videos This Month</p>
                          <p className="text-2xl font-bold">{ld.videos_this_month}</p>
                        </div>
                        <div className="bg-[#0a0a0a] px-4 py-4">
                          <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">Avg Views / Video</p>
                          <p className="text-2xl font-bold">{formatNum(avgViews)}</p>
                          {diff !== null && (
                            <p className={`text-xs mt-0.5 ${diff > 0 ? "text-[#f87171]" : "text-[#4ade80]"}`}>
                              {diff > 0 ? `+${formatNum(diff)} vs you` : `${formatNum(Math.abs(diff))} less than you`}
                            </p>
                          )}
                        </div>
                        <div className="bg-[#0a0a0a] px-4 py-4 col-span-2 sm:col-span-1">
                          <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">TALLY Score</p>
                          {ld.tally_score !== undefined ? (
                            <>
                              <p className={`text-2xl font-bold ${ld.tally_score >= 70 ? "text-[#4ade80]" : ld.tally_score >= 40 ? "text-[#fbbf24]" : "text-[#f87171]"}`}>
                                {ld.tally_score}/100
                              </p>
                              {producerTallyScore !== null && (
                                <p className={`text-xs mt-0.5 ${ld.tally_score > producerTallyScore ? "text-[#f87171]" : "text-[#4ade80]"}`}>
                                  {ld.tally_score > producerTallyScore
                                    ? `They score ${ld.tally_score - producerTallyScore} pts higher`
                                    : ld.tally_score < producerTallyScore
                                    ? `You score ${producerTallyScore - ld.tally_score} pts higher`
                                    : "Tied with you"}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-[#475569] mt-1">Refresh to calculate</p>
                          )}
                        </div>
                      </div>

                      {/* Intelligence row: title formula + timing */}
                      {(ld.title_formula || ld.timing?.best_day) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#1a1a1a]">
                          {ld.title_formula && (
                            <div className="bg-[#0a0a0a] px-4 py-4">
                              <p className="text-xs text-[#475569] uppercase tracking-widest mb-1.5">Title Formula</p>
                              <p className="text-white text-sm font-medium leading-snug">{ld.title_formula}</p>
                            </div>
                          )}
                          {ld.timing?.best_day && (
                            <div className="bg-[#0a0a0a] px-4 py-4">
                              <p className="text-xs text-[#475569] uppercase tracking-widest mb-1.5">Best Upload Day</p>
                              <p className="text-white text-sm font-medium">
                                {ld.timing.best_day}
                                {ld.timing.best_day_multiplier > 1 && (
                                  <span className="text-[#4ade80] text-xs ml-2">
                                    {ld.timing.best_day_multiplier}x more views
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Top artists */}
                      {ld.top_artists && ld.top_artists.length > 0 && (
                        <div className="flex items-center gap-3">
                          <p className="text-xs text-[#475569] uppercase tracking-widest shrink-0">Top Artists</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ld.top_artists.map((a) => (
                              <span key={a} className="text-xs text-[#94a3b8] bg-[#0d0d0d] border border-[#1e1e1e] px-2 py-0.5">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Key gap */}
                      {ld.key_gap && (
                        <div className="border border-[#1e1e1e] px-4 py-3">
                          <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">Key Gap vs Top Performers</p>
                          <p className="text-[#94a3b8] text-sm leading-relaxed">{ld.key_gap}</p>
                        </div>
                      )}

                      {/* Top video */}
                      {ld.top_video && (
                        <div className="border border-[#1e1e1e] px-4 py-4">
                          <p className="text-xs text-[#475569] uppercase tracking-widest mb-2">Top Video</p>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-white text-sm font-medium flex-1 leading-snug">{ld.top_video.title}</p>
                            <div className="shrink-0 text-right">
                              <p className="text-white font-bold">{formatNum(ld.top_video.views)}</p>
                              <p className="text-[#475569] text-xs">views</p>
                            </div>
                            <a
                              href={`https://www.youtube.com/watch?v=${ld.top_video.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-[#60a5fa] hover:underline"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Steal this */}
                      {ld.steal_this && ld.steal_this.length > 0 && (
                        <StealThisSection items={ld.steal_this} />
                      )}

                      {/* Legacy AI insight (shown if no steal_this) */}
                      {!ld.steal_this && ld.ai_insight && (
                        <div className="border border-[#60a5fa]/20 bg-[#0a0f1a] px-4 py-3">
                          <p className="text-xs text-[#60a5fa] uppercase tracking-widest mb-1">TALLY Insight</p>
                          <p className="text-[#94a3b8] text-sm leading-relaxed">{ld.ai_insight}</p>
                        </div>
                      )}

                      <p className="text-[10px] text-[#2a2a2a]">
                        Last updated {new Date(ld.pulled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <div className="flex items-center justify-center gap-2 text-[#475569] text-sm">
                        No data yet — click Refresh All to pull stats
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
