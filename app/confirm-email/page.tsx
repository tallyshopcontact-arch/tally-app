"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No confirmation token found in this link.");
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    fetch("/api/auth/confirm-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          try { localStorage.removeItem("tally_pending_confirmation"); } catch { /* ignore */ }
          setStatus("success");
          setTimeout(() => router.push("/onboarding"), 2000);
        } else {
          setStatus("error");
          setErrorMsg(data.error ?? "Confirmation failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Network error. Please try again.");
      });
  }, [token, router]);

  return (
    <>
      {status === "loading" && (
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin" />
          <p className="text-sm text-[#94a3b8]">Confirming your email…</p>
        </div>
      )}

      {status === "success" && (
        <>
          <h1 className="text-2xl font-bold mb-3">Email confirmed.</h1>
          <p className="text-[#94a3b8] text-sm">
            Your account is active. Redirecting you to onboarding…
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <h1 className="text-2xl font-bold mb-3">Link invalid</h1>
          <p className="text-[#f87171] text-sm mb-6">{errorMsg}</p>
          <div className="flex gap-3">
            <Link
              href="/signup"
              className="text-sm border border-[#1a1a1a] px-5 py-2.5 text-[#94a3b8] hover:border-[#333] hover:text-white transition-colors"
            >
              Sign up again
            </Link>
            <Link
              href="/login"
              className="text-sm bg-white text-black px-5 py-2.5 font-semibold hover:bg-[#e8e8e8] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </>
      )}
    </>
  );
}

export default function ConfirmEmailPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12 hover:text-[#94a3b8] transition-colors">
          TALLY
        </Link>
        <Suspense
          fallback={
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin" />
              <p className="text-sm text-[#94a3b8]">Loading…</p>
            </div>
          }
        >
          <ConfirmEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
