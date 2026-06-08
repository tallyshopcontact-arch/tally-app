"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ArrowUpRight, Check, ChevronRight, Loader2 } from "lucide-react";
import type { NicheVideo } from "@/lib/keywords";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThumbnailStyle {
  style: string;
  color: string;
  text_preference: string;
  producer_tag: boolean;
  producer_tag_name?: string;
}

interface ThumbnailConcept {
  style_name: string;
  visual_brief: string;
  color_palette: string[];
  canva_instructions: string;
  why_it_fits: string;
}

interface GenerateResult {
  concepts: ThumbnailConcept[];
  niche_inspiration: string[];
  niche_thumbnails: NicheVideo[];
}

// ── Setup wizard config ───────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  { id: "Dark Minimal", label: "Dark Minimal", bg: "#0a0a0a", accent: "#e8e8e8", desc: "Clean, atmospheric, minimal text" },
  { id: "Bold Text", label: "Bold Text", bg: "#111", accent: "#ffffff", desc: "Large typography dominates" },
  { id: "Artist Focus", label: "Artist Focus", bg: "#0d0d0d", accent: "#60a5fa", desc: "Artist silhouette or face" },
  { id: "Abstract Visual", label: "Abstract Visual", bg: "#0a0a1a", accent: "#7c3aed", desc: "Shapes, patterns, textures" },
  { id: "Color Pop", label: "Color Pop", bg: "#0a1a0a", accent: "#4ade80", desc: "Bright single accent color" },
  { id: "Photo Atmospheric", label: "Photo Atmospheric", bg: "#1a0a0a", accent: "#f97316", desc: "Moody photography, dark overlay" },
];

const COLOR_OPTIONS = [
  { id: "#0a0a0a", label: "Pure Black", hex: "#0a0a0a" },
  { id: "#0d1b2a", label: "Deep Navy", hex: "#0d1b2a" },
  { id: "#1a0a2e", label: "Dark Purple", hex: "#1a0a2e" },
  { id: "#0a1a0f", label: "Forest Dark", hex: "#0a1a0f" },
  { id: "#1a0a0a", label: "Crimson Dark", hex: "#1a0a0a" },
  { id: "#1a1a2e", label: "Slate", hex: "#1a1a2e" },
  { id: "#1c1c1c", label: "Charcoal", hex: "#1c1c1c" },
  { id: "custom", label: "Custom", hex: "" },
];

const TEXT_OPTIONS = [
  { id: "always", label: "Always", desc: "Bold text on every thumbnail" },
  { id: "sometimes", label: "Sometimes", desc: "Text for key releases" },
  { id: "rarely", label: "Rarely", desc: "Mostly visual" },
  { id: "never", label: "Never", desc: "No text overlays" },
];

// ── Setup Wizard ──────────────────────────────────────────────────────────────

