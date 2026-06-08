"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors"
        >
          TALLY
        </Link>

        {submitted ? (
          <>
            <h1 className="text-2xl font-bold mb-2">Check your email</h1>
            <p className="text-[#94a3b8] text-sm mb-8">
              We&apos;ve sent a reset link to{" "}
              <span className="text-white">{email}</span>.
            </p>
            <p className="text-sm text-[#94a3b8]">
              <Link
                href="/login"
                className="text-white hover:text-[#94a3b8] transition-colors underline underline-offset-2"
              >
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
            <p className="text-[#94a3b8] text-sm mb-8">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="Email"
                required
                autoFocus
                className={inputClass}
              />

              {error && <p className="text-[#f87171] text-xs">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-sm text-[#94a3b8]">
              <Link
                href="/login"
                className="hover:text-white transition-colors"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
