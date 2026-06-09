"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";

const features = [
  "Upload Kit Generator — unlimited",
  "Title Tester — unlimited",
  "Keyword Heat Map — top 20 niche keywords",
  "Monthly Report — full channel analysis",
  "Action Plan — 7 monthly priorities",
  "Competitor Tracker — track up to 5 channels",
  "TALLY Score — monthly growth health score",
  "Growth Forecast — 90-day projection",
];

const faqs = [
  {
    q: "What is TALLY?",
    a: "TALLY is a YouTube packaging tool for beat producers. It analyzes your channel and niche, then gives you optimized titles, descriptions, tags, and thumbnails for every upload.",
  },
  {
    q: "What's included in the 7-day free trial?",
    a: "Full access to all 7 tools — no credit card required upfront. You can cancel before the trial ends and you won't be charged.",
  },
  {
    q: "Do I need a YouTube channel to use TALLY?",
    a: "Yes. TALLY pulls data from your channel to generate personalized recommendations based on your niche, genre, and top artists.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing portal in Settings at any time. No contracts, no commitments.",
  },
  {
    q: "Is TALLY only for beat producers?",
    a: "TALLY is built specifically for YouTube beat producers. If you upload type beats, TALLY will give you better upload positioning than any generic SEO tool.",
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (e) {
      console.error("Checkout error:", e);
      setLoading(false);
    }
  };

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
            One plan. Every tool.
          </h1>
          <p className="text-[#94a3b8] text-base max-w-md mx-auto">
            Everything you need to position every beat for maximum YouTube discovery.
          </p>
        </div>

        {/* Plan card */}
        <div className="border border-white/20 p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold mb-1">TALLY Pro</h2>
              <p className="text-[#94a3b8] text-sm">All 7 tools. Unlimited uses. One price.</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold">$19.99</p>
              <p className="text-xs text-[#94a3b8]">per month</p>
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

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full bg-white text-black text-sm font-bold py-4 hover:bg-white/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Redirecting…" : "Start 7-Day Free Trial"}
          </button>
          <p className="text-center text-xs text-[#475569] mt-3">
            No credit card required for trial. Cancel anytime.
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
