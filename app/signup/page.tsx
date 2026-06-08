"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

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
      const supabase = createSupabaseBrowserClient();

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("already")) {
          setError("An account with this email already exists. Try signing in.");
        } else {
          setError(authError.message);
        }
        return;
      }

      if (!data.user) {
        setError("Signup failed — please try again.");
        return;
      }

      if (!data.session) {
        // Supabase email confirmation is enabled — user must verify before logging in.
        setCheckEmail(true);
        return;
      }

      // Session exists (email confirmation disabled) — insert profile and proceed.
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        email: data.user.email,
        name,
        subscription_tier: "free",
        onboarding_complete: false,
      });

      if (profileError) {
        console.error("Profile insert error:", profileError.message);
        // Don't block signup — profile can be upserted during onboarding.
      }

      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      console.error("Signup error:", err);
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors">
            TALLY
          </Link>
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-[#94a3b8] text-sm mb-6">
            We sent a confirmation link to <span className="text-white">{email}</span>. Click it to activate your account, then come back to sign in.
          </p>
          <Link
            href="/login"
            className="block w-full text-center bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors">
          TALLY
        </Link>

        <h1 className="text-2xl font-bold mb-2">Create your account</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Start growing your YouTube channel with monthly data.
        </p>

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
