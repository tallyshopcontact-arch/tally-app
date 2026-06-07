import Link from "next/link";
import {
  BarChart2,
  FileText,
  TrendingUp,
  Zap,
  Image,
  Calendar,
  Star,
} from "lucide-react";
import WaitlistForm from "./components/WaitlistForm";

const tools = [
  {
    icon: BarChart2,
    title: "Monthly Growth Report",
    desc: "Full channel analysis every month — what's working, what's not, and where your next opportunity is.",
    pro: false,
  },
  {
    icon: Zap,
    title: "Upload Kit Generator",
    desc: "AI-generated titles, tags, and descriptions crafted around each beat you upload.",
    pro: false,
  },
  {
    icon: TrendingUp,
    title: "Keyword Heat Map",
    desc: "Top 20 trending tags in your niche each month, ranked by search volume and competition.",
    pro: false,
  },
  {
    icon: Image,
    title: "Thumbnail Generator",
    desc: "On-brand thumbnail templates designed to stop the scroll.",
    pro: true,
  },
  {
    icon: Calendar,
    title: "Upload Scheduler",
    desc: "Best days and times to post in your niche, updated monthly based on real engagement data.",
    pro: true,
  },
  {
    icon: Star,
    title: "Channel Score",
    desc: "Track your growth score month over month — one number that tells you if you're improving.",
    pro: false,
  },
];

