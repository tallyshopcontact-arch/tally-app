import Link from "next/link";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Basic",
    price: "$9.99",
    period: "/mo",
    desc: "Start growing with the essentials.",
    features: [
      "Upload kit generator (10 kits/month)",
      "Keyword heat map",
      "Trending videos in your niche",
      "Public channel stats",
      "Cancel anytime",
    ],
    highlight: false,
    cta: "Get started",
  },
  {
    name: "Growth",
    price: "$19.99",
    period: "/mo",
    desc: "Everything you need to understand and act on your niche.",
    features: [
      "Everything in Basic",
      "Unlimited upload kits",
      "Full monthly report (all 10 sections)",
      "Channel score tracking",
      "Rising artists section",
      "Action plan",
      "What to avoid section",
      "Cancel anytime",
    ],
    highlight: true,
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$34.99",
    period: "/mo",
    desc: "The full toolkit for serious YouTube growth.",
    features: [
      "Everything in Growth",
      "Google Analytics connection (watch time, monthly subscriber gains, audience data)",
      "Thumbnail generator",
      "Upload scheduler",
      "Priority support",
      "Cancel anytime",
    ],
    highlight: false,
    cta: "Get started",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-[0.25em] hover:text-[#94a3b8] transition-colors">
            TALLY
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/#membership" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Plans
            </Link>
            <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Login
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-white text-black px-4 py-2 hover:bg-[#e8e8e8] transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-20">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
          Membership
        </p>
        <h1 className="text-4xl font-bold mb-3">
          Pick the plan
          <br />
          that fits your grind.
        </h1>
        <p className="text-[#94a3b8] text-sm mb-14 max-w-lg">
          All plans include a 30-day free trial. No card required to start.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a1a1a]">
          {tiers.map(({ name, price, period, desc, features, highlight, cta }) => (
            <div
              key={name}
              className={`p-8 flex flex-col ${highlight ? "bg-[#0f0f0f]" : "bg-[#0a0a0a]"}`}
            >
              {highlight && (
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#94a3b8] mb-4">
                  Most popular
                </p>
              )}
              <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-4">{name}</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold tracking-tight">{price}</span>
                <span className="text-[#94a3b8] text-sm">{period}</span>
              </div>
              <p className="text-[#64748b] text-xs mb-8">{desc}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {features.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <Check className="w-3.5 h-3.5 text-[#4ade80] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`block text-center text-xs font-semibold py-3.5 transition-colors ${
                  highlight
                    ? "bg-white text-black hover:bg-[#e8e8e8]"
                    : "border border-[#2a2a2a] text-white hover:border-[#444]"
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[#475569] mt-8">
          All plans billed monthly. Cancel anytime from your dashboard.
        </p>
      </section>

      <footer className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors">
              Terms of Service
            </Link>
            <span className="text-[#64748b] text-xs">© 2026 TALLY. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
