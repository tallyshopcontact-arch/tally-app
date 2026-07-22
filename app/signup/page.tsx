"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [pendingPromo, setPendingPromo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Persist promo code from URL → localStorage so it survives the full signup+onboarding flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const promo = params.get("promo");
    if (promo) {
      try { localStorage.setItem("tally_promo_code", promo); } catch { /* ignore */ }
      setPendingPromo(promo);
    }
  }, []);

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the confirmed user via the server-side admin API route.
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Signup failed — please try again.");
        return;
      }

      // Step 2: Sign in immediately (user is already confirmed in Supabase).
      const supabase = createSupabaseBrowserClient();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("[signup] signInWithPassword error:", signInError.message);
        setError("Account created but sign-in failed — please go to the login page.");
        return;
      }

      // Step 3: Upsert the profile row in case the server-side insert raced or failed.
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          email: user.email,
          name,
          subscription_status: "free",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (profileError) {
          console.error("[signup] Profile upsert error:", profileError.message);
        }
      }

      // Step 4: Redirect to the standalone check-email page (survives refresh).
      router.push(`/check-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error("[signup] Caught error:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors">
          TALLY
        </Link>

        <h1 className="text-2xl font-bold mb-2">Create your account</h1>
        {pendingPromo === "FOUNDING20" ? (
          <p className="text-[#4ade80] text-sm mb-8">
            Founding member offer applied — 14 days free, then $11.20/month locked for life (20% off with FOUNDING20).
          </p>
        ) : (
          <p className="text-[#94a3b8] text-sm mb-8">
            Start growing your YouTube channel with monthly data.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="Your name"
            required
            autoFocus
            className={inputClass}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="Email"
            required
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Password (min. 8 characters)"
            required
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
            placeholder="Confirm password"
            required
            className={inputClass}
          />

          {error && (
            <p className="text-[#f87171] text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-[#94a3b8]">
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:text-[#94a3b8] transition-colors underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
