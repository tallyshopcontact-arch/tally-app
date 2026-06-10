"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Check, Loader2 } from "lucide-react";

const GENRES = [
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
  "Other",
];

interface FormData {
  youtubeUrl: string;
  genre: string;
  customGenre: string;
  artist1: string;
  artist2: string;
  artist3: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [pendingPromo, setPendingPromo] = useState<string | null>(null);

  useEffect(() => {
    try { setPendingPromo(localStorage.getItem("tally_promo_code")); } catch { /* ignore */ }
  }, []);
  const [form, setForm] = useState<FormData>({
    youtubeUrl: "",
    genre: "",
    customGenre: "",
    artist1: "",
    artist2: "",
    artist3: "",
  });

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";
  const labelClass =
    "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

  const isValidYouTubeUrl = (url: string) => {
    return (
      url.includes("youtube.com/") ||
      url.includes("youtu.be/") ||
      url.includes("youtube.com/@")
    );
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isValidYouTubeUrl(form.youtubeUrl)) {
      setError("Please enter a valid YouTube channel URL (e.g. youtube.com/c/yourchannel).");
      return;
    }
    setStep(2);
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.genre) {
      setError("Please select a genre.");
      return;
    }
    setStep(3);
  };

  const handleStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.artist1.trim()) {
      setError("Please enter at least one artist.");
      return;
    }
    setStep(4);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const genre = form.genre === "Other" ? form.customGenre || "Other" : form.genre;

    const { error: dbError } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? "",
      genre,
      youtube_channel_url: form.youtubeUrl,
      top_artist_1: form.artist1.trim() || null,
      top_artist_2: form.artist2.trim() || null,
      top_artist_3: form.artist3.trim() || null,
      onboarding_complete: true,
    });

    if (dbError) {
      setError("Something went wrong saving your profile. Please try again.");
      setSaving(false);
      return;
    }

    // Mark onboarding complete in auth user metadata so middleware can read it
    await supabase.auth.updateUser({
      data: { onboarding_complete: true },
    });

    setSaving(false);
    setStep(5);

    // Fire-and-forget — don't block the UI on email delivery
    fetch("/api/email/send-welcome", { method: "POST" }).catch(() => {});
  };

  const handleStartTrial = async () => {
    setCheckingOut(true);
    let promoCode: string | null = null;
    try { promoCode = localStorage.getItem("tally_promo_code"); } catch { /* ignore */ }

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promoCode ? { promoCode } : {}),
      });
      const { url, error: checkoutError } = await res.json();
      if (checkoutError) throw new Error(checkoutError);
      try { localStorage.removeItem("tally_promo_code"); } catch { /* ignore */ }
      window.location.href = url;
    } catch (e) {
      console.error("[onboarding] checkout error:", e);
      setCheckingOut(false);
      setError("Failed to start checkout. Please try from the pricing page.");
    }
  };

  const displayGenre = form.genre === "Other"
    ? (form.customGenre || "Other")
    : form.genre;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors">
          TALLY
        </Link>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-0.5 flex-1 transition-colors ${
                s <= step ? "bg-white" : "bg-[#1e1e1e]"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — YouTube channel */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-6">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Step 1 of 4</p>
              <h1 className="text-2xl font-bold mb-2">Your YouTube channel</h1>
              <p className="text-[#94a3b8] text-sm">
                We&apos;ll analyze your channel and niche every month.
              </p>
            </div>

            <div>
              <label className={labelClass}>YouTube Channel URL</label>
              <input
                type="url"
                value={form.youtubeUrl}
                onChange={(e) => { setForm((f) => ({ ...f, youtubeUrl: e.target.value })); setError(""); }}
                placeholder="https://youtube.com/@yourchannel"
                required
                autoFocus
                className={inputClass}
              />
              <p className="text-[#94a3b8] text-xs mt-2">
                Paste your full YouTube channel URL e.g. youtube.com/c/yourchannel
              </p>
            </div>

            {error && <p className="text-[#f87171] text-xs">{error}</p>}

            <button
              type="submit"
              className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors cursor-pointer"
            >
              Continue →
            </button>
          </form>
        )}

        {/* Step 2 — Genre */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="space-y-6">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Step 2 of 4</p>
              <h1 className="text-2xl font-bold mb-2">Your genre</h1>
              <p className="text-[#94a3b8] text-sm">
                Select the genre you produce most often.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, genre: g })); setError(""); }}
                  className={`text-sm px-4 py-2 border transition-colors cursor-pointer ${
                    form.genre === g
                      ? "border-white text-white bg-[#111]"
                      : "border-[#1e1e1e] text-[#94a3b8] hover:border-[#333] hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {form.genre === "Other" && (
              <input
                type="text"
                value={form.customGenre}
                onChange={(e) => setForm((f) => ({ ...f, customGenre: e.target.value }))}
                placeholder="Describe your genre"
                autoFocus
                className={inputClass}
              />
            )}

            {error && <p className="text-[#f87171] text-xs">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 border border-[#1e1e1e] text-[#94a3b8] text-sm py-3.5 hover:border-[#333] hover:text-white transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="submit"
                className="flex-1 bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors cursor-pointer"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {/* Step 3 — Top 3 artists */}
        {step === 3 && (
          <form onSubmit={handleStep3} className="space-y-6">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Step 3 of 4</p>
              <h1 className="text-2xl font-bold mb-2">Your top 3 artists</h1>
              <p className="text-[#94a3b8] text-sm">
                Who do you make beats for? This helps us find your niche.
              </p>
            </div>

            <div className="space-y-3">
              {(["artist1", "artist2", "artist3"] as const).map((key, i) => (
                <div key={key}>
                  <label className={labelClass}>
                    Artist you make beats for #{i + 1}{i === 0 ? "" : " (optional)"}
                  </label>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={["Nas", "Kendrick Lamar", "J Cole"][i]}
                    autoFocus={i === 0}
                    className={inputClass}
                  />
                </div>
              ))}
              <p className="text-[#94a3b8] text-xs">
                e.g. Nas, Kendrick Lamar, J Cole
              </p>
            </div>

            {error && <p className="text-[#f87171] text-xs">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 border border-[#1e1e1e] text-[#94a3b8] text-sm py-3.5 hover:border-[#333] hover:text-white transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="submit"
                className="flex-1 bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors cursor-pointer"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {/* Step 4 — Confirmation */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Step 4 of 4</p>
              <h1 className="text-2xl font-bold mb-2">Confirm your details</h1>
              <p className="text-[#94a3b8] text-sm">
                Look right? Hit confirm to generate your first report.
              </p>
            </div>

            <div className="border border-[#1e1e1e] divide-y divide-[#1e1e1e]">
              {[
                { label: "YouTube channel", value: form.youtubeUrl },
                { label: "Genre", value: displayGenre },
                {
                  label: "Top artists",
                  value: [form.artist1, form.artist2, form.artist3]
                    .filter(Boolean)
                    .join(", "),
                },
              ].map(({ label, value }) => (
                <div key={label} className="px-5 py-4">
                  <p className="text-xs text-[#475569] uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-sm text-[#cbd5e1] break-all">{value || "—"}</p>
                </div>
              ))}
            </div>

            {error && <p className="text-[#f87171] text-xs">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex-1 border border-[#1e1e1e] text-[#94a3b8] text-sm py-3.5 hover:border-[#333] hover:text-white transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Confirm →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 — Start trial */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">You&apos;re all set</p>
              {pendingPromo === "FOUNDING20" ? (
                <>
                  <h1 className="text-2xl font-bold mb-2">Claim your founding member offer</h1>
                  <p className="text-[#4ade80] text-sm">
                    14 days free · $19.99/month locked for life · No credit card required.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold mb-2">Start your free trial</h1>
                  <p className="text-[#94a3b8] text-sm">
                    7 days free. No charge until the trial ends. Cancel anytime.
                  </p>
                </>
              )}
            </div>

            <div className={`border p-6 ${pendingPromo === "FOUNDING20" ? "border-[#4ade80]/30" : "border-white/20"}`}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-sm font-bold">TALLY Pro</p>
                  <p className="text-[#94a3b8] text-xs mt-0.5">All 7 tools. Unlimited uses.</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold">$19.99</p>
                  <p className="text-xs text-[#94a3b8]">per month</p>
                </div>
              </div>
              <ul className="space-y-2 mb-6">
                {[
                  "Upload Kit Generator — unlimited",
                  "Title Tester — unlimited",
                  "Keyword Heat Map",
                  "Monthly Report — full channel analysis",
                  "Action Plan — 7 monthly priorities",
                  "Competitor Tracker",
                  "TALLY Score",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                    <Check className="w-3 h-3 text-[#475569] shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleStartTrial}
                disabled={checkingOut}
                className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {checkingOut && <Loader2 className="w-4 h-4 animate-spin" />}
                {checkingOut
                  ? "Redirecting…"
                  : pendingPromo === "FOUNDING20"
                  ? "Claim Founding Member Offer →"
                  : "Start 7-Day Free Trial →"}
              </button>
              <p className="text-center text-xs text-[#475569] mt-3">
                No card required for trial period.
              </p>
            </div>

            {error && <p className="text-[#f87171] text-xs">{error}</p>}

            <p className="text-center text-xs text-[#475569]">
              Want to explore first?{" "}
              <button
                type="button"
                onClick={() => { router.push("/dashboard"); router.refresh(); }}
                className="text-white/60 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
              >
                Go to dashboard
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
