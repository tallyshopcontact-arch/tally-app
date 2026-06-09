"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ArrowUpRight, Check, Copy, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryScores {
  keyword_strength: number;
  title_length: number;
  artist_pairing: number;
  beat_name: number;
  year_present: number;
}

interface TitleResult {
  score: number;
  verdict: string;
  categories: CategoryScores;
  improvements: string[];
  rewrites: string[];
  tip?: string | null;
  original_title: string;
}

interface RecentTest {
  id: string;
  original_title: string;
  score: number;
  result: TitleResult;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

const scoreBarColor = (s: number) =>
  s >= 80 ? "bg-[#4ade80]" : s >= 60 ? "bg-[#fbbf24]" : "bg-[#f87171]";

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  keyword_strength: "Keyword Strength",
  title_length: "Title Length",
  artist_pairing: "Artist Pairing",
  beat_name: "Beat Name",
  year_present: "Year Relevance",
};

const CATEGORY_MAX: Record<keyof CategoryScores, number> = {
  keyword_strength: 25,
  title_length: 25,
  artist_pairing: 20,
  beat_name: 20,
  year_present: 10,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_GENRES = [
  "Boom Bap",
  "Trap",
  "Drill",
  "Lo-fi",
  "Afrobeats",
  "Jersey Club",
  "UK Drill",
  "Pop Rap",
  "R&B",
  "Melodic Rap",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TitleTesterPage() {
  const router = useRouter();
  const [profileGenre, setProfileGenre] = useState<string>("");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TitleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email ?? null);

      const [profileRes, testsRes] = await Promise.all([
        supabase.from("profiles").select("genre").eq("id", user.id).single(),
        supabase.from("title_tests").select("id, original_title, score, result, created_at").eq("producer_id", user.id).order("created_at", { ascending: false }).limit(5),
      ]);

      if (profileRes.data?.genre) {
        setProfileGenre(profileRes.data.genre);
        setSelectedGenre(profileRes.data.genre);
      }
      if (testsRes.data) setRecentTests(testsRes.data as RecentTest[]);
    });
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleTest = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/title-tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), genre: selectedGenre }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult(json as TitleResult);

      // Refresh recent tests
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("title_tests")
          .select("id, original_title, score, result, created_at")
          .eq("producer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (data) setRecentTests(data as RecentTest[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const loadTest = (test: RecentTest) => {
    setTitle(test.original_title);
    setResult(test.result);
    setError(null);
  };

  const displayName = userEmail?.split("@")[0] ?? "Producer";
  const genreChanged = selectedGenre !== profileGenre && profileGenre !== "";

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
          <span className="text-xs text-[#475569] hidden sm:block">Title Tester</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-[#94a3b8] hidden sm:block">{displayName}{selectedGenre ? ` · ${selectedGenre}` : ""}</span>
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">Settings</Link>
          <button onClick={handleSignOut} className="text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Sign out</button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Title Tester</h1>
          <p className="text-[#94a3b8] text-sm">
            Score your YouTube beat video title against SEO best practices and niche keyword data.
          </p>
        </div>

        {/* Input */}
        <div className="border border-[#1a1a1a] p-7 mb-6">
          <div className="mb-5">
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
              Genre
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-2.5 focus:outline-none focus:border-[#2a2a2a] cursor-pointer appearance-none pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
            >
              {!selectedGenre && <option value="">Not set</option>}
              {SUPPORTED_GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {genreChanged ? (
              <p className="text-xs text-[#475569] mt-1.5">
                Testing as <span className="text-[#fbbf24]">{selectedGenre}</span> — your profile genre (<span className="text-[#94a3b8]">{profileGenre}</span>) stays unchanged.
              </p>
            ) : (
              <p className="text-xs text-[#2a2a2a] mt-1.5">
                Testing a different genre? Switch here — your profile genre stays unchanged.
              </p>
            )}
          </div>

          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
            Your Title
          </label>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`e.g. Lil Baby x Gunna Type Beat "Pressure" | Trap Beat 2026`}
            rows={3}
            className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 resize-none placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
          />
          <div className="flex items-center justify-between mt-1 mb-5">
            <span className={`text-xs ${title.length > 100 ? "text-[#f87171]" : title.length > 80 ? "text-[#fbbf24]" : "text-[#475569]"}`}>
              {title.length} chars {title.length > 0 && title.length < 60 ? "(aim for 60–80)" : ""}
            </span>
          </div>

          <button
            onClick={handleTest}
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
            {loading ? "Analyzing..." : "Test My Title →"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-[#f87171]/30 px-5 py-4 text-[#f87171] text-sm mb-6">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4 mb-10">
            {/* Score + verdict */}
            <div className="border border-[#1a1a1a] p-7">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="shrink-0 text-center sm:text-left">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Score</p>
                  <p className={`text-6xl font-bold ${scoreColor(result.score)}`}>
                    {result.score}
                    <span className="text-2xl text-[#2a2a2a]">/100</span>
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">{result.verdict}</p>
                  <div className="space-y-3">
                    {(Object.keys(CATEGORY_MAX) as (keyof CategoryScores)[]).map((cat) => {
                      const cats = result.categories as unknown as Record<string, number>;
                      const val = cats[cat] ?? cats[cat === "year_present" ? "year_relevance" : cat] ?? 0;
                      const max = CATEGORY_MAX[cat];
                      const pct = (val / max) * 100;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#94a3b8]">{CATEGORY_LABELS[cat]}</span>
                            <span className={scoreColor(pct)}>{val}/{max}</span>
                          </div>
                          <div className="h-1 bg-[#1a1a1a]">
                            <div className={`h-full ${scoreBarColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {result.tip && (
                      <p className="text-xs text-[#fbbf24] pt-1">Tip: {result.tip}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Improvements */}
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">How to Improve</p>
              <ul className="space-y-3">
                {result.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <span className="text-[#fbbf24] shrink-0 mt-0.5">→</span>
                    {imp}
                  </li>
                ))}
              </ul>
            </div>

            {/* Rewrites */}
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Rewritten Titles</p>
              <div className="space-y-3">
                {result.rewrites.map((rewrite, i) => (
                  <div key={i} className="border border-[#1e1e1e] bg-[#0d0d0d] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-white text-sm font-medium flex-1">{rewrite}</p>
                      <CopyButton text={rewrite} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent tests */}
        {recentTests.length > 0 && (
          <div>
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Recent Tests</p>
            <div className="space-y-px bg-[#1a1a1a]">
              {recentTests.map((test) => (
                <button
                  key={test.id}
                  onClick={() => loadTest(test)}
                  className="w-full bg-[#0a0a0a] hover:bg-[#0d0d0d] px-5 py-4 flex items-center justify-between gap-4 text-left transition-colors cursor-pointer"
                >
                  <p className="text-sm text-[#94a3b8] truncate flex-1">{test.original_title}</p>
                  <span className={`text-sm font-bold shrink-0 ${scoreColor(test.score)}`}>
                    {test.score}/100
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
