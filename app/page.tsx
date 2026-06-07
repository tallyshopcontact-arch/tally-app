import Link from "next/link";
import { BarChart2, FileText, TrendingUp, Zap } from "lucide-react";
import WaitlistForm from "./components/WaitlistForm";

const reportFeatures = [
  {
    icon: TrendingUp,
    title: "Trending Keywords",
    desc: "Exactly what your potential fans are searching for right now — in your genre, this month.",
  },
  {
    icon: BarChart2,
    title: "Top Performing Videos",
    desc: "The highest-growth videos in your niche, analyzed so you know what format and style is winning.",
  },
  {
    icon: Zap,
    title: "What to Avoid",
    desc: "Oversaturated topics and dying trends. Don't waste an upload on content that's already peaked.",
  },
  {
    icon: FileText,
    title: "Upload Kit",
    desc: "Ready-to-use title, description, tags, and thumbnail concept — built around your next beat.",
  },
];

const pricingFeatures = [
  "Monthly YouTube growth report",
  "Trending keyword analysis for your genre",
  "Niche competitor tracking",
  "What-to-avoid insights",
  "Ready-to-use upload kit",
  "Cancel anytime",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold tracking-[0.25em]">TALLY</span>
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <a
              href="#waitlist"
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Join waitlist →
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-24">
        <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-8">
          YouTube Growth Intelligence for Music Producers
        </p>
        <h1 className="text-5xl md:text-[5.5rem] font-bold leading-[1.03] tracking-tight mb-8 max-w-4xl">
          Know exactly what to
          <br />
          upload next.
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
            Free to join · $29/mo at launch
          </span>
        </div>
      </section>

      {/* Report features grid */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-12">
            What&apos;s in every monthly report
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#1a1a1a]">
            {reportFeatures.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-[#0a0a0a] p-8">
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

      {/* How it works */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-12">
            How it works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Connect your channel",
                desc: "Link your YouTube channel when you sign up. That's it.",
              },
              {
                step: "02",
                title: "We analyze your niche",
                desc: "Every month, we scan your genre for what's trending, what's saturated, and what's working.",
              },
              {
                step: "03",
                title: "Get your report",
                desc: "A full growth report lands in your inbox on the 1st — ready to act on immediately.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step}>
                <p className="text-[#1e1e1e] text-6xl font-bold mb-4">
                  {step}
                </p>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-12">
            Pricing
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-4">
                One plan.
                <br />
                Everything included.
              </h2>
              <p className="text-[#94a3b8] text-sm leading-relaxed max-w-xs">
                No tiers, no add-ons, no upsells. One monthly report that gives
                you everything you need to grow.
              </p>
            </div>
            <div className="border border-[#1a1a1a] p-8">
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-6xl font-bold tracking-tight">$29</span>
                <span className="text-[#94a3b8] text-sm">/month</span>
              </div>
              <p className="text-[#94a3b8] text-xs mb-8">
                Billed monthly. Cancel anytime.
              </p>
              <ul className="space-y-3 mb-8">
                {pricingFeatures.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-[#94a3b8]"
                  >
                    <span className="text-[#64748b] mt-px leading-none">—</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className="block text-center bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors"
              >
                Join the waitlist
              </a>
            </div>
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
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <span className="text-sm font-bold tracking-[0.25em]">TALLY</span>
          <p className="text-[#64748b] text-xs">
            © 2025 TALLY. Built for serious music producers.
          </p>
        </div>
      </footer>
    </main>
  );
}
