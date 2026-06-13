"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { ArrowLeft, ArrowRight, Check, Copy, Lightbulb, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TitleScoreBreakdown {
  keyword_strength: number;
  title_length: number;
  artist_pairing: number;
  beat_name: number;
  year_present: number;
}

interface TitleOption {
  title: string;
  reason: string;
  score?: number;
  breakdown?: TitleScoreBreakdown;
  tip?: string | null;
  recommended?: boolean;
}

interface ThumbnailConcept {
  style: string;
  background: string;
  text_treatment: string;
  color_palette: string;
  why_it_works: string;
}

interface NicheThumbnail {
  videoId: string;
  title: string;
  viewCount: number;
  thumbnailUrl: string;
}

interface ThumbnailAnalysis {
  notes: { videoId: string; note: string }[];
  recommendation: string;
}

interface AnalysisContext {
  title_1_reason: string;
  title_2_reason: string;
  title_3_reason: string;
  keywords_reason: string;
  upload_time_reason: string;
  key_gap: string;
}

interface GeneratedKit {
  id?: string;
  created_at?: string;
  beat_name_suggestion?: string;
  titles: TitleOption[];
  description: string;
  tags: string[];
  thumbnail_concepts: ThumbnailConcept[];
  best_upload_time: { day: string; time: string; reason: string };
  niche_tip: string;
  niche_thumbnails?: NicheThumbnail[];
  thumbnail_analysis?: ThumbnailAnalysis;
  analysis_context?: AnalysisContext;
}

