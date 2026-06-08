"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Check, AlertTriangle } from "lucide-react";

interface Profile {
  name: string;
  email: string;
  genre: string;
  youtube_channel_url: string;
  top_artist_1: string;
  top_artist_2: string;
  top_artist_3: string;
  subscription_tier: string;
}

const inputClass =
  "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";

const labelClass = "block text-xs text-[#94a3b8] uppercase tracking-widest mb-2";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    genre: "",
    youtube_channel_url: "",
    top_artist_1: "",
    top_artist_2: "",
    top_artist_3: "",
    subscription_tier: "free",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [googleToast, setGoogleToast] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      supabase
        .from("profiles")
        .select(
          "name, email, genre, youtube_channel_url, top_artist_1, top_artist_2, top_artist_3, subscription_tier"
        )
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setProfile({
              name: data.name ?? "",
              email: data.email ?? user.email ?? "",
              genre: data.genre ?? "",
              youtube_channel_url: data.youtube_channel_url ?? "",
              top_artist_1: data.top_artist_1 ?? "",
              top_artist_2: data.top_artist_2 ?? "",
              top_artist_3: data.top_artist_3 ?? "",
              subscription_tier: data.subscription_tier ?? "free",
            });
          }
          setLoading(false);
        });
    });
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        name: profile.name,
        genre: profile.genre,
        youtube_channel_url: profile.youtube_channel_url,
        top_artist_1: profile.top_artist_1 || null,
        top_artist_2: profile.top_artist_2 || null,
        top_artist_3: profile.top_artist_3 || null,
      })
      .eq("id", user.id);

    if (error) {
      setSaveError("Failed to save changes. Please try again.");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const set = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((p) => ({ ...p, [field]: e.target.value }));
    setSaved(false);
    setSaveError("");
  };

  const planLabel: Record<string, string> = {
    free: "Free Trial",
    basic: "Basic",
    growth: "Growth",
    pro: "Pro",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-sm font-bold tracking-[0.25em] hover:text-[#94a3b8] transition-colors">
            TALLY
          </Link>
          <Link href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <div>
          <h1 className="text-2xl font-bold mb-1">Settings</h1>
          <p className="text-[#94a3b8] text-sm">Manage your profile, connections, and subscription.</p>
        </div>

        {/* Profile */}
        <section>
          <h2 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-6 pb-4 border-b border-[#1a1a1a]">
            Profile
          </h2>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={set("name")}
                  placeholder="Your name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className={`${inputClass} opacity-40 cursor-not-allowed`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Genre</label>
                <input
                  type="text"
                  value={profile.genre}
                  onChange={set("genre")}
                  placeholder="Boom Bap, Trap, Lo-fi…"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>YouTube Channel URL</label>
                <input
                  type="url"
                  value={profile.youtube_channel_url}
                  onChange={set("youtube_channel_url")}
                  placeholder="https://youtube.com/@yourchannel"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Top Artists (influences your niche analysis)</label>
              <div className="space-y-3">
                {(["top_artist_1", "top_artist_2", "top_artist_3"] as const).map(
                  (field, i) => (
                    <input
                      key={field}
                      type="text"
                      value={profile[field]}
                      onChange={set(field)}
                      placeholder={`Artist ${i + 1}${i > 0 ? " (optional)" : ""}`}
                      className={inputClass}
                    />
                  )
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-xs text-[#4ade80]">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {saveError && (
                <span className="flex items-center gap-1.5 text-xs text-[#f87171]">
                  <AlertTriangle className="w-3.5 h-3.5" /> {saveError}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Connected accounts */}
        <section>
          <h2 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-6 pb-4 border-b border-[#1a1a1a]">
            Connected Accounts
          </h2>
          <div className="border border-[#1a1a1a] p-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium mb-1">Google Account</p>
              <p className="text-[#475569] text-xs">
                Connect Google to unlock watch time, monthly subscriber gains, and audience data.
              </p>
              <p className="text-[#f87171] text-xs mt-2 font-medium">Not connected</p>
            </div>
            <button
              onClick={() => {
                setGoogleToast(true);
                setTimeout(() => setGoogleToast(false), 3000);
              }}
              className="shrink-0 border border-[#2a2a2a] text-white text-xs font-semibold px-4 py-2.5 hover:border-[#444] transition-colors cursor-pointer"
            >
              Connect
            </button>
          </div>
          {googleToast && (
            <p className="text-xs text-[#94a3b8] mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24]" />
              Google OAuth connection coming soon — available on Pro plan.
            </p>
          )}
        </section>

        {/* Subscription */}
        <section>
          <h2 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-6 pb-4 border-b border-[#1a1a1a]">
            Subscription
          </h2>
          <div className="border border-[#1a1a1a] p-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium mb-1">
                Current plan:{" "}
                <span className="text-white font-bold">
                  {planLabel[profile.subscription_tier] ?? profile.subscription_tier}
                </span>
              </p>
              <p className="text-[#475569] text-xs">
                {profile.subscription_tier === "free"
                  ? "You're on the free trial. Upgrade to unlock more features."
                  : "Manage your billing and plan details below."}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {profile.subscription_tier === "free" ? (
                <Link
                  href="/pricing"
                  className="border border-[#2a2a2a] text-white text-xs font-semibold px-4 py-2.5 hover:border-[#444] transition-colors"
                >
                  Upgrade plan
                </Link>
              ) : (
                <button
                  onClick={() => {
                    setGoogleToast(true);
                    setTimeout(() => setGoogleToast(false), 3000);
                  }}
                  className="border border-[#2a2a2a] text-white text-xs font-semibold px-4 py-2.5 hover:border-[#444] transition-colors cursor-pointer"
                >
                  Manage billing
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
