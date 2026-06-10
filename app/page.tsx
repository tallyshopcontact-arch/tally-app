import Link from "next/link";
import {
  BarChart2,
  TrendingUp,
  Zap,
  Star,
  Type,
  Users,
  LineChart,
} from "lucide-react";
import GenreTags from "./components/GenreTags";
import FoundingBanner from "@/components/FoundingBanner";

const tools = [
  {
    icon: Zap,
    title: "Upload Kit Generator",
    desc: "Paste your beat details. Get an optimized title, description, tags, and thumbnail concept built from real niche data — in seconds.",
    pro: false,
    featured: true,
  },
  {
    icon: Type,
    title: "Title Tester",
    desc: "Score your YouTube title for SEO strength, keyword relevance, and click-through potential. Get 2 rewritten versions that outperform.",
    pro: false,
    featured: false,
  },
  {
    icon: TrendingUp,
    title: "Keyword Heat Map",
    desc: "Top 20 trending tags in your niche each month, ranked by frequency. Know exactly what to include in your titles and tags.",
    pro: false,
    featured: false,
  },
  {
    icon: BarChart2,
    title: "Action Plan",
    desc: "Prioritized steps to grow your channel this month — based on your data, not generic advice. High, Medium, Low priority.",
    pro: false,
    featured: false,
  },
  {
    icon: Users,
    title: "Competitor Tracker",
    desc: "Track up to 5 competitor YouTube channels. See their views, top videos, most-used tags, and how they compare to you.",
    pro: false,
    featured: false,
  },
  {
    icon: Star,
    title: "TALLY Score",
    desc: "Your monthly channel performance score — one number built from upload consistency, keyword strength, engagement and more.",
    pro: false,
    featured: false,
  },
  {
    icon: LineChart,
    title: "Growth Forecast",
    desc: "Unlocks after 3 months of TALLY data. See your projected views and subscriber trajectory — baseline vs optimized.",
    pro: true,
    featured: false,
  },
];


