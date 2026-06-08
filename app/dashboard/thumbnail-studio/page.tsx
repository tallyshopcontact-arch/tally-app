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

// ── Thumbnail Mockup ──────────────────────────────────────────────────────────

function ThumbnailMockup({
  concept,
  beatName,
  producerTag,
  producerTagName,
  idx,
}: {
  concept: ThumbnailConcept;
  beatName: string;
  producerTag: boolean;
  producerTagName?: string;
  idx: number;
}) {
  const bg = concept.color_palette[0] ?? "#0a0a0a";
  const accent = concept.color_palette[1] ?? "#e8e8e8";
  const tertiary = concept.color_palette[2] ?? "#94a3b8";
  const id = `tm${idx}`;

  const raw = beatName ? beatName.toUpperCase() : "BEAT";
  // Truncate display name so it doesn't overflow the SVG canvas
  const name = raw.length > 13 ? raw.slice(0, 13) : raw;
  const tagText = producerTag && producerTagName ? producerTagName.toUpperCase() : "";

  const s = concept.style_name.toLowerCase();
  let vStyle: "minimal" | "bold" | "abstract" | "atmospheric" | "colorpop" | "artist";
  if (s.includes("bold") || s.includes("impact") || s.includes("big text") || s.includes("type"))
    vStyle = "bold";
  else if (s.includes("photo") || s.includes("atmospheric") || s.includes("cinematic") || s.includes("moody") || s.includes("film"))
    vStyle = "atmospheric";
  else if (s.includes("color") || s.includes("pop") || s.includes("vivid") || s.includes("neon") || s.includes("vibrant"))
    vStyle = "colorpop";
  else if (s.includes("artist") || s.includes("silhouette") || s.includes("portrait") || s.includes("figure") || s.includes("shadow"))
    vStyle = "artist";
  else if (s.includes("abstract") || s.includes("geometric") || s.includes("shape") || s.includes("gradient") || s.includes("minimal"))
    vStyle = "abstract";
  else {
    // Rotate through distinct styles to guarantee variety across 3 concepts
    const fallbacks = ["minimal", "abstract", "atmospheric"] as const;
    vStyle = fallbacks[idx % 3];
  }

  if (vStyle === "bold") {
    return (
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
        <rect width="320" height="180" fill={bg} />
        {/* Left accent bar */}
        <rect x="0" y="0" width="6" height="180" fill={accent} />
        {/* Top rule */}
        <line x1="18" y1="44" x2="300" y2="44" stroke={accent} strokeWidth="0.5" opacity="0.2" />
        {/* Beat name — massive bold */}
        <text x="20" y="115" fontSize="54" fontWeight="900" fill={accent} letterSpacing="-2" fontFamily="Arial Black, Arial, sans-serif">{name}</text>
        {/* Sub-label */}
        <text x="20" y="138" fontSize="9" fontWeight="700" fill={tertiary} letterSpacing="4" opacity="0.65" fontFamily="Arial, sans-serif">TYPE BEAT 2026</text>
        {/* Bottom bar tint */}
        <rect x="0" y="156" width="320" height="24" fill={accent} opacity="0.06" />
        {tagText && <text x="308" y="172" textAnchor="end" fontSize="7" fill={tertiary} letterSpacing="2" opacity="0.45" fontFamily="Arial, sans-serif">{tagText}</text>}
      </svg>
    );
  }

  if (vStyle === "atmospheric") {
    return (
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
        <defs>
          <radialGradient id={`${id}g1`} cx="25%" cy="35%" r="55%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}g2`} cx="78%" cy="65%" r="48%">
            <stop offset="0%" stopColor={tertiary} stopOpacity="0.14" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}lg`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={bg} stopOpacity="0.92" />
            <stop offset="45%" stopColor={bg} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill={bg} />
        <rect width="320" height="180" fill={`url(#${id}g1)`} />
        <rect width="320" height="180" fill={`url(#${id}g2)`} />
        {/* Subtle light rays */}
        <line x1="-10" y1="58" x2="330" y2="46" stroke={accent} strokeWidth="1.2" opacity="0.04" />
        <line x1="-10" y1="78" x2="330" y2="66" stroke={accent} strokeWidth="0.6" opacity="0.025" />
        <line x1="-10" y1="100" x2="330" y2="88" stroke={accent} strokeWidth="0.4" opacity="0.015" />
        {/* Bottom fade */}
        <rect width="320" height="180" fill={`url(#${id}lg)`} />
        {/* Text block */}
        <text x="16" y="145" fontSize="28" fontWeight="800" fill={accent} letterSpacing="1" fontFamily="Arial, sans-serif">{name}</text>
        <line x1="16" y1="153" x2="130" y2="153" stroke={accent} strokeWidth="0.8" opacity="0.35" />
        <text x="16" y="167" fontSize="8" fontWeight="400" fill={tertiary} letterSpacing="3" opacity="0.65" fontFamily="Arial, sans-serif">TYPE BEAT · 2026</text>
        {tagText && <text x="308" y="167" textAnchor="end" fontSize="7" fill={tertiary} letterSpacing="1" opacity="0.35" fontFamily="Arial, sans-serif">{tagText}</text>}
      </svg>
    );
  }

  if (vStyle === "colorpop") {
    return (
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
        <rect width="320" height="180" fill={bg} />
        {/* Top stripe */}
        <rect x="0" y="0" width="320" height="6" fill={accent} />
        {/* Beat name in accent */}
        <text x="160" y="108" textAnchor="middle" fontSize="48" fontWeight="900" fill={accent} letterSpacing="-1" fontFamily="Arial Black, Arial, sans-serif">{name}</text>
        {/* Tag line */}
        <text x="160" y="129" textAnchor="middle" fontSize="9" fontWeight="700" fill={tertiary} letterSpacing="5" opacity="0.65" fontFamily="Arial, sans-serif">TYPE BEAT 2026</text>
        {/* Bottom stripe */}
        <rect x="0" y="163" width="320" height="17" fill={accent} opacity="0.88" />
        {tagText && <text x="308" y="175" textAnchor="end" fontSize="7" fill={bg} fontWeight="700" letterSpacing="1" fontFamily="Arial, sans-serif">{tagText}</text>}
      </svg>
    );
  }

  if (vStyle === "artist") {
    return (
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
        <defs>
          <radialGradient id={`${id}ar`} cx="50%" cy="42%" r="52%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.15" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="320" height="180" fill={bg} />
        <ellipse cx="160" cy="76" rx="132" ry="90" fill={`url(#${id}ar)`} />
        {/* Stylised silhouette */}
        <ellipse cx="160" cy="50" rx="20" ry="22" fill={accent} opacity="0.11" />
        <path d="M128,148 Q140,90 160,80 Q180,90 192,148 Z" fill={accent} opacity="0.08" />
        {/* Circle frame */}
        <ellipse cx="160" cy="74" rx="50" ry="58" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.16" />
        <ellipse cx="160" cy="74" rx="56" ry="64" fill="none" stroke={accent} strokeWidth="0.3" opacity="0.09" />
        {/* Beat name */}
        <text x="160" y="157" textAnchor="middle" fontSize="15" fontWeight="700" fill={accent} letterSpacing="4" fontFamily="Arial, sans-serif">{name}</text>
        <text x="160" y="171" textAnchor="middle" fontSize="7" fontWeight="400" fill={tertiary} letterSpacing="3" opacity="0.55" fontFamily="Arial, sans-serif">TYPE BEAT</text>
        {tagText && <text x="308" y="14" textAnchor="end" fontSize="7" fill={tertiary} letterSpacing="1" opacity="0.35" fontFamily="Arial, sans-serif">{tagText}</text>}
      </svg>
    );
  }

  if (vStyle === "abstract") {
    return (
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
        <defs>
          <radialGradient id={`${id}ab1`} cx="65%" cy="28%" r="52%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}ab2`} cx="22%" cy="76%" r="46%">
            <stop offset="0%" stopColor={tertiary} stopOpacity="0.17" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="320" height="180" fill={bg} />
        <ellipse cx="208" cy="50" rx="112" ry="90" fill={`url(#${id}ab1)`} />
        <ellipse cx="72" cy="138" rx="90" ry="66" fill={`url(#${id}ab2)`} />
        {/* Geometric elements */}
        <polygon points="160,22 224,132 96,132" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.14" />
        <polygon points="160,42 202,120 118,120" fill="none" stroke={accent} strokeWidth="0.3" opacity="0.09" />
        <line x1="0" y1="90" x2="320" y2="90" stroke={accent} strokeWidth="0.3" opacity="0.1" />
        <line x1="160" y1="0" x2="160" y2="180" stroke={accent} strokeWidth="0.3" opacity="0.07" />
        {/* Beat name */}
        <text x="160" y="162" textAnchor="middle" fontSize="10" fontWeight="300" fill={accent} letterSpacing="5" opacity="0.6" fontFamily="Arial, sans-serif">{name}</text>
        {tagText && <text x="308" y="14" textAnchor="end" fontSize="7" fill={tertiary} letterSpacing="1" opacity="0.3" fontFamily="Arial, sans-serif">{tagText}</text>}
      </svg>
    );
  }

  // Minimal (default)
  return (
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full block">
      <defs>
        <radialGradient id={`${id}mn`} cx="72%" cy="22%" r="62%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.07" />
          <stop offset="100%" stopColor={bg} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill={bg} />
      <rect width="320" height="180" fill={`url(#${id}mn)`} />
      {/* Corner accents TL */}
      <line x1="18" y1="18" x2="42" y2="18" stroke={accent} strokeWidth="1" opacity="0.35" />
      <line x1="18" y1="18" x2="18" y2="42" stroke={accent} strokeWidth="1" opacity="0.35" />
      {/* Corner accents BR */}
      <line x1="278" y1="162" x2="302" y2="162" stroke={accent} strokeWidth="1" opacity="0.35" />
      <line x1="302" y1="138" x2="302" y2="162" stroke={accent} strokeWidth="1" opacity="0.35" />
      {/* Thin horizontal rule */}
      <line x1="40" y1="94" x2="280" y2="94" stroke={accent} strokeWidth="0.4" opacity="0.18" />
      {/* Beat name — thin, spaced */}
      <text x="160" y="87" textAnchor="middle" fontSize="26" fontWeight="300" fill={accent} letterSpacing="8" opacity="0.88" fontFamily="Arial, sans-serif">{name}</text>
      <text x="160" y="108" textAnchor="middle" fontSize="7" fontWeight="400" fill={tertiary} letterSpacing="5" opacity="0.4" fontFamily="Arial, sans-serif">TYPE BEAT</text>
      {tagText && <text x="302" y="170" textAnchor="end" fontSize="7" fill={tertiary} letterSpacing="1" opacity="0.3" fontFamily="Arial, sans-serif">{tagText}</text>}
    </svg>
  );
}

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

                  {/* SVG Thumbnail Mockup */}
                  <div className="w-full border border-[#2a2a2a] overflow-hidden mb-5">
                    <ThumbnailMockup
                      concept={concept}
                      beatName={beatName}
                      producerTag={thumbnailStyle.producer_tag}
                      producerTagName={thumbnailStyle.producer_tag_name}
                      idx={i}
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-[#475569] uppercase tracking-widest mb-2">How to Recreate in Canva</p>
                      <p className="text-[#94a3b8] text-sm leading-relaxed">{concept.canva_instructions}</p>
                    </div>
                    <div className="border-l-2 border-[#1e1e1e] pl-3">
                      <p className="text-xs text-[#4ade80]">Why it works: <span className="text-[#64748b]">{concept.why_it_fits}</span></p>
                    </div>
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