function SetupWizard({ onComplete }: { onComplete: (style: ThumbnailStyle) => void }) {
  const [step, setStep] = useState(1);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedColor, setSelectedColor] = useState("#0a0a0a");
  const [customColor, setCustomColor] = useState("#0a0a0a");
  const [textPref, setTextPref] = useState("sometimes");
  const [producerTag, setProducerTag] = useState(false);
  const [tagName, setTagName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    const style: ThumbnailStyle = {
      style: selectedStyle,
      color: selectedColor === "custom" ? customColor : selectedColor,
      text_preference: textPref,
      producer_tag: producerTag,
      producer_tag_name: producerTag ? tagName : undefined,
    };

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ thumbnail_style: style }).eq("id", user.id);
    }
    onComplete(style);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-10">
        {[1, 2, 3, 4].map((s) => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 flex items-center justify-center text-xs font-bold border ${s <= step ? "bg-white text-black border-white" : "border-[#2a2a2a] text-[#475569]"}`}>
              {s < step ? <Check className="w-3.5 h-3.5" /> : s}
            </div>
            {s < 4 && <div className={`flex-1 h-px ${s < step ? "bg-white" : "bg-[#1a1a1a]"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 — Style */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Choose your thumbnail style</h2>
          <p className="text-[#94a3b8] text-sm mb-7">This shapes every concept we generate for you.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedStyle(opt.id)}
                className={`border p-4 text-left transition-colors cursor-pointer ${selectedStyle === opt.id ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}
              >
                <div className="w-full h-16 mb-3 flex items-center justify-center" style={{ background: opt.bg }}>
                  <span className="text-xs font-bold tracking-wider" style={{ color: opt.accent }}>{opt.label.toUpperCase()}</span>
                </div>
                <p className="text-white text-xs font-semibold mb-0.5">{opt.label}</p>
                <p className="text-[#475569] text-xs">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button
            disabled={!selectedStyle}
            onClick={() => setStep(2)}
            className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2 — Color */}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Choose your dominant color</h2>
          <p className="text-[#94a3b8] text-sm mb-7">The base background tone for your thumbnails.</p>
          <div className="flex flex-wrap gap-4 mb-8">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedColor(opt.id)}
                className={`flex flex-col items-center gap-2 cursor-pointer`}
                title={opt.label}
              >
                {opt.id === "custom" ? (
                  <div className={`w-12 h-12 border-2 flex items-center justify-center text-xs text-[#94a3b8] ${selectedColor === "custom" ? "border-white" : "border-[#2a2a2a]"}`}>
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="w-8 h-8 cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                ) : (
                  <div
                    className={`w-12 h-12 border-2 ${selectedColor === opt.id ? "border-white" : "border-transparent"}`}
                    style={{ background: opt.hex }}
                  />
                )}
                <span className="text-[10px] text-[#475569]">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white hover:border-[#2a2a2a] transition-colors cursor-pointer">Back</button>
            <button onClick={() => setStep(3)} className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] transition-colors cursor-pointer">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Text */}
      {step === 3 && (
        <div>
          <h2 className="text-xl font-bold mb-2">How much text on your thumbnails?</h2>
          <p className="text-[#94a3b8] text-sm mb-7">Sets how prominent text overlays appear in generated concepts.</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {TEXT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTextPref(opt.id)}
                className={`border p-4 text-left transition-colors cursor-pointer ${textPref === opt.id ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}
              >
                <p className="text-white text-sm font-semibold mb-1">{opt.label}</p>
                <p className="text-[#475569] text-xs">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white hover:border-[#2a2a2a] transition-colors cursor-pointer">Back</button>
            <button onClick={() => setStep(4)} className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] transition-colors cursor-pointer">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Producer tag */}
      {step === 4 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Add your producer tag?</h2>
          <p className="text-[#94a3b8] text-sm mb-7">We&apos;ll include your producer tag in concepts when relevant.</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button onClick={() => setProducerTag(true)} className={`border p-4 text-left transition-colors cursor-pointer ${producerTag ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
              <p className="text-white text-sm font-semibold mb-1">Yes</p>
              <p className="text-[#475569] text-xs">Include my producer name</p>
            </button>
            <button onClick={() => setProducerTag(false)} className={`border p-4 text-left transition-colors cursor-pointer ${!producerTag ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
              <p className="text-white text-sm font-semibold mb-1">No</p>
              <p className="text-[#475569] text-xs">Keep thumbnails clean</p>
            </button>
          </div>
          {producerTag && (
            <input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Producer name / tag (e.g. Prod. by Metro)"
              className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 mb-5 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
            />
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white hover:border-[#2a2a2a] transition-colors cursor-pointer">Back</button>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving..." : "Finish Setup →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generator ─────────────────────────────────────────────────────────────────

function Generator({ thumbnailStyle }: { thumbnailStyle: ThumbnailStyle }) {
  const [beatName, setBeatName] = useState("");
  const [vibe, setVibe] = useState("");
  const [ideas, setIdeas] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const handleGenerate = async () => {
    if (!beatName.trim() || !vibe.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/thumbnail-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beat_name: beatName, vibe, ideas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult(json as GenerateResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Style summary */}
      <div className="border border-[#1a1a1a] px-5 py-4 mb-6 flex flex-wrap items-center gap-5">
        <div>
          <p className="text-xs text-[#475569] uppercase tracking-widest mb-0.5">Style</p>
          <p className="text-white text-sm font-medium">{thumbnailStyle.style}</p>
        </div>
        <div>
          <p className="text-xs text-[#475569] uppercase tracking-widest mb-0.5">Color</p>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 border border-[#2a2a2a]" style={{ background: thumbnailStyle.color }} />
            <span className="text-white text-sm font-medium">{thumbnailStyle.color}</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-[#475569] uppercase tracking-widest mb-0.5">Text</p>
          <p className="text-white text-sm font-medium capitalize">{thumbnailStyle.text_preference}</p>
        </div>
        <Link href="/dashboard/thumbnail-studio?reset=1" className="ml-auto text-xs text-[#475569] hover:text-[#94a3b8] transition-colors">
          Reset style →
        </Link>
      </div>

      {/* Input form */}
      <div className="border border-[#1a1a1a] p-7 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Beat Name</label>
            <input
              value={beatName}
              onChange={(e) => setBeatName(e.target.value)}
              placeholder='e.g. "Pressure"'
              className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Vibe / Mood</label>
            <input
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="e.g. dark, cinematic, aggressive"
              className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
            />
          </div>
        </div>
        <div className="mb-5">
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Additional Ideas (optional)</label>
          <textarea
            value={ideas}
            onChange={(e) => setIdeas(e.target.value)}
            placeholder="Any specific imagery, references, or directions..."
            rows={2}
            className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 resize-none placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !beatName.trim() || !vibe.trim()}
          className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
          {loading ? "Generating..." : "Generate Concepts →"}
        </button>
      </div>

      {error && (
        <div className="border border-[#f87171]/30 px-5 py-4 text-[#f87171] text-sm mb-6">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Niche inspiration */}
          {result.niche_thumbnails.length > 0 && (
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Top Niche Thumbnails — What&apos;s Working</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {result.niche_thumbnails.slice(0, 5).map((v, i) => (
                  <a
                    key={v.videoId}
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="aspect-video bg-[#111] border border-[#1e1e1e] overflow-hidden mb-1.5 group-hover:border-[#2a2a2a] transition-colors">
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-[10px] text-[#475569] truncate leading-snug">{v.title}</p>
                    {result.niche_inspiration[i] && (
                      <p className="text-[10px] text-[#60a5fa] mt-0.5 leading-snug">{result.niche_inspiration[i]}</p>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Concepts */}
          <div>
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">AI Thumbnail Concepts</p>
            <div className="space-y-4">
              {result.concepts.map((concept, i) => (
                <div key={i} className="border border-[#1a1a1a] p-6">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">Concept {i + 1}</p>
                      <h3 className="text-white font-bold text-lg">{concept.style_name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {concept.color_palette.map((c) => (
                        <div key={c} className="w-5 h-5 border border-[#2a2a2a]" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  </div>

                  {/* CSS mockup */}
                  <div
                    className="w-full aspect-video mb-5 flex items-center justify-center border border-[#2a2a2a] relative overflow-hidden"
                    style={{ background: concept.color_palette[0] ?? "#0a0a0a" }}
                  >
                    <div className="text-center px-4">
                      <p className="font-bold text-xl sm:text-3xl tracking-wider mb-2" style={{ color: concept.color_palette[1] ?? "#ffffff" }}>
                        {beatName.toUpperCase()}
                      </p>
                      <p className="text-xs tracking-widest opacity-70" style={{ color: concept.color_palette[2] ?? "#94a3b8" }}>
                        {concept.style_name.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Visual Brief</p>
                      <p className="text-[#94a3b8] text-sm leading-relaxed">{concept.visual_brief}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Canva Instructions</p>
                      <p className="text-[#94a3b8] text-sm leading-relaxed">{concept.canva_instructions}</p>
                    </div>
                  </div>
                  <div className="mt-4 border-l-2 border-[#1e1e1e] pl-3">
                    <p className="text-xs text-[#4ade80]">Why it fits: <span className="text-[#64748b]">{concept.why_it_fits}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ThumbnailStudioPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [thumbnailStyle, setThumbnailStyle] = useState<ThumbnailStyle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset") === "1";

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email ?? null);

      if (!reset) {
        const { data } = await supabase.from("profiles").select("thumbnail_style").eq("id", user.id).single();
        if (data?.thumbnail_style) {
          setThumbnailStyle(data.thumbnail_style as ThumbnailStyle);
        }
      }
      setLoading(false);
    });
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
          <span className="text-xs text-[#475569] hidden sm:block">Thumbnail Studio</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-[#94a3b8] hidden sm:block">{displayName}</span>
          <Link href="/settings" className="text-xs text-[#94a3b8] hover:text-white transition-colors hidden sm:block">Settings</Link>
          <button onClick={handleSignOut} className="text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Sign out</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Thumbnail Studio</h1>
          <p className="text-[#94a3b8] text-sm">
            AI-generated thumbnail concepts tailored to your style and niche.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
            Loading your preferences...
          </div>
        ) : thumbnailStyle ? (
          <Generator thumbnailStyle={thumbnailStyle} />
        ) : (
          <SetupWizard onComplete={(style) => setThumbnailStyle(style)} />
        )}
      </div>
    </div>
  );
}
