"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ArrowUpRight, Check, ChevronRight, Download, Loader2, RefreshCw, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThumbnailStyle {
  style: string;
  color: string;
  text_preference: string;
  producer_tag: boolean;
  producer_tag_name?: string;
}

interface ImageResult {
  label: string;
  description: string;
  prompt: string;
  url: string | null;
  error: string | null;
}

interface GenerateResult {
  beat_name: string;
  genre: string;
  images: ImageResult[];
  niche_insights: string;
}

interface RecentGeneration {
  id: string;
  beat_name: string;
  image_urls: (string | null)[];
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRES = [
  "Boom Bap", "Trap", "Drill", "Lo-fi", "Afrobeats",
  "Jersey Club", "UK Drill", "Pop Rap", "R&B", "Melodic Rap",
];

const VIBES = [
  "Dark", "Soulful", "Aggressive", "Melodic", "Cinematic",
  "Grimy", "Emotional", "Hard", "Smooth", "Eerie",
];

const CANVA_FONTS: Record<string, string[]> = {
  "Boom Bap": ["Black Ops One", "Anton", "Bebas Neue"],
  "Trap": ["Druk Wide Bold", "Impact", "Roboto Black"],
  "Drill": ["DIN Condensed Bold", "Oswald Bold", "Barlow Condensed"],
  "Lo-fi": ["Playfair Display", "Libre Baskerville", "Lato Light"],
  "Afrobeats": ["Montserrat ExtraBold", "Nunito Black", "Poppins Bold"],
  "R&B": ["Cormorant Garamond", "Raleway Light", "EB Garamond"],
  "Melodic Rap": ["Tenor Sans", "Josefin Sans", "Montserrat Light"],
};

// ── Setup Wizard config ───────────────────────────────────────────────────────

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
    if (user) await supabase.from("profiles").update({ thumbnail_style: style }).eq("id", user.id);
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

      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Choose your thumbnail style</h2>
          <p className="text-[#94a3b8] text-sm mb-7">This shapes every image we generate for you.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {STYLE_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setSelectedStyle(opt.id)}
                className={`border p-4 text-left transition-colors cursor-pointer ${selectedStyle === opt.id ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
                <div className="w-full h-16 mb-3 flex items-center justify-center" style={{ background: opt.bg }}>
                  <span className="text-xs font-bold tracking-wider" style={{ color: opt.accent }}>{opt.label.toUpperCase()}</span>
                </div>
                <p className="text-white text-xs font-semibold mb-0.5">{opt.label}</p>
                <p className="text-[#475569] text-xs">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button disabled={!selectedStyle} onClick={() => setStep(2)}
            className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Choose your dominant color</h2>
          <p className="text-[#94a3b8] text-sm mb-7">The base background tone for your thumbnails.</p>
          <div className="flex flex-wrap gap-4 mb-8">
            {COLOR_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setSelectedColor(opt.id)} className="flex flex-col items-center gap-2 cursor-pointer" title={opt.label}>
                {opt.id === "custom" ? (
                  <div className={`w-12 h-12 border-2 flex items-center justify-center ${selectedColor === "custom" ? "border-white" : "border-[#2a2a2a]"}`}>
                    <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
                      className="w-8 h-8 cursor-pointer border-0 bg-transparent" />
                  </div>
                ) : (
                  <div className={`w-12 h-12 border-2 ${selectedColor === opt.id ? "border-white" : "border-transparent"}`} style={{ background: opt.hex }} />
                )}
                <span className="text-[10px] text-[#475569]">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Back</button>
            <button onClick={() => setStep(3)} className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] transition-colors cursor-pointer">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-xl font-bold mb-2">How much text on your thumbnails?</h2>
          <p className="text-[#94a3b8] text-sm mb-7">We generate image-only thumbnails — you add text in Canva.</p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {TEXT_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setTextPref(opt.id)}
                className={`border p-4 text-left transition-colors cursor-pointer ${textPref === opt.id ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
                <p className="text-white text-sm font-semibold mb-1">{opt.label}</p>
                <p className="text-[#475569] text-xs">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Back</button>
            <button onClick={() => setStep(4)} className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] transition-colors cursor-pointer">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Add your producer tag?</h2>
          <p className="text-[#94a3b8] text-sm mb-7">We&apos;ll note this when generating your Canva instructions.</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button onClick={() => setProducerTag(true)}
              className={`border p-4 text-left transition-colors cursor-pointer ${producerTag ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
              <p className="text-white text-sm font-semibold mb-1">Yes</p>
              <p className="text-[#475569] text-xs">Include my producer name</p>
            </button>
            <button onClick={() => setProducerTag(false)}
              className={`border p-4 text-left transition-colors cursor-pointer ${!producerTag ? "border-white bg-[#111]" : "border-[#1a1a1a] hover:border-[#2a2a2a]"}`}>
              <p className="text-white text-sm font-semibold mb-1">No</p>
              <p className="text-[#475569] text-xs">Keep thumbnails clean</p>
            </button>
          </div>
          {producerTag && (
            <input value={tagName} onChange={(e) => setTagName(e.target.value)}
              placeholder="Producer name / tag (e.g. Prod. by Metro)"
              className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 mb-5 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]" />
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-5 py-3 border border-[#1e1e1e] text-sm text-[#94a3b8] hover:text-white transition-colors cursor-pointer">Back</button>
            <button onClick={handleFinish} disabled={saving}
              className="flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving..." : "Finish Setup →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Image Card ────────────────────────────────────────────────────────────────

function ImageCard({
  image,
  idx,
  beatName,
  genre,
  onRegenerate,
}: {
  image: ImageResult;
  idx: number;
  beatName: string;
  genre: string;
  onRegenerate: (idx: number) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [showCanva, setShowCanva] = useState(false);

  const handleDownload = async () => {
    if (!image.url) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/thumbnail-studio/proxy-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image.url }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = beatName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      a.href = objectUrl;
      a.download = `tally-thumbnail-${slug}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in new tab
      window.open(image.url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const fonts = CANVA_FONTS[genre] ?? ["Bebas Neue", "Anton", "Oswald Bold"];

  return (
    <div className="border border-[#1a1a1a]">
      {/* Label row */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a]">
        <div>
          <p className="text-xs text-[#475569] uppercase tracking-widest">{`Concept ${idx + 1}`}</p>
          <p className="text-white font-semibold text-sm">{image.label}</p>
        </div>
        <button
          onClick={() => onRegenerate(idx)}
          className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </button>
      </div>

      {/* Image */}
      <div className="relative w-full aspect-video bg-[#111]">
        {image.url ? (
          <img src={image.url} alt={image.label} className="w-full h-full object-cover" />
        ) : image.error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[#f87171] text-xs text-center px-4">{image.error}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Description + actions */}
      <div className="p-5">
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">{image.description}</p>

        <div className="flex gap-3 mb-4">
          <button
            onClick={handleDownload}
            disabled={!image.url || downloading}
            className="flex items-center gap-2 bg-white text-black text-xs font-semibold px-4 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? "Downloading..." : "Download"}
          </button>
          <button
            onClick={() => setShowCanva((v) => !v)}
            className="flex items-center gap-2 border border-[#1e1e1e] text-white text-xs font-semibold px-4 py-2.5 hover:border-[#2a2a2a] transition-colors cursor-pointer"
          >
            Add text overlay
            {showCanva ? <X className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Canva text overlay instructions */}
        {showCanva && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-4 text-sm">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Add Beat Name in Canva</p>
            <ol className="space-y-2 text-[#94a3b8] text-sm">
              <li className="flex gap-2"><span className="text-white shrink-0">1.</span>Download this thumbnail above</li>
              <li className="flex gap-2"><span className="text-white shrink-0">2.</span>Open Canva → New design → YouTube Thumbnail (1280×720)</li>
              <li className="flex gap-2"><span className="text-white shrink-0">3.</span>Upload your image as background, resize to fill</li>
              <li className="flex gap-2"><span className="text-white shrink-0">4.</span>Add a text box with your beat name — keep it short and punchy</li>
              <li className="flex gap-2"><span className="text-white shrink-0">5.</span>Position in lower third or center — avoid covering key visual elements</li>
            </ol>
            <div className="mt-3 pt-3 border-t border-[#1a1a1a]">
              <p className="text-xs text-[#475569] mb-1.5">Recommended fonts for {genre}:</p>
              <div className="flex flex-wrap gap-1.5">
                {fonts.map((f) => (
                  <span key={f} className="text-xs text-[#94a3b8] border border-[#1e1e1e] px-2 py-0.5">{f}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Generator ─────────────────────────────────────────────────────────────────

function Generator({
  thumbnailStyle,
  profileGenre,
  profileArtists,
  onEditStyle,
}: {
  thumbnailStyle: ThumbnailStyle;
  profileGenre: string;
  profileArtists: string[];
  onEditStyle: () => void;
}) {
  const [beatName, setBeatName] = useState("");
  const [genre, setGenre] = useState(profileGenre);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [artist1, setArtist1] = useState(profileArtists[0] ?? "");
  const [artist2, setArtist2] = useState(profileArtists[1] ?? "");
  const [artist3, setArtist3] = useState(profileArtists[2] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [recentGens, setRecentGens] = useState<RecentGeneration[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("thumbnail_generations")
        .select("id, beat_name, image_urls, created_at")
        .eq("producer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setRecentGens(data as RecentGeneration[]);
    });
  }, []);

  const toggleVibe = (v: string) =>
    setSelectedVibes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const handleGenerate = async () => {
    if (!beatName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setImages([]);

    // Scroll to results
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    try {
      const res = await fetch("/api/thumbnail-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beat_name: beatName.trim(),
          genre,
          vibe: selectedVibes,
          artists: [artist1, artist2, artist3].filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      const data = json as GenerateResult;
      setResult(data);
      setImages(data.images);

      // Refresh recent generations
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: recents } = await supabase
          .from("thumbnail_generations")
          .select("id, beat_name, image_urls, created_at")
          .eq("producer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (recents) setRecentGens(recents as RecentGeneration[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (idx: number) => {
    if (!result) return;
    const image = images[idx];
    if (!image) return;

    setImages((prev) => prev.map((im, i) => i === idx ? { ...im, url: null, error: null } : im));

    try {
      const res = await fetch("/api/thumbnail-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beat_name: beatName.trim(),
          genre,
          vibe: selectedVibes,
          artists: [artist1, artist2, artist3].filter(Boolean),
        }),
      });
      const json = await res.json() as GenerateResult;
      if (res.ok && json.images[idx]) {
        setImages((prev) => prev.map((im, i) => i === idx ? json.images[idx] : im));
      }
    } catch (e) {
      setImages((prev) => prev.map((im, i) =>
        i === idx ? { ...im, error: e instanceof Error ? e.message : "Failed" } : im
      ));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── Left: Input form ── */}
      <div className="space-y-5">
        {/* Style summary */}
        <div className="border border-[#1a1a1a] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 border border-[#2a2a2a] shrink-0" style={{ background: thumbnailStyle.color }} />
            <div>
              <p className="text-white text-sm font-medium">{thumbnailStyle.style}</p>
              <p className="text-[#475569] text-xs capitalize">{thumbnailStyle.text_preference} text · {thumbnailStyle.producer_tag ? "with producer tag" : "no tag"}</p>
            </div>
          </div>
          <button onClick={onEditStyle} className="text-xs text-[#475569] hover:text-[#94a3b8] transition-colors cursor-pointer shrink-0">
            Edit style →
          </button>
        </div>

        {/* Beat name */}
        <div>
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Beat Name</label>
          <input
            value={beatName}
            onChange={(e) => setBeatName(e.target.value)}
            placeholder='e.g. "Phantom"'
            className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]"
          />
        </div>

        {/* Genre */}
        <div>
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Genre</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-3 focus:outline-none focus:border-[#2a2a2a] cursor-pointer appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}
          >
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Vibes */}
        <div>
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Beat Vibe</label>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => (
              <button
                key={v}
                onClick={() => toggleVibe(v)}
                className={`text-xs px-3 py-1.5 border transition-colors cursor-pointer ${
                  selectedVibes.includes(v) ? "border-white bg-white text-black" : "border-[#1e1e1e] text-[#94a3b8] hover:border-[#2a2a2a]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Artists */}
        <div>
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Sounds Like</label>
          <div className="space-y-2">
            {[
              { val: artist1, set: setArtist1, ph: "Artist 1 (e.g. Travis Scott)" },
              { val: artist2, set: setArtist2, ph: "Artist 2 (e.g. Future)" },
              { val: artist3, set: setArtist3, ph: "Artist 3 (optional)" },
            ].map(({ val, set, ph }) => (
              <input key={ph} value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                className="w-full bg-[#111] border border-[#1e1e1e] text-white text-sm px-4 py-2.5 placeholder-[#2a2a2a] focus:outline-none focus:border-[#2a2a2a]" />
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div className="pt-2">
          <button
            onClick={handleGenerate}
            disabled={loading || !beatName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-bold py-4 hover:bg-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
            {loading ? "Generating thumbnails..." : "Generate Thumbnails →"}
          </button>
          <p className="text-xs text-[#475569] text-center mt-2">3 AI-generated thumbnail variations · DALL-E 3</p>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-[#f87171]/30 px-4 py-3 text-[#f87171] text-sm">{error}</div>
        )}

        {/* Recent generations */}
        {recentGens.length > 0 && (
          <div>
            <p className="text-xs text-[#475569] uppercase tracking-widest mb-3">Recent Generations</p>
            <div className="space-y-2">
              {recentGens.map((gen) => {
                const firstUrl = gen.image_urls?.find((u) => u != null);
                return (
                  <div key={gen.id} className="flex items-center gap-3 border border-[#1a1a1a] p-2 hover:bg-[#0d0d0d] transition-colors">
                    <div className="w-16 h-9 bg-[#111] shrink-0 overflow-hidden">
                      {firstUrl && <img src={firstUrl} alt={gen.beat_name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{gen.beat_name}</p>
                      <p className="text-[#475569] text-[10px]">
                        {new Date(gen.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Generated images ── */}
      <div ref={resultsRef}>
        {!loading && !result && (
          <div className="border border-[#1a1a1a] aspect-video flex flex-col items-center justify-center text-center p-8">
            <div className="w-10 h-10 bg-[#111] border border-[#1e1e1e] flex items-center justify-center mb-4">
              <ArrowUpRight className="w-4 h-4 text-[#475569]" />
            </div>
            <p className="text-white text-sm font-medium mb-1">Your thumbnails will appear here</p>
            <p className="text-[#475569] text-xs max-w-xs leading-relaxed">Fill in your beat details and click Generate — 3 AI images arrive in about 30 seconds.</p>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="border border-[#1a1a1a] px-5 py-4 flex items-center gap-3">
              <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">Generating your thumbnails...</p>
                <p className="text-[#475569] text-xs mt-0.5">Claude analyzes your niche → crafts 3 DALL-E prompts → generates images</p>
              </div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="border border-[#1a1a1a]">
                <div className="px-5 py-3 border-b border-[#1a1a1a]">
                  <div className="h-3 w-24 bg-[#1a1a1a] animate-pulse" />
                </div>
                <div className="aspect-video bg-[#0d0d0d] flex items-center justify-center">
                  <div className="w-5 h-5 border border-[#2a2a2a] border-t-[#475569] rounded-full animate-spin" />
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="space-y-6">
            {images.map((img, i) => (
              <ImageCard
                key={i}
                image={img}
                idx={i}
                beatName={beatName}
                genre={genre}
                onRegenerate={handleRegenerate}
              />
            ))}

            {/* Canva workflow */}
            <div className="border border-[#1a1a1a] p-6">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">Add Your Beat Title in Canva</p>
              <ol className="space-y-3">
                {[
                  "Download your chosen thumbnail using the button above",
                  "Open Canva and create a new design → YouTube Thumbnail (1280×720)",
                  "Upload your downloaded image and set it as background — resize to fill",
                  "Add a text box with your beat name. Keep it short — 1 to 3 words max",
                  `Recommended fonts for ${genre}: ${(CANVA_FONTS[genre] ?? ["Bebas Neue", "Anton"]).join(", ")}`,
                  "Keep text minimal — less is more in most beat niches. Bottom third or center works best",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <span className="text-white text-xs font-bold shrink-0 w-5">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ThumbnailStudioPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [thumbnailStyle, setThumbnailStyle] = useState<ThumbnailStyle | null>(null);
  const [profileGenre, setProfileGenre] = useState("");
  const [profileArtists, setProfileArtists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStyle, setEditingStyle] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset") === "1";

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email ?? null);

      const { data } = await supabase
        .from("profiles")
        .select("genre, top_artist_1, top_artist_2, top_artist_3, thumbnail_style")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfileGenre(data.genre ?? "");
        setProfileArtists([data.top_artist_1, data.top_artist_2, data.top_artist_3].filter(Boolean) as string[]);
        if (!reset && data.thumbnail_style) {
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

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Thumbnail Studio</h1>
          <p className="text-[#94a3b8] text-sm">
            Real AI-generated thumbnail images via DALL-E 3, tailored to your style and niche.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-[#94a3b8] text-sm border border-[#1a1a1a] px-5 py-4">
            <div className="w-4 h-4 border border-[#475569] border-t-[#4ade80] rounded-full animate-spin shrink-0" />
            Loading your preferences...
          </div>
        ) : !thumbnailStyle || editingStyle ? (
          <SetupWizard
            onComplete={(style) => {
              setThumbnailStyle(style);
              setEditingStyle(false);
            }}
          />
        ) : (
          <Generator
            thumbnailStyle={thumbnailStyle}
            profileGenre={profileGenre}
            profileArtists={profileArtists}
            onEditStyle={() => setEditingStyle(true)}
          />
        )}
      </div>
    </div>
  );
}
