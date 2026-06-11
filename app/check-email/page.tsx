"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleResend = async () => {
    if (!email) return;
    setResendState("sending");
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendState(res.ok ? "sent" : "error");
    } catch {
      setResendState("error");
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold mb-3">Check your email</h1>
      <p className="text-[#94a3b8] text-sm mb-6">
        We sent a confirmation link to{" "}
        {email ? (
          <span className="text-white font-medium">{email}</span>
        ) : (
          "your email address"
        )}
        . Click it to activate your account.
      </p>

      <div className="border border-[#1a1a1a] bg-[#0d0d0d] px-5 py-4 mb-6">
        <p className="text-xs text-[#94a3b8] leading-relaxed">
          Can't find it? Check your spam folder. The link expires in 24 hours.
        </p>
      </div>

      {email && (
        <div className="mb-6">
          {resendState === "idle" && (
            <button
              onClick={handleResend}
              className="text-xs text-[#94a3b8] hover:text-white underline underline-offset-2 transition-colors"
            >
              Resend confirmation email
            </button>
          )}
          {resendState === "sending" && (
            <p className="text-xs text-[#475569]">Sending…</p>
          )}
          {resendState === "sent" && (
            <p className="text-xs text-[#4ade80]">Sent — check your inbox.</p>
          )}
          {resendState === "error" && (
            <p className="text-xs text-[#f87171]">
              Failed to resend.{" "}
              <button onClick={handleResend} className="underline underline-offset-2">
                Try again
              </button>
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-[#475569]">
        Already confirmed?{" "}
        <Link
          href="/login"
          className="text-white hover:text-[#94a3b8] transition-colors underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors"
        >
          TALLY
        </Link>
        <Suspense
          fallback={
            <p className="text-sm text-[#94a3b8]">Check your email for a confirmation link.</p>
          }
        >
          <CheckEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
