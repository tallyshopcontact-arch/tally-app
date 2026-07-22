"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubInfo {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  trialEnd: string | null;
}

// ── Reason options ─────────────────────────────────────────────────────────────

const REASONS = [
  "Too expensive",
  "Not using it enough",
  "Missing a feature I need",
  "Not seeing results yet",
  "Found something better",
  "Just taking a break",
  "Other",
];

// ── Retention offer map ────────────────────────────────────────────────────────

function getRetentionOffer(reasons: string[]): "discount" | "pause" | "feature" | "walkthrough" | null {
  if (reasons.includes("Too expensive")) return "discount";
  if (reasons.includes("Not using it enough")) return "pause";
  if (reasons.includes("Missing a feature I need")) return "feature";
  if (reasons.includes("Not seeing results yet")) return "walkthrough";
  return null;
}

// ── What you'll lose ──────────────────────────────────────────────────────────

const LOSSES = [
  "Upload Kit — unlimited artist-lane opportunity scoring",
  "Title Generator — deterministic titles built from real winning packaging",
  "Full lane breakdowns — demand, competition & winnability across both lanes",
  "Video galleries — the actual winning videos behind each lane's score",
  "Upload Kit history — every lane you've checked, saved and revisitable",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CancelPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  // Step 2 state
  const [reasons, setReasons] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [featureRequest, setFeatureRequest] = useState("");

  // Step 3 state
  const [retentionOffer, setRetentionOffer] = useState<"discount" | "pause" | "feature" | "walkthrough" | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionAccepted, setRetentionAccepted] = useState(false);
  const [retentionError, setRetentionError] = useState("");
  const [retentionDone, setRetentionDone] = useState(false);

  // Step 4 state
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Auth check + sub info
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
    });

    fetch("/api/stripe/subscription")
      .then((r) => r.json())
      .then((d) => {
        setSubInfo(d.subscription ?? null);
        if (d.subscription?.currentPeriodEnd) {
          setPeriodEnd(d.subscription.currentPeriodEnd);
        }
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => setSubLoading(false));
  }, [router]);

  const toggleReason = (r: string) => {
    setReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const handleRetentionOffer = async (type: "discount" | "pause") => {
    setRetentionLoading(true);
    setRetentionError("");
    try {
      const res = await fetch("/api/stripe/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: type }),
      });
      const data = await res.json();
      if (res.ok) {
        setRetentionAccepted(true);
        setRetentionDone(true);
      } else {
        setRetentionError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setRetentionError("Network error. Please try again.");
    } finally {
      setRetentionLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError("");
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasons,
          other_reason: reasons.includes("Other") ? otherText : null,
          feature_request: featureRequest || null,
          retention_offer_shown: retentionOffer,
          retention_offer_accepted: retentionAccepted,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.periodEnd) setPeriodEnd(data.periodEnd);
        setDone(true);
      } else {
        setCancelError(data.error ?? "Cancellation failed. Please try again.");
        setCancelling(false);
      }
    } catch {
      setCancelError("Network error. Please try again.");
      setCancelling(false);
    }
  };

  // ── Cancelled confirmation ─────────────────────────────────────────────────

  if (done) {
    return (
      <CancelShell>
        <div className="max-w-lg mx-auto text-center">
          <p className="text-4xl mb-6">👋</p>
          <h1 className="text-2xl font-bold mb-3">We&apos;re sorry to see you go</h1>
          <p className="text-[#94a3b8] text-sm mb-2">
            Your access continues until{" "}
            <span className="text-white font-medium">{periodEnd ?? "the end of your billing period"}</span>.
          </p>
          <p className="text-[#94a3b8] text-sm mb-8">
            You can resubscribe anytime at{" "}
            <Link href="/pricing" className="text-white underline underline-offset-2">
              tallyagc.com/pricing
            </Link>
            .
          </p>
          <Link
            href="/"
            className="inline-block text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
          >
            Back to homepage
          </Link>
        </div>
      </CancelShell>
    );
  }

  // ── Step 1: What you'll lose ───────────────────────────────────────────────

  if (step === 1) {
    return (
      <CancelShell>
        <div className="max-w-lg mx-auto">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            Step 1 of 4
          </p>
          <h1 className="text-2xl font-bold mb-2">
            Are you sure you want to cancel?
          </h1>
          <p className="text-[#94a3b8] text-sm mb-8">
            You&apos;ll lose access to all TALLY tools when your billing period ends.
          </p>

          <div className="border border-[#1a1a1a] p-6 mb-8 space-y-3">
            <p className="text-xs text-[#475569] uppercase tracking-widest mb-4">
              What you&apos;ll lose
            </p>
            {LOSSES.map((loss) => (
              <div key={loss} className="flex items-start gap-3">
                <span className="text-[#f87171] text-sm mt-0.5">×</span>
                <p className="text-sm text-[#94a3b8]">{loss}</p>
              </div>
            ))}
          </div>

          {subLoading ? (
            <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mb-8" />
          ) : subInfo?.currentPeriodEnd ? (
            <p className="text-xs text-[#475569] mb-8">
              Your current billing period ends{" "}
              <span className="text-[#94a3b8]">{subInfo.currentPeriodEnd}</span>.
            </p>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
            >
              Keep my subscription
            </Link>
            <button
              onClick={() => setStep(2)}
              className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
            >
              Continue cancelling
            </button>
          </div>
        </div>
      </CancelShell>
    );
  }

  // ── Step 2: Reasons ────────────────────────────────────────────────────────

  if (step === 2) {
    return (
      <CancelShell>
        <div className="max-w-lg mx-auto">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            Step 2 of 4
          </p>
          <h1 className="text-2xl font-bold mb-2">Why are you cancelling?</h1>
          <p className="text-[#94a3b8] text-sm mb-8">
            Select all that apply. Your feedback helps us improve.
          </p>

          <div className="space-y-2 mb-6">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => toggleReason(r)}
                className={`w-full text-left text-sm px-4 py-3 border transition-colors ${
                  reasons.includes(r)
                    ? "border-white text-white bg-[#111]"
                    : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                }`}
              >
                <span className={`inline-block w-4 mr-3 text-center font-bold ${reasons.includes(r) ? "text-[#4ade80]" : "text-[#333]"}`}>
                  {reasons.includes(r) ? "✓" : "○"}
                </span>
                {r}
              </button>
            ))}
          </div>

          {reasons.includes("Other") && (
            <div className="mb-6">
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Tell us more..."
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
            >
              Keep my subscription
            </Link>
            <button
              onClick={() => {
                const offer = getRetentionOffer(reasons);
                setRetentionOffer(offer);
                setStep(3);
              }}
              disabled={reasons.length === 0}
              className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white disabled:opacity-30 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </CancelShell>
    );
  }

  // ── Step 3: Retention offer ────────────────────────────────────────────────

  if (step === 3) {
    return (
      <CancelShell>
        <div className="max-w-lg mx-auto">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            Step 3 of 4
          </p>

          {retentionDone ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-4">🎉</p>
              <h2 className="text-xl font-bold mb-3">
                {retentionOffer === "discount"
                  ? "50% off applied to your next invoice"
                  : "Subscription paused for 30 days"}
              </h2>
              <p className="text-[#94a3b8] text-sm mb-8">
                {retentionOffer === "discount"
                  ? "Your next charge will be $7. Full price resumes the following month."
                  : "Your subscription resumes automatically in 30 days. No charges until then."}
              </p>
              <Link
                href="/dashboard"
                className="inline-block text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
              >
                Back to dashboard
              </Link>
            </div>
          ) : retentionOffer === "discount" ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Before you go —</h1>
              <p className="text-[#94a3b8] text-sm mb-8">
                Stay for just <span className="text-white font-semibold">$7 this month</span>. One click to apply — no commitment, full price resumes after.
              </p>
              <div className="border border-[#fbbf24]/20 bg-[#fbbf24]/5 p-6 mb-6">
                <p className="text-lg font-bold mb-1">50% off next invoice</p>
                <p className="text-[#94a3b8] text-sm">$7 instead of $14 · Full price resumes next month</p>
              </div>
              {retentionError && <p className="text-[#f87171] text-xs mb-4">{retentionError}</p>}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <button
                  onClick={() => handleRetentionOffer("discount")}
                  disabled={retentionLoading}
                  className="flex-1 text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-50 transition-colors"
                >
                  {retentionLoading ? "Applying…" : "Apply 50% discount"}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
                >
                  No thanks, continue
                </button>
              </div>
              <Link href="/dashboard" className="block text-center text-xs text-[#475569] hover:text-[#94a3b8] transition-colors">
                Keep my subscription at full price
              </Link>
            </>
          ) : retentionOffer === "pause" ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Take a break instead</h1>
              <p className="text-[#94a3b8] text-sm mb-8">
                Pause your subscription for{" "}
                <span className="text-white font-semibold">30 days</span>. No charges, resumes automatically. Your data stays safe.
              </p>
              <div className="border border-[#60a5fa]/20 bg-[#60a5fa]/5 p-6 mb-6">
                <p className="text-lg font-bold mb-1">Pause for 30 days</p>
                <p className="text-[#94a3b8] text-sm">
                  No charges · Resumes automatically · Cancel anytime during pause
                </p>
              </div>
              {retentionError && <p className="text-[#f87171] text-xs mb-4">{retentionError}</p>}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <button
                  onClick={() => handleRetentionOffer("pause")}
                  disabled={retentionLoading}
                  className="flex-1 text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-50 transition-colors"
                >
                  {retentionLoading ? "Pausing…" : "Pause my subscription"}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
                >
                  No thanks, continue
                </button>
              </div>
              <Link href="/dashboard" className="block text-center text-xs text-[#475569] hover:text-[#94a3b8] transition-colors">
                Keep my subscription
              </Link>
            </>
          ) : retentionOffer === "feature" ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Tell us what&apos;s missing</h1>
              <p className="text-[#94a3b8] text-sm mb-8">
                We build based on feedback. What feature would make TALLY worth keeping?
              </p>
              <textarea
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                rows={4}
                placeholder="e.g. I need a way to schedule uploads, or bulk generate kits for multiple beats..."
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] resize-none transition-colors mb-6"
              />
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Link
                  href="/dashboard"
                  className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
                >
                  Keep my subscription
                </Link>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
                >
                  Still cancel
                </button>
              </div>
            </>
          ) : retentionOffer === "walkthrough" ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Let us show you how</h1>
              <p className="text-[#94a3b8] text-sm mb-8">
                Not seeing results yet? Book a free 15-minute walkthrough. We&apos;ll show you exactly how to get the most out of TALLY for your specific niche.
              </p>
              <div className="border border-[#a78bfa]/20 bg-[#a78bfa]/5 p-6 mb-6">
                <p className="text-lg font-bold mb-1">Free 15-min walkthrough</p>
                <p className="text-[#94a3b8] text-sm">
                  We&apos;ll walk through your channel data and show you what to focus on first.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <a
                  href="https://calendly.com/tallyshop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
                >
                  Book a walkthrough
                </a>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
                >
                  No thanks, continue
                </button>
              </div>
              <Link href="/dashboard" className="block text-center text-xs text-[#475569] hover:text-[#94a3b8] transition-colors">
                Keep my subscription
              </Link>
            </>
          ) : (
            // No retention offer matched — skip to step 4
            <>
              <h1 className="text-2xl font-bold mb-6">One last thing</h1>
              <p className="text-[#94a3b8] text-sm mb-8">
                We&apos;re sorry to see you go. Before you confirm, are you sure there&apos;s nothing we can do?
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/dashboard"
                  className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
                >
                  Keep my subscription
                </Link>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 text-sm text-[#94a3b8] border border-[#1a1a1a] px-6 py-3 hover:border-[#333] hover:text-white transition-colors"
                >
                  Confirm cancellation
                </button>
              </div>
            </>
          )}
        </div>
      </CancelShell>
    );
  }

  // ── Step 4: Final confirmation ─────────────────────────────────────────────

  return (
    <CancelShell>
      <div className="max-w-lg mx-auto">
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
          Step 4 of 4
        </p>
        <h1 className="text-2xl font-bold mb-2">Confirm cancellation</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Your subscription will be cancelled at the end of your current billing period. You won&apos;t be charged again.
        </p>

        {periodEnd && (
          <div className="border border-[#1a1a1a] p-4 mb-8">
            <p className="text-xs text-[#475569] mb-1">Access continues until</p>
            <p className="text-white font-semibold">{periodEnd}</p>
          </div>
        )}

        <p className="text-xs text-[#475569] mb-8">
          You can resubscribe anytime at{" "}
          <Link href="/pricing" className="text-white underline underline-offset-2">
            tallyagc.com/pricing
          </Link>
          .
        </p>

        {cancelError && (
          <p className="text-[#f87171] text-xs mb-4">{cancelError}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard"
            className="flex-1 text-center text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] transition-colors"
          >
            Keep my subscription
          </Link>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex-1 text-sm text-[#f87171] border border-[#f87171]/30 px-6 py-3 hover:border-[#f87171] hover:text-white disabled:opacity-40 transition-colors"
          >
            {cancelling ? "Cancelling…" : "Yes, cancel my subscription"}
          </button>
        </div>
      </div>
    </CancelShell>
  );
}

// ── Shell layout ───────────────────────────────────────────────────────────────

function CancelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
          <Link href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">{children}</main>
    </div>
  );
}
