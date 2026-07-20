import Link from "next/link";
import GenreTags from "./components/GenreTags";
import FoundingBanner from "@/components/FoundingBanner";
import ScoreMeter from "./lane-check/components/ScoreMeter";
import StatusBadge from "./lane-check/components/StatusBadge";

const steps = [
  {
    step: "01",
    title: "Describe your beat",
    desc: "Up to 3 artists it sounds like, plus your genre. Takes about 10 seconds.",
  },
  {
    step: "02",
    title: "We analyze what's winning",
    desc: "Real YouTube data on demand, competition, and who's actually breaking through in that lane right now.",
  },
  {
    step: "03",
    title: "You upload with confidence",
    desc: "Know which artists to target and how to title it before you ever hit publish.",
  },
];

const faqs = [
  {
    q: "Does this work for my genre?",
    a: "Yes. TALLY works for any beat-making genre on YouTube — boom bap, trap, drill, lo-fi, afrobeats and more. Your lane check is always specific to the artists and genre you give it.",
  },
  {
    q: "How do you get this data?",
    a: "We use the official YouTube Data API — the same technology used by major analytics platforms. We only analyze public video and channel data.",
  },
  {
    q: "How fast are my results?",
    a: "Cached lanes are instant. A brand-new lane usually finishes within a few hours on the free plan — paid members' lanes run immediately, no wait.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no commitments. Cancel from your dashboard anytime and you won't be charged again.",
  },
  {
    q: "Is my channel data safe?",
    a: "Yes. We never share or sell your data. We only use it to generate your results. Full details in our Privacy Policy.",
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
            <a href="#how-it-works" className="text-sm text-[#94a3b8] hover:text-white transition-colors hidden md:block">How it works</a>
            <a href="#pricing" className="text-sm text-[#94a3b8] hover:text-white transition-colors hidden md:block">Pricing</a>
            <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Log in</Link>
            <Link
              href="/lane-check"
              className="text-sm text-[#0a0a0a] font-semibold px-4 py-2 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Check my lanes — free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-bg-gradient absolute inset-0" aria-hidden="true" />
        <div className="hero-bg-dots absolute inset-0" aria-hidden="true" />
        <div className="hero-orb-1 absolute -top-24 -right-24 w-[560px] h-[560px] rounded-full bg-[#1e0850] blur-[140px] opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="hero-orb-2 absolute -bottom-16 -left-20 w-[440px] h-[440px] rounded-full bg-[#2a0a40] blur-[120px] opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="hero-orb-3 absolute top-[35%] right-[22%] w-[320px] h-[320px] rounded-full bg-[#06153a] blur-[100px] pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-20">
          <h1 className="font-[family-name:var(--font-display)] font-bold text-5xl md:text-[4.5rem] leading-[1.05] tracking-tight mb-6 max-w-3xl">
            You just finished the beat. Now what?
          </h1>
          <p className="text-[#cbd5e1] text-lg leading-relaxed max-w-2xl mb-8">
            Tell us what it sounds like. We&apos;ll tell you which artists to attach it to, how to
            title it, and which lanes small channels are actually winning right now.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/lane-check"
              className="inline-block text-[#0a0a0a] text-sm font-semibold px-7 py-3.5 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Check my lanes — free
            </Link>
            <Link href="/diagnostic" className="text-[#94a3b8] text-sm hover:text-white transition-colors">
              Scan my channel →
            </Link>
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
      <section id="how-it-works" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl font-bold mb-12">
            From idea
            <br />
            to informed upload.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a1a1a]">
            {steps.map(({ step, title, desc }) => (
              <div key={step} className="bg-[#0a0a0a] p-8">
                <p className="text-[#1e2a3a] text-6xl font-bold mb-6 leading-none">{step}</p>
                <h3 className="font-semibold mb-3">{title}</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example lane card */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-4">
            See it in action
          </p>
          <h2 className="text-3xl font-bold mb-4">
            Every lane, scored
            <br />
            on real numbers.
          </h2>
          <p className="text-[#94a3b8] text-sm mb-10 max-w-xl">
            Demand, competition, and how winnable it is for a channel your size — no guessing.
          </p>
          <div className="max-w-md border border-[#1a1a1a] bg-[#0d0d0d] p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Alchemist</p>
              <span className="text-[9px] text-[#64748b] border border-[#2a2a2a] px-1.5 py-0.5 uppercase tracking-widest">Example</span>
            </div>
            <div className="mb-4">
              <ScoreMeter score={69} size="sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <StatusBadge status="green" />
              <span className="text-[#94a3b8] text-sm">55% of the top 20 videos in this lane come from small channels.</span>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#1a1a1a] text-sm">
              <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Demand</p><p className="font-semibold">71</p></div>
              <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Saturation</p><p className="font-semibold">82</p></div>
              <div><p className="text-[#64748b] text-[10px] uppercase tracking-widest mb-1">Winnability</p><p className="font-semibold">55</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4">
            Pricing
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Free to start.
            <br />
            $14/month for everything.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
            <div className="border border-[#1a1a1a] p-8">
              <div className="mb-6">
                <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-1">Free</p>
                <span className="text-4xl font-bold tracking-tight">$0</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "1 free Lane Check per month",
                  "Top lane fully revealed",
                  "1 free Channel Diagnostic",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <span className="text-[#4ade80] mt-px leading-none shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/lane-check"
                className="block text-center border border-[#2a2a2a] text-white text-sm font-semibold py-3.5 hover:border-[#3a3a3a] transition-colors"
              >
                Check my lanes — free
              </Link>
            </div>

            <div className="border border-white/20 p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm font-semibold tracking-[0.1em] uppercase mb-1">TALLY Pro</p>
                  <p className="text-[#64748b] text-xs">Unlimited. Every lane, every time.</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-4xl font-bold tracking-tight">$14</span>
                  <span className="text-[#94a3b8] text-sm">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "Unlimited Lane Checks",
                  "All 3 lanes, full detail, every time",
                  "Co-mentions & adjacent-lane data",
                  "AI title generator",
                  "Priority processing — no wait",
                  "Full check history",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                    <span className="text-[#4ade80] mt-px leading-none shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="block text-center text-[#0a0a0a] text-sm font-bold py-4 hover:brightness-110 transition-all"
                style={{ backgroundColor: "#e8833a" }}
              >
                Go Pro — $14/month
              </Link>
              <p className="text-center text-xs text-[#475569] mt-3">
                Or $99/year. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#1a1a1a] py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Stop guessing which
            <br />
            artists to target.
          </h2>
          <p className="text-[#94a3b8] text-sm mb-8 max-w-md mx-auto">
            Free Lane Check. No signup required. See your results in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/lane-check"
              className="text-[#0a0a0a] text-sm font-bold px-8 py-4 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#e8833a" }}
            >
              Check my lanes — free
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
          <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-4">
            FAQ
          </p>
          <h2 className="text-3xl font-bold mb-12">
            Common questions,
            <br />
            straight answers.
          </h2>
          <div className="divide-y divide-[#1a1a1a]">
            {faqs.map(({ q, a }) => (
              <div key={q} className="py-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-16">
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
    </main>
  );
}
