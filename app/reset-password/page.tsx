"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;
// How long to wait for Supabase to establish the recovery session (it parses
// the code out of the URL on load) before treating the link as dead.
const RECOVERY_TIMEOUT_MS = 4000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "ready" | "expired">("waiting");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Supabase fires PASSWORD_RECOVERY once it parses the recovery code out
    // of the URL and establishes a session for it — that's the real signal
    // this is a legit reset link, not just an already-logged-in session.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // onAuthStateChange only fires on a transition. If the recovery session
    // was already established before this effect subscribed, check directly
    // so a real reset link never gets stuck on "waiting".
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus((s) => (s === "waiting" ? "ready" : s));
    });

    const timeout = setTimeout(() => {
      setStatus((s) => (s === "waiting" ? "expired" : s));
    }, RECOVERY_TIMEOUT_MS);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
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

        {status === "waiting" && (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin" />
            <p className="text-sm text-[#94a3b8]">Verifying your reset link…</p>
          </div>
        )}

        {status === "expired" && (
          <>
            <h1 className="text-2xl font-bold mb-3">Link expired</h1>
            <p className="text-[#94a3b8] text-sm mb-8">
              This password reset link is invalid or has expired. Request a new one to continue.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block text-sm bg-white text-black px-5 py-2.5 font-semibold hover:bg-[#e8e8e8] transition-colors"
            >
              Request a new link
            </Link>
          </>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Set a new password</h1>
            <p className="text-[#94a3b8] text-sm mb-8">Choose a new password for your account.</p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="New password"
                required
                autoFocus
                className={inputClass}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError("");
                }}
                placeholder="Confirm new password"
                required
                className={inputClass}
              />

              {error && <p className="text-[#f87171] text-xs">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
