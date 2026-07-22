import Link from "next/link";

export const metadata = {
  title: "Terms of Service — TALLY",
  description: "Terms governing your use of the TALLY service.",
};

const section = "border-t border-[#1a1a1a] py-10";
const body = "text-[#94a3b8] text-sm leading-relaxed";
const label = "text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4";
const link = "text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="text-lg font-bold tracking-[0.25em]">
            TALLY
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <p className={label}>Legal</p>
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className={body}>
          Last updated: July 2026
        </p>
        <p className={`${body} mt-4`}>
          By creating an account or subscribing to TALLY, you agree to these
          terms. Please read them carefully.
        </p>

        {/* What TALLY does */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">What TALLY Does</h2>
          <p className={body}>
            TALLY analyzes public YouTube video and channel data to help music
            producers decide which artists to target next, how to title and tag
            their next beat upload, and which &ldquo;lanes&rdquo; are actually
            winnable for a channel their size — packaged as an Upload Kit for
            each beat.
          </p>
        </div>

        {/* No guarantee */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">No Guarantee of Results</h2>
          <p className={body}>
            Our scores and recommendations (Demand, Saturation, Winnability,
            Opportunity, and everything derived from them) are computed from real,
            publicly available YouTube data. They do not guarantee views, subscriber
            growth, revenue, or any other outcome. Results depend on many factors
            outside our control, including the quality of your content, your
            publishing consistency, and platform algorithm changes. The service is
            provided as-is, for informational purposes only.
          </p>
        </div>

        {/* Free & paid tiers */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Free &amp; Paid Tiers</h2>
          <p className={`${body} mb-4`}>
            <strong className="text-white">Free:</strong> Upload Kits are unlimited,
            at no cost, for lanes we&apos;ve already analyzed within the past 14
            days. Requesting analysis of a new or stale lane draws from a shared
            daily analysis budget across all users, and free accounts are limited
            to one such fresh check per month.
          </p>
          <p className={body}>
            <strong className="text-white">TALLY Pro:</strong> $14/month or
            $99/year gets you unlimited kits for every lane, every time — full
            title and tag lists, and every &ldquo;also consider&rdquo; suggestion.
            New subscribers get a free trial before their first charge: 14 days
            for founding members using code FOUNDING20, 7 days otherwise.
          </p>
        </div>

        {/* Founding member offer */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Founding Member Offer</h2>
          <p className={body}>
            The first 20 subscribers to TALLY Pro lock in{" "}
            <strong className="text-white">$14/month for life</strong> (or{" "}
            <strong className="text-white">$11.20/month for life</strong> with code
            FOUNDING20). We will never raise the price for founding members —
            this rate is locked for as long as your subscription stays active.
          </p>
        </div>

        {/* Pricing changes */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Pricing Changes</h2>
          <p className={body}>
            We may change TALLY Pro&apos;s listed price for new subscribers at any
            time, with at least 30 days&apos; notice. Existing subscribers —
            including founding members, per the guarantee above — keep the rate
            they signed up at.
          </p>
        </div>

        {/* Cancellation */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Cancellation</h2>
          <p className={`${body} mb-4`}>
            You may cancel your subscription at any time from your account
            settings. Cancellation takes effect at the end of your current
            billing period — you retain access through the period you&apos;ve
            already paid for.
          </p>
          <p className={body}>
            Since we offer a free trial before any charge, we don&apos;t provide
            refunds once a payment has been processed. Cancel any time during your
            trial to avoid being charged.
          </p>
        </div>

        {/* YouTube data usage */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">YouTube Data Usage</h2>
          <p className={`${body} mb-4`}>
            TALLY analyzes publicly available YouTube data only, accessed via
            YouTube API Services provided by Google. We do not access private
            account data, YouTube Studio analytics, or any information that
            requires authenticated access to your channel. Your use of TALLY is
            subject to the{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              YouTube API Services Terms of Service
            </a>
            .
          </p>
        </div>

        {/* Acceptable use */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Acceptable Use</h2>
          <p className={`${body} mb-4`}>
            TALLY is for music producers to use in connection with their own
            YouTube channel(s). You agree not to scrape, resell, redistribute, or
            make automated bulk use of TALLY&apos;s data or output.
          </p>
          <p className={body}>
            We may suspend or terminate accounts that abuse the free tier, attempt
            to circumvent our rate limits or usage caps, or otherwise violate these
            terms.
          </p>
        </div>

        {/* Governing law */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Governing Law</h2>
          <p className={body}>
            These terms are governed by the laws of the province of{" "}
            <strong className="text-white">Quebec, Canada</strong>, and applicable
            federal Canadian law, without regard to conflict of law principles. Any
            disputes arising under these terms shall be resolved in the courts of
            Quebec, Canada.
          </p>
        </div>

        {/* Changes */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Changes to These Terms</h2>
          <p className={body}>
            We may update these terms from time to time. Material changes will be
            communicated by email to your registered address at least 14 days before
            taking effect. Continued use of TALLY after the effective date constitutes
            acceptance of the updated terms.
          </p>
        </div>

        {/* Contact */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Contact</h2>
          <p className={body}>
            Questions about these terms? Reach us at{" "}
            <a href="mailto:tallyshop.contact@gmail.com" className={link}>
              tallyshop.contact@gmail.com
            </a>
            .
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">
            TALLY
          </Link>
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
