"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";

const features = [
  "Unlimited Upload Kits",
  "Both lanes, full detail, every time",
  "Co-mentions & adjacent-lane data",
  "5 titles + regenerate",
  "Priority processing — no wait",
  "Full check history",
  "1 free Channel Diagnostic still included",
];

const faqs = [
  {
    q: "What is TALLY?",
    a: "TALLY tells you which artists to attach your next beat to, how to title it, and which lanes small channels are actually winning right now — based on real YouTube data, not guesswork.",
  },
  {
    q: "What's included in the 14-day free trial?",
    a: "Full Pro access — unlimited Upload Kits, both lanes every time, 5 titles with regenerate, and your full check history. No credit card required upfront, and you can cancel before the trial ends without being charged.",
  },
  {
    q: "Do I need a YouTube channel to use TALLY?",
    a: "No — Upload Kit works from just the beat name, artists, and genre you give it. Connecting your channel unlocks personalized winnability for your subscriber range.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing portal in Settings at any time. No contracts, no commitments.",
  },
  {
    q: "Is TALLY only for beat producers?",
    a: "TALLY is built specifically for YouTube type-beat producers. If you upload beats targeting specific artists, TALLY tells you which lanes are worth your next upload.",
  },
];

export default function PricingPage() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [checkError, setCheckError] = useState("");

  // Promo code
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoError, setPromoError] = useState("");

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    setPromoError("");
    setPromoMessage("");
    if (!code) return;

    if (code === "FOUNDING20") {
      setAppliedPromo(code);
      setPromoMessage(
        "Founding member offer applied — $11.20/month locked for life (20% off with FOUNDING20)."
      );
    } else {
      // Pass unknown codes through to Stripe; it will validate
      setAppliedPromo(code);
      setPromoMessage(`Code "${code}" will be applied at checkout.`);
    }
    setPromoInput("");
  };

  const handleCheckout = async () => {
    setLoading(true);
    setCheckError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ...(appliedPromo ? { promoCode: appliedPromo } : {}) }),
      });

      if (res.status === 401) {
        if (appliedPromo) {
          try { localStorage.setItem("tally_promo_code", appliedPromo); } catch { /* ignore */ }
          window.location.href = `/signup?promo=${encodeURIComponent(appliedPromo)}`;
        } else {
          window.location.href = "/signup";
        }
        return;
      }

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      console.error("[pricing] checkout error:", e);
      setCheckError("Something went wrong starting checkout. Please try again.");
      setLoading(false);
    }
  };

  const isFoundingMember = appliedPromo === "FOUNDING20";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Log in
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Pricing</p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight">
            Free to start. $14/month for everything.
          </h1>
          <p className="text-[#94a3b8] text-base max-w-md mx-auto">
            Which artists to target, how to title it, and who&apos;s winning that lane right now.
          </p>
        </div>

        {/* Founding member banner (inline) */}
        {isFoundingMember && (
          <div className="border border-[#4ade80]/20 bg-[#4ade80]/5 px-4 py-3 mb-6 flex items-start gap-3">
            <span className="text-[#4ade80] text-lg leading-none">✓</span>
            <div>
              <p className="text-sm font-semibold text-[#4ade80] mb-0.5">
                Founding member offer applied
              </p>
              <p className="text-xs text-[#94a3b8]">
                No credit card required · $11.20/month locked for life (20% off with FOUNDING20)
              </p>
            </div>
          </div>
        )}

        {/* Monthly / yearly toggle */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <button
            onClick={() => setPlan("monthly")}
            className={`text-xs font-semibold px-4 py-2 border transition-colors cursor-pointer ${
              plan === "monthly" ? "border-[#e8833a] text-white" : "border-[#1e1e1e] text-[#94a3b8] hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPlan("yearly")}
            className={`text-xs font-semibold px-4 py-2 border transition-colors cursor-pointer flex items-center gap-2 ${
              plan === "yearly" ? "border-[#e8833a] text-white" : "border-[#1e1e1e] text-[#94a3b8] hover:text-white"
            }`}
          >
            Yearly
            <span className="text-[#4ade80] text-[10px]">Save 41%</span>
          </button>
        </div>

        {/* Plan card */}
        <div className="border border-white/20 p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold mb-1">TALLY Pro</h2>
              <p className="text-[#94a3b8] text-sm">Unlimited. Every lane, every time.</p>
            </div>
            <div className="text-right shrink-0">
              {isFoundingMember && plan === "monthly" ? (
                <>
                  <p className="text-xs text-[#475569] line-through">$14</p>
                  <p className="text-3xl font-bold text-[#4ade80]">$11.20</p>
                </>
              ) : (
                <p className="text-3xl font-bold">{plan === "yearly" ? "$99" : "$14"}</p>
              )}
              <p className="text-xs text-[#94a3b8]">{plan === "yearly" ? "per year" : "per month"}</p>
            </div>
          </div>

          <ul className="space-y-3 mb-8">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Check className="w-4 h-4 text-[#4ade80] mt-0.5 shrink-0" />
                <span className="text-white/80">{f}</span>
              </li>
            ))}
          </ul>

          {/* Promo code input */}
          {!appliedPromo ? (
            <div className="mb-6">
              <p className="text-xs text-[#475569] mb-2">Have a promo code?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value);
                    setPromoError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                  placeholder="FOUNDING20"
                  className="flex-1 bg-[#111] border border-[#1e1e1e] px-3 py-2 text-sm text-white placeholder:text-[#333] focus:outline-none focus:border-[#3a3a3a] transition-colors"
                />
                <button
                  onClick={handleApplyPromo}
                  disabled={!promoInput.trim()}
                  className="text-xs font-semibold border border-[#1e1e1e] px-4 py-2 text-[#94a3b8] hover:text-white hover:border-[#333] disabled:opacity-30 transition-colors"
                >
                  Apply
                </button>
              </div>
              {promoError && <p className="text-[#f87171] text-xs mt-2">{promoError}</p>}
            </div>
          ) : (
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xs text-[#4ade80]">{promoMessage}</p>
              <button
                onClick={() => {
                  setAppliedPromo(null);
                  setPromoMessage("");
                }}
                className="text-xs text-[#475569] hover:text-[#94a3b8] ml-4 transition-colors"
              >
                Remove
              </button>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full text-[#0a0a0a] text-sm font-bold py-4 hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#e8833a" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading
              ? "Redirecting…"
              : isFoundingMember
              ? "Claim Founding Member Offer"
              : "Start 14-Day Free Trial"}
          </button>
          {checkError && (
            <p className="text-[#f87171] text-xs mt-3 text-center">{checkError}</p>
          )}
          <p className="text-center text-xs text-[#475569] mt-3">
            {isFoundingMember
              ? "No credit card required. $11.20/month after (20% off with FOUNDING20)."
              : "No credit card required for trial. Cancel anytime."}
          </p>
        </div>

        <p className="text-center text-xs text-[#475569] mb-20">
          Already have an account?{" "}
          <Link href="/login" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
            Log in
          </Link>
        </p>

        {/* FAQs */}
        <div className="border-t border-[#1a1a1a] pt-16">
          <h2 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-8">FAQ</h2>
          <div className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <p className="text-sm font-semibold mb-2">{faq.q}</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#475569]">
          <span className="font-bold tracking-[0.25em] text-white/40">TALLY</span>
          <span>© 2026 TALLY. Built for beat producers.</span>
          <Link href="mailto:tallyshop.contact@gmail.com" className="hover:text-white transition-colors">
            tallyshop.contact@gmail.com
          </Link>
        </div>
      </footer>
    </div>
  );
}