const faqs = [
  {
    q: "Does this work for my genre?",
    a: "Yes. TALLY works for any beat-making genre on YouTube — boom bap, trap, drill, lo-fi, afrobeats and more. Your report is always specific to your niche.",
  },
  {
    q: "How do you get my YouTube data?",
    a: "We use the official YouTube Data API — the same technology used by major analytics platforms. We only access public data from your channel.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no commitments. Cancel from your dashboard anytime and you won't be charged again.",
  },
  {
    q: "When do I get my first report?",
    a: "Your first report is delivered within 48 hours of signing up. After that, reports are delivered on the 1st of every month.",
  },
  {
    q: "Is my channel data safe?",
    a: "Yes. We never share or sell your data. We only use it to generate your report. Full details in our Privacy Policy.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <FoundingBanner />

      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-3xl font-bold tracking-[0.3em]">TALLY</span>
          <div className="flex items-center gap-6">
            <a href="#tools" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Tools</a>
            <a href="#membership" className="text-sm text-[#94a3b8] hover:text-white transition-colors hidden md:block">Pricing</a>
            <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Log in</Link>
            <Link href="/pricing" className="text-sm bg-white text-black font-semibold px-4 py-2 hover:bg-[#e8e8e8] transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="hero-bg-gradient absolute inset-0" aria-hidden="true" />
        {/* Dot matrix overlay */}
        <div className="hero-bg-dots absolute inset-0" aria-hidden="true" />
        {/* Glowing orbs */}
        <div
          className="hero-orb-1 absolute -top-24 -right-24 w-[560px] h-[560px] rounded-full bg-[#1e0850] blur-[140px] opacity-40 pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="hero-orb-2 absolute -bottom-16 -left-20 w-[440px] h-[440px] rounded-full bg-[#2a0a40] blur-[120px] opacity-30 pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="hero-orb-3 absolute top-[35%] right-[22%] w-[320px] h-[320px] rounded-full bg-[#06153a] blur-[100px] pointer-events-none"
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-12">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-6">
            YouTube Growth Intelligence for Music Producers
          </p>
          <h1 className="text-5xl md:text-[5rem] font-bold leading-[1.05] tracking-tight mb-6 max-w-3xl">
            Generate your perfect YouTube package in seconds.
          </h1>
          <p className="text-[#cbd5e1] text-lg leading-relaxed max-w-2xl mb-8">
            Paste in your beat details. TALLY gives you an optimized title, description, tags, and thumbnail ideas based on what&apos;s actually working in your niche right now.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-10">
            <Link
              href="/pricing"
              className="inline-block bg-white text-black text-sm font-semibold px-7 py-3.5 hover:bg-[#e8e8e8] transition-colors"
            >
              Start 7-Day Free Trial
            </Link>
            <Link href="/login" className="text-[#94a3b8] text-sm hover:text-white transition-colors">
              Already a member? Log in →
            </Link>
          </div>


          {/* Product mockup */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1a1a1a] border border-[#1a1a1a]">
            {/* Left — Input form mockup */}
            <div className="bg-[#0d0d0d] p-6 space-y-4">
              <p className="text-[#475569] text-[10px] uppercase tracking-widest mb-4">Beat Details</p>
              <div className="space-y-3">
                <div>
                  <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-1">Beat Name</p>
                  <div className="border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-xs text-[#475569]">&ldquo;Phantom&rdquo;</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-1">Genre</p>
                    <div className="border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-xs text-[#475569]">Trap</div>
                  </div>
                  <div>
                    <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-1">Vibe</p>
                    <div className="flex gap-1 flex-wrap">
                      {["Dark", "Hard", "Cinematic"].map((v) => (
                        <span key={v} className="text-[9px] border border-[#333] text-[#94a3b8] px-2 py-0.5">{v}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-1">Sounds Like</p>
                  <div className="border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-xs text-[#475569]">Travis Scott, Future, Metro Boomin</div>
                </div>
              </div>
              <div className="bg-white text-black text-[10px] font-bold text-center py-2 mt-2">
                Generate My Upload Kit →
              </div>
            </div>

            {/* Right — Output mockup */}
            <div className="bg-[#0a0a0a] p-6 space-y-4">
              <p className="text-[#475569] text-[10px] uppercase tracking-widest mb-4">Generated Kit</p>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest">Best Title</p>
                  <span className="text-[8px] text-[#4ade80] border border-[#1a3a1a] px-1.5 py-0.5">Best pick</span>
                </div>
                <p className="text-white text-xs font-medium leading-snug">&ldquo;Phantom&rdquo; | Travis Scott Type Beat 2026 | Dark Trap</p>
              </div>
              <div>
                <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-1">Description Preview</p>
                <p className="text-[#475569] text-[10px] leading-relaxed line-clamp-3">
                  &ldquo;Phantom&rdquo; is a dark, cinematic trap instrumental produced in the style of Travis Scott and Metro Boomin. Hard 808s, eerie melodies, and punchy hi-hats...
                </p>
              </div>
              <div>
                <p className="text-[#2a2a2a] text-[10px] uppercase tracking-widest mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {["travis scott type beat", "dark trap beat 2026", "free trap beat", "type beat", "cinematic trap"].map((t) => (
                    <span key={t} className="text-[8px] bg-[#0d0d0d] border border-[#1a1a1a] text-[#475569] px-2 py-0.5">{t}</span>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#1a1a1a] pt-3 flex items-center gap-2">
                <span className="text-[#fbbf24] text-[10px]">💡</span>
                <p className="text-[#475569] text-[10px] leading-relaxed">Tip: Post Friday 6–8pm EST — peak search time for your niche</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Genre tags */}
      <section className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#64748b] font-medium tracking-[0.15em] uppercase mb-4">
            Works for your genre
          </p>
          <GenreTags />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Up and running
            <br />
            in minutes.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a1a1a]">
            {[
              {
                step: "01",
                title: "Connect your channel",
                desc: "Paste your YouTube link and tell us your genre and top artists you make beats in the style of.",
              },
              {
                step: "02",
                title: "We analyze your niche",
                desc: "TALLY pulls real data from YouTube every month and compares your channel to top performers in your genre.",
              },
              {
                step: "03",
                title: "Get your report and kit",
                desc: "Receive your full growth report plus ready-to-use upload kits for your next beats — delivered on the 1st.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-[#0a0a0a] p-8">
                <p className="text-[#1e2a3a] text-6xl font-bold mb-6 leading-none">
                  {step}
                </p>
                <h3 className="font-semibold mb-3">{title}</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
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
                    Dark Trap Type Beat 2025 &ldquo;Phantom&rdquo; | Free
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
            {tools.map(({ icon: Icon, title, desc, pro, featured }) => (
              <div key={title} className={`p-8 relative ${featured ? "bg-[#0d0d0d]" : "bg-[#0a0a0a]"}`}>
                {featured && (
                  <span className="absolute top-5 right-5 text-[10px] font-semibold tracking-[0.15em] uppercase text-[#4ade80] border border-[#1a3a1a] bg-[#0a1a0a] px-2 py-0.5">
                    New
                  </span>
                )}
                {pro && !featured && (
                  <span className="absolute top-5 right-5 text-[10px] font-semibold tracking-[0.15em] uppercase text-[#64748b] border border-[#1e1e1e] px-2 py-0.5">
                    Pro
                  </span>
                )}
                <Icon className={`w-4 h-4 mb-6 ${featured ? "text-[#4ade80]" : "text-[#64748b]"}`} strokeWidth={1.5} />
                <h3 className="text-sm font-semibold mb-3">{title}</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="membership" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Pricing
          </p>
          <h2 className="text-3xl font-bold mb-12">
            One plan.
            <br />
            Every tool.
          </h2>
          <div className="max-w-md">
            <div className="border border-white/20 p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-1">TALLY Pro</p>
                  <p className="text-[#64748b] text-xs">All 7 tools. Unlimited uses.</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-4xl font-bold tracking-tight">$19.99</span>
                  <span className="text-[#94a3b8] text-sm">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "Upload Kit Generator — unlimited",
                  "Title Tester — unlimited",
                  "Keyword Heat Map",
                  "Monthly Report + Action Plan",
                  "Competitor Tracker — 5 channels",
                  "TALLY Score + history",
                  "Growth Forecast",
                  "Cancel anytime",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <span className="text-[#4ade80] mt-px leading-none shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="block text-center bg-white text-black text-sm font-bold py-4 hover:bg-[#e8e8e8] transition-colors"
              >
                Start 7-Day Free Trial
              </Link>
              <p className="text-center text-xs text-[#475569] mt-3">
                No credit card required. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Start packaging your beats
            <br />
            for maximum discovery.
          </h2>
          <p className="text-[#94a3b8] text-sm mb-8 max-w-md mx-auto">
            7-day free trial. No credit card required. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/pricing"
              className="bg-white text-black text-sm font-bold px-8 py-4 hover:bg-[#e8e8e8] transition-colors"
            >
              Start Free Trial
            </Link>
            <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Already have an account? Log in →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            FAQ
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Common questions,
            <br />
            straight answers.
          </h2>
          <div className="divide-y divide-[#1a1a1a]">
            {faqs.map(({ q, a }) => (
              <div
                key={q}
                className="py-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-16"
              >
                <p className="text-sm font-semibold">{q}</p>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{a}</p>
              </div>
            ))}
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