const pricingTiers = [
  {
    name: "Basic",
    price: "$9.99",
    period: "/mo",
    desc: "Start growing with the essentials.",
    features: ["Upload Kit Generator", "10 kits per month", "Cancel anytime"],
    cta: "Join the waitlist",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$19.99",
    period: "/mo",
    desc: "Everything you need to understand and act on your niche.",
    features: [
      "Unlimited Upload Kit Generator",
      "Monthly Growth Report",
      "Channel Score tracking",
      "Keyword Heat Map",
      "Cancel anytime",
    ],
    cta: "Join the waitlist",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$34.99",
    period: "/mo",
    desc: "The full toolkit for serious YouTube growth.",
    features: [
      "Everything in Growth",
      "Thumbnail Generator",
      "Upload Scheduler",
      "Priority support",
      "Cancel anytime",
    ],
    cta: "Join the waitlist",
    highlight: false,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-3xl font-bold tracking-[0.3em]">TALLY</span>
          <div className="flex items-center gap-6">
            <a
              href="#tools"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Tools
            </a>
            <a
              href="#membership"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Membership
            </a>
            <Link
              href="/privacy"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/login"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-24">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-8">
          YouTube Growth Intelligence for Music Producers
        </p>
        <h1 className="text-5xl md:text-[5.5rem] font-bold leading-[1.03] tracking-tight mb-8 max-w-4xl">
          Stop guessing.
          <br />
          Start growing.
        </h1>
        <p className="text-[#cbd5e1] text-lg leading-relaxed max-w-2xl mb-10">
          TALLY analyzes your YouTube channel and your niche every month, then
          delivers a full growth report — trending keywords, top performing
          videos in your genre, what to avoid, and a ready-to-use upload kit
          for your next beats.
        </p>
        <div className="flex items-center gap-6">
          <a
            href="#waitlist"
            className="inline-block bg-white text-black text-sm font-semibold px-7 py-3.5 hover:bg-[#e8e8e8] transition-colors"
          >
            Join the waitlist
          </a>
          <span className="text-[#94a3b8] text-sm">
            Free to join · Plans from $9.99/mo
          </span>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            See TALLY in action
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Your growth dashboard,
            <br />
            built for producers.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Channel Snapshot */}
            <div className="border border-[#1a1a1a] flex flex-col">
              <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a]">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-1">
                  Channel Snapshot
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  Your monthly stats at a glance
                </p>
              </div>
              <div className="p-5 flex-1 space-y-3">
                {[
                  { label: "Subscribers", value: "+1,240", change: "+12%" },
                  { label: "Views", value: "84,500", change: "+8%" },
                  { label: "Watch time", value: "3,120 hrs", change: "+5%" },
                  { label: "Avg. duration", value: "4:22", change: "+0.3" },
                ].map(({ label, value, change }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-[#64748b] text-xs">{label}</span>
                    <div className="text-right">
                      <span className="text-xs font-semibold">{value}</span>
                      <span className="text-[#22c55e] text-xs ml-1.5">
                        {change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Keyword Heat Map */}
            <div className="border border-[#1a1a1a] flex flex-col">
              <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a]">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-1">
                  Keyword Heat Map
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  Trending tags ranked by frequency
                </p>
              </div>
              <div className="p-5 flex-1 space-y-2.5">
                {[
                  { tag: "trap beats 2025", w: "90%" },
                  { tag: "lo-fi hip hop", w: "76%" },
                  { tag: "type beat free", w: "63%" },
                  { tag: "dark drill beats", w: "54%" },
                  { tag: "chill beats", w: "42%" },
                ].map(({ tag, w }) => (
                  <div key={tag}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[#94a3b8] text-xs">{tag}</span>
                    </div>
                    <div className="h-1 bg-[#1a1a1a] rounded-full">
                      <div
                        className="h-1 bg-[#64748b] rounded-full"
                        style={{ width: w }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Plan */}
            <div className="border border-[#1a1a1a] flex flex-col">
              <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a]">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-1">
                  Action Plan
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  7 priorities ranked by impact
                </p>
              </div>
              <div className="p-5 flex-1 space-y-3">
                {[
                  "Upload 2x/week for 30 days",
                  "Add timestamps to all videos",
                  'Target "trap type beat 2025"',
                  "Optimize 3 underperforming thumbnails",
                  "Post Friday 6–8pm EST",
                ].map((item, i) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <span className="text-[#334155] text-xs font-bold mt-px shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[#94a3b8] text-xs leading-snug">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upload Kit */}
            <div className="border border-[#1a1a1a] flex flex-col">
              <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a]">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-1">
                  Upload Kit
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  Ready to copy and paste into YouTube
                </p>
              </div>
              <div className="p-5 flex-1 space-y-3">
                <div>
                  <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">
                    Title
                  </p>
                  <p className="text-xs leading-snug">
                    Dark Trap Type Beat 2025 "Phantom" | Free
                  </p>
                </div>
                <div>
                  <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">
                    Tags
                  </p>
                  <p className="text-[#94a3b8] text-xs leading-snug">
                    trap beat, dark type beat, free beat 2025, drill…
                  </p>
                </div>
                <div>
                  <p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">
                    Description
                  </p>
                  <p className="text-[#94a3b8] text-xs leading-snug line-clamp-3">
                    Dark trap type beat produced by [Your Name]. Free to use
                    with credit. Contact for licensing…
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section id="tools" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Tools
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Everything you need
            <br />
            to grow on YouTube.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1a1a1a]">
            {tools.map(({ icon: Icon, title, desc, pro }) => (
              <div key={title} className="bg-[#0a0a0a] p-8 relative">
                {pro && (
                  <span className="absolute top-5 right-5 text-[10px] font-semibold tracking-[0.15em] uppercase text-[#64748b] border border-[#1e1e1e] px-2 py-0.5">
                    Pro
                  </span>
                )}
                <Icon
                  className="w-4 h-4 text-[#64748b] mb-6"
                  strokeWidth={1.5}
                />
                <h3 className="text-sm font-semibold mb-3">{title}</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Membership / Pricing */}
      <section id="membership" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Membership
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Pick the plan
            <br />
            that fits your grind.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a1a1a]">
            {pricingTiers.map(
              ({ name, price, period, desc, features, cta, highlight }) => (
                <div
                  key={name}
                  className={`p-8 flex flex-col ${
                    highlight ? "bg-[#0f0f0f]" : "bg-[#0a0a0a]"
                  }`}
                >
                  {highlight && (
                    <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#94a3b8] mb-4">
                      Most popular
                    </p>
                  )}
                  <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-4">
                    {name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold tracking-tight">
                      {price}
                    </span>
                    <span className="text-[#94a3b8] text-sm">{period}</span>
                  </div>
                  <p className="text-[#64748b] text-xs mb-8">{desc}</p>
                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-sm text-[#94a3b8]"
                      >
                        <span className="text-[#64748b] mt-px leading-none shrink-0">
                          —
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#waitlist"
                    className={`block text-center text-sm font-semibold py-3.5 transition-colors ${
                      highlight
                        ? "bg-white text-black hover:bg-[#e8e8e8]"
                        : "border border-[#2a2a2a] text-white hover:border-[#444]"
                    }`}
                  >
                    {cta}
                  </a>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-6">
                Early access
              </p>
              <h2 className="text-3xl font-bold mb-4">
                Get notified
                <br />
                when we launch.
              </h2>
              <p className="text-[#94a3b8] text-sm leading-relaxed">
                We&apos;re onboarding producers in batches. Join the waitlist
                and we&apos;ll reach out when your spot opens. No spam — just
                one email when it&apos;s your turn.
              </p>
            </div>
            <div>
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-[#64748b] text-xs">
              © 2026 TALLY. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