interface RecentKit {
  id: string;
  beat_name: string;
  genre: string;
  created_at: string;
  generated_kit: GeneratedKit;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRES = [
  "Boom Bap", "Trap", "Drill", "Lo-fi", "Afrobeats",
  "Jersey Club", "UK Drill", "Pop Rap", "R&B", "Melodic Rap", "Other",
];

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const VIBES = [
  "Dark", "Soulful", "Aggressive", "Melodic", "Cinematic",
  "Grimy", "Emotional", "Hard", "Smooth", "Eerie",
  "Haunting", "Triumphant", "Nostalgic", "Hypnotic", "Raw",
  "Epic", "Minimal", "Bouncy", "Chill", "Ethereal",
  "Drill", "Trappy", "Wavy", "Boom Bap", "Jazzy",
];

// ── Helper components ─────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
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
      {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}

// ── Thumbnail inspiration ─────────────────────────────────────────────────────

function ThumbnailInspiration({
  thumbnails,
  analysis,
}: {
  thumbnails: NicheThumbnail[];
  analysis: ThumbnailAnalysis | undefined;
}) {
  const noteMap = new Map(analysis?.notes.map((n) => [n.videoId, n.note]) ?? []);

  return (
    <div className="border border-[#1a1a1a] p-5">
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Thumbnail Inspiration</p>
      <p className="text-[#475569] text-xs mb-4">
        What&apos;s working in your niche right now — click any to view on YouTube
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {thumbnails.map((t) => (
          <a
            key={t.videoId}
            href={`https://www.youtube.com/watch?v=${t.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div className="relative overflow-hidden border border-[#1e1e1e] group-hover:border-[#333] transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.thumbnailUrl}
                alt={t.title}
                className="w-full aspect-video object-cover block"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </div>
            <div className="mt-2">
              <p className="text-[#94a3b8] text-[11px] leading-relaxed line-clamp-2 mb-1">
                {noteMap.get(t.videoId) ?? t.title}
              </p>
              <p className="text-[#475569] text-[10px]">
                {t.viewCount >= 1_000_000
                  ? `${(t.viewCount / 1_000_000).toFixed(1)}M views`
                  : `${(t.viewCount / 1000).toFixed(0)}K views`}
              </p>
            </div>
          </a>
        ))}
      </div>
      {analysis?.recommendation && (
        <div className="border-t border-[#1a1a1a] pt-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">TALLY Recommendation</p>
          <p className="text-white text-sm leading-relaxed">{analysis.recommendation}</p>
        </div>
      )}
    </div>
  );
}

// ── Why these recommendations ─────────────────────────────────────────────────

function WhySection({ ctx }: { ctx: AnalysisContext }) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string }[] = [
    { label: "Title 1 — Winner Pattern", value: ctx.title_1_reason },
    { label: "Title 2 — Niche Formula", value: ctx.title_2_reason },
    { label: "Title 3 — Untapped Artist", value: ctx.title_3_reason },
    { label: "Keywords in tags", value: ctx.keywords_reason },
    { label: "Upload timing", value: ctx.upload_time_reason },
  ];

  return (
    <div className="border border-[#1e2a1e]">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#0d150d] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-[#4ade80] shrink-0" />
          <span className="text-xs text-[#4ade80] uppercase tracking-widest font-medium">Why these recommendations</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#4ade80]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#4ade80]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[#1e2a1e] divide-y divide-[#1a1a1a]">
          {ctx.key_gap && (
            <div className="px-5 py-4 bg-[#0d150d]">
              <p className="text-[10px] text-[#4ade80] uppercase tracking-widest mb-1.5">Key Gap Identified</p>
              <p className="text-white text-sm leading-relaxed">{ctx.key_gap}</p>
            </div>
          )}
          {rows.map((r) => (
            <div key={r.label} className="px-5 py-4 flex gap-4">
              <p className="text-[#4ade80] text-[10px] uppercase tracking-widest shrink-0 w-36 pt-0.5 leading-tight">{r.label}</p>
              <p className="text-[#cbd5e1] text-xs leading-relaxed">{r.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Output display ────────────────────────────────────────────────────────────

function KitOutput({ kit }: { kit: GeneratedKit }) {
  return (
    <div className="space-y-6 tab-content">
      {/* Beat name suggestion */}
      {kit.beat_name_suggestion && (
        <div className="border border-[#2a2a2a] bg-[#111] p-5">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Suggested Beat Name</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xl font-bold">&ldquo;{kit.beat_name_suggestion}&rdquo;</p>
            <CopyBtn text={kit.beat_name_suggestion} />
          </div>
        </div>
      )}

      {/* Why these recommendations */}
      {kit.analysis_context && <WhySection ctx={kit.analysis_context} />}

      {/* Titles */}
      <div>
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">3 Title Options</p>
        <div className="space-y-3">
          {kit.titles.map((t, i) => {
            const sc = t.score;
            const scoreBadgeClass = sc === undefined ? "" : sc >= 70 ? "text-[#4ade80] bg-[#0a1a0a] border-[#1a3a1a]" : sc >= 40 ? "text-[#fbbf24] bg-[#1a1500] border-[#2a2000]" : "text-[#f87171] bg-[#1a0a0a] border-[#3a1a1a]";
            const BREAKDOWN_LABELS: Record<keyof TitleScoreBreakdown, string> = {
              keyword_strength: "Keywords",
              title_length: "Length",
              artist_pairing: "Artist",
              beat_name: "Beat Name",
              year_present: "Year",
            };
            const BREAKDOWN_MAX: Record<keyof TitleScoreBreakdown, number> = {
              keyword_strength: 25, title_length: 25, artist_pairing: 20, beat_name: 20, year_present: 10,
            };
            return (
              <div key={i} className={`border p-5 ${t.recommended ? "border-white/20" : "border-[#1a1a1a]"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.recommended && (
                      <span className="text-[10px] font-semibold tracking-widest uppercase text-[#4ade80] bg-[#0a1a0a] border border-[#1a3a1a] px-2 py-0.5 shrink-0">
                        Recommended
                      </span>
                    )}
                    {sc !== undefined && (
                      <span className={`text-[10px] font-bold border px-2 py-0.5 shrink-0 ${scoreBadgeClass}`}>
                        {sc}/100
                      </span>
                    )}
                    <p className="font-semibold text-white leading-snug">{t.title}</p>
                  </div>
                  <CopyBtn text={t.title} />
                </div>
                <p className="text-[#94a3b8] text-xs leading-relaxed mb-3">{t.reason}</p>
                {t.breakdown && (
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(t.breakdown) as Array<keyof TitleScoreBreakdown>).map(k => {
                      const val = t.breakdown![k];
                      const max = BREAKDOWN_MAX[k];
                      const hit = val > 0;
                      return (
                        <span key={k} className={`text-[10px] px-2 py-0.5 border ${hit ? "border-[#1a3a1a] text-[#4ade80] bg-[#0a1a0a]" : "border-[#1a1a1a] text-[#475569]"}`}>
                          {BREAKDOWN_LABELS[k]} {hit ? `+${val}/${max}` : `0/${max}`}
                        </span>
                      );
                    })}
                  </div>
                )}
                {t.tip && (
                  <p className="text-xs text-[#fbbf24] mt-2">Tip: {t.tip}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Description */}
      <div className="border border-[#1a1a1a] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Description</p>
            <span className="text-[#475569] text-xs">{kit.description.length} chars</span>
          </div>
          <CopyBtn text={kit.description} label="Copy description" />
        </div>
        <pre className="text-[#94a3b8] text-xs leading-relaxed whitespace-pre-wrap font-sans">
          {kit.description}
        </pre>
      </div>

      {/* Tags */}
      <div className="border border-[#1a1a1a] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Tags ({kit.tags.length})</p>
          <CopyBtn text={kit.tags.join(", ")} label="Copy all tags" />
        </div>
        <div className="flex flex-wrap gap-2">
          {kit.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-[#94a3b8] bg-[#0d0d0d] border border-[#1e1e1e] px-3 py-1.5 cursor-pointer hover:border-[#333] hover:text-white transition-colors"
              onClick={() => navigator.clipboard.writeText(tag)}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Thumbnail inspiration from niche */}
      {kit.niche_thumbnails && kit.niche_thumbnails.length > 0 && (
        <ThumbnailInspiration
          thumbnails={kit.niche_thumbnails}
          analysis={kit.thumbnail_analysis}
        />
      )}

      {/* Best upload time */}
      <div className="border border-[#1a1a1a] p-5 flex items-start gap-4">
        <Clock className="w-4 h-4 text-[#60a5fa] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Best Upload Time</p>
          <p className="text-white font-bold text-lg mb-1">
            {kit.best_upload_time.day} · {kit.best_upload_time.time}
          </p>
          <p className="text-[#94a3b8] text-xs leading-relaxed">{kit.best_upload_time.reason}</p>
        </div>
      </div>

      {/* Niche tip */}
      <div className="border border-[#fbbf24]/20 bg-[#1a1500] p-5 flex items-start gap-4">
        <Lightbulb className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-[#fbbf24] uppercase tracking-widest mb-2">Niche Tip</p>
          <p className="text-[#cbd5e1] text-sm leading-relaxed">{kit.niche_tip}</p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UploadKitPage() {
  const router = useRouter();
  const { isPaid, loading: subLoading } = useSubscription();

  // Form state
  const [beatName, setBeatName] = useState("");
  const [genre, setGenre] = useState("Trap");
  const [customGenre, setCustomGenre] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [customVibeInput, setCustomVibeInput] = useState("");
  const [showCustomVibeInput, setShowCustomVibeInput] = useState(false);
  const [artist1, setArtist1] = useState("");
  const [artist2, setArtist2] = useState("");
  const [artist3, setArtist3] = useState("");
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState("");
  const [notes, setNotes] = useState("");

  // App state
  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState<GeneratedKit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentKits, setRecentKits] = useState<RecentKit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const KIT_USES_KEY = "tally_kit_uses";
  const FREE_LIMIT = 3;

  const toggleVibe = (v: string) =>
    setVibes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const addCustomVibe = () => {
    const v = customVibeInput.trim();
    if (v && !vibes.includes(v)) setVibes((prev) => [...prev, v]);
    setCustomVibeInput("");
    setShowCustomVibeInput(false);
  };

  const loadHistory = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data } = await supabase
      .from("upload_kits")
      .select("id, beat_name, genre, created_at, generated_kit")
      .eq("producer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    setRecentKits((data ?? []) as RecentKit[]);
    setLoadingHistory(false);
  }, [router]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleGenerate = async () => {
    if (!isPaid() && !subLoading) {
      const uses = parseInt(localStorage.getItem(KIT_USES_KEY) ?? "0", 10);
      if (uses >= FREE_LIMIT) {
        setShowUpgrade(true);
        return;
      }
    }
    setLoading(true);
    setError(null);
    setKit(null);
    try {
      const res = await fetch("/api/upload-kit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beat_name: beatName,
          genre: genre === "Other" ? (customGenre.trim() || "hip hop") : genre,
          vibes,
          artist_1: artist1,
          artist_2: artist2,
          artist_3: artist3,
          bpm: bpm ? parseInt(bpm) : undefined,
          key: key || undefined,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setKit(json as GeneratedKit);
      if (!isPaid()) {
        const uses = parseInt(localStorage.getItem(KIT_USES_KEY) ?? "0", 10);
        localStorage.setItem(KIT_USES_KEY, String(uses + 1));
      }
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-[#0d0d0d] border border-[#1e1e1e] text-white text-sm px-4 py-2.5 focus:outline-none focus:border-[#333] placeholder:text-[#475569]";
  const labelCls = "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <nav className="h-14 border-b border-[#1a1a1a] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-[#94a3b8] hover:text-white transition-colors text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span className="text-[#1e1e1e]">|</span>
          <Link href="/dashboard" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
          <span className="text-[#2a2a2a] hidden sm:block">|</span>
          <span className="text-xs text-[#64748b] hidden sm:block">Upload Kit Generator</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/report" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">
            Monthly Report
          </Link>
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">
            Settings
          </Link>
        </div>
      </nav>

      {/* Page title */}
      <div className="border-b border-[#1a1a1a] px-6 py-6">
        <h1 className="text-xl font-bold mb-1">Upload Kit Generator</h1>
        <p className="text-[#94a3b8] text-sm">Fill in your beat details. TALLY generates your optimized YouTube package in seconds.</p>
      </div>

      {/* Two-column layout */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* ── LEFT: Form ── */}
        <div className="space-y-6">
          {/* Beat Name */}
          <div>
            <label className={labelCls}>Beat Name <span className="text-[#475569] normal-case tracking-normal">(optional — TALLY will suggest one)</span></label>
            <input
              type="text"
              value={beatName}
              onChange={(e) => setBeatName(e.target.value)}
              placeholder="e.g. Phantom, Ghost Walk, Neon Keys..."
              className={inputCls}
            />
          </div>

          {/* Genre */}
          <div>
            <label className={labelCls}>Genre</label>
            <select
              value={genre}
              onChange={(e) => { setGenre(e.target.value); if (e.target.value !== "Other") setCustomGenre(""); }}
              className={inputCls + " cursor-pointer"}
            >
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {genre === "Other" && (
              <input
                type="text"
                value={customGenre}
                onChange={(e) => setCustomGenre(e.target.value)}
                placeholder="Enter your genre (e.g. Phonk, Cloud Rap, Dancehall...)"
                className={inputCls + " mt-2"}
                autoFocus
              />
            )}
          </div>

          {/* Vibe pills */}
          <div>
            <label className={labelCls}>Beat Type / Vibe <span className="text-[#475569] normal-case tracking-normal">(select all that apply)</span></label>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVibe(v)}
                  className={`text-xs px-3 py-1.5 border transition-colors cursor-pointer ${
                    vibes.includes(v)
                      ? "border-white text-white bg-[#1a1a1a]"
                      : "border-[#1e1e1e] text-[#475569] hover:border-[#333] hover:text-[#94a3b8]"
                  }`}
                >
                  {v}
                </button>
              ))}
              {/* Custom vibes added via Other + */}
              {vibes.filter((v) => !VIBES.includes(v)).map((cv) => (
                <button
                  key={cv}
                  type="button"
                  onClick={() => toggleVibe(cv)}
                  className="text-xs px-3 py-1.5 border border-white text-white bg-[#1a1a1a] transition-colors cursor-pointer"
                >
                  {cv} ×
                </button>
              ))}
              {showCustomVibeInput ? (
                <div className="flex gap-2 w-full mt-1">
                  <input
                    autoFocus
                    value={customVibeInput}
                    onChange={(e) => setCustomVibeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addCustomVibe(); }
                      if (e.key === "Escape") setShowCustomVibeInput(false);
                    }}
                    placeholder="Type a vibe..."
                    className="flex-1 bg-[#0d0d0d] border border-[#1e1e1e] text-white text-xs px-3 py-1.5 focus:outline-none focus:border-[#333] placeholder:text-[#475569]"
                  />
                  <button onClick={addCustomVibe} className="text-xs border border-white text-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors cursor-pointer">Add</button>
                  <button onClick={() => { setShowCustomVibeInput(false); setCustomVibeInput(""); }} className="text-xs text-[#475569] hover:text-white transition-colors cursor-pointer">Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomVibeInput(true)}
                  className="text-xs px-3 py-1.5 border border-dashed border-[#2a2a2a] text-[#475569] hover:border-[#444] hover:text-[#94a3b8] transition-colors cursor-pointer"
                >
                  Other +
                </button>
              )}
            </div>
          </div>

          {/* Artists */}
          <div>
            <label className={labelCls}>Artists you can hear on it</label>
            <div className="space-y-2">
              {[
                { label: "Artist 1", value: artist1, set: setArtist1 },
                { label: "Artist 2", value: artist2, set: setArtist2 },
                { label: "Artist 3", value: artist3, set: setArtist3 },
              ].map(({ label, value, set }) => (
                <input
                  key={label}
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={label}
                  className={inputCls}
                />
              ))}
            </div>
          </div>

          {/* BPM + Key */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>BPM <span className="text-[#475569] normal-case tracking-normal">(optional)</span></label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                placeholder="e.g. 140"
                min={40}
                max={300}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Key <span className="text-[#475569] normal-case tracking-normal">(optional)</span></label>
              <select
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={inputCls + " cursor-pointer"}
              >
                <option value="">Select key...</option>
                {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Additional Notes <span className="text-[#475569] normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='e.g. "sample flip feel", "boom bap with jazz chords", "hard 808s"...'
              rows={3}
              className={inputCls + " resize-none leading-relaxed"}
            />
          </div>

          {showUpgrade && (
            <div className="py-4">
              <UpgradePrompt feature="Upload Kit Generator" description="You've used your 3 free kits. Upgrade to generate unlimited upload kits." />
            </div>
          )}

          {!isPaid() && !subLoading && !showUpgrade && (
            <p className="text-xs text-[#475569] text-center">
              {Math.max(0, FREE_LIMIT - parseInt(typeof window !== "undefined" ? (localStorage.getItem(KIT_USES_KEY) ?? "0") : "0", 10))} free kits remaining
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || showUpgrade}
            className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-semibold py-4 hover:bg-[#e8e8e8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                TALLY is generating your kit...
              </>
            ) : (
              <>
                Generate My Upload Kit
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {error && (
            <p className="text-[#f87171] text-sm border border-[#f87171]/30 px-4 py-3">{error}</p>
          )}

          {/* Recent kits */}
          {!loadingHistory && recentKits.length > 0 && (
            <div className="pt-4 border-t border-[#1a1a1a]">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Recent Kits</p>
              <div className="space-y-2">
                {recentKits.map((rk) => (
                  <button
                    key={rk.id}
                    onClick={() => setKit(rk.generated_kit)}
                    className="w-full flex items-center justify-between gap-3 border border-[#1a1a1a] px-4 py-3 hover:border-[#2a2a2a] hover:bg-[#0d0d0d] transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <p className="text-white text-xs font-medium">&ldquo;{rk.beat_name}&rdquo;</p>
                      <p className="text-[#94a3b8] text-xs mt-0.5">{rk.genre}</p>
                    </div>
                    <span className="text-[#475569] text-xs shrink-0">
                      {new Date(rk.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Output ── */}
        <div>
          {kit ? (
            <KitOutput kit={kit} />
          ) : (
            <div className="border border-dashed border-[#1a1a1a] p-12 text-center lg:sticky lg:top-8">
              <div className="w-12 h-12 bg-[#0d0d0d] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
                <ArrowRight className="w-5 h-5 text-[#333]" />
              </div>
              <p className="text-white font-medium mb-2">Your upload kit will appear here</p>
              <p className="text-[#475569] text-sm leading-relaxed max-w-xs mx-auto">
                Fill in the beat details on the left and click &ldquo;Generate My Upload Kit&rdquo;.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
