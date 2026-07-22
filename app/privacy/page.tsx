import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — TALLY",
  description: "How TALLY collects, uses, and protects your data.",
};

const section = "border-t border-[#1a1a1a] py-10";
const label = "text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4";
const body = "text-[#94a3b8] text-sm leading-relaxed";
const link = "text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors";

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className={body}>
          Last updated: July 2026
        </p>

        {/* What we collect */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Information We Collect</h2>
          <p className={`${body} mb-4`}>
            When you create a TALLY account or use the service, we collect:
          </p>
          <ul className="space-y-2">
            {[
              "Your email address",
              "Account information (e.g. your name, if provided, and your subscription status)",
              "Lane analysis results — public YouTube video and channel metadata (titles, view counts, subscriber counts, tags) tied to the artist lanes you check",
              "Your Upload Kit history — the beat names, artists, genres, and generated titles/tags from your past checks",
              "Anything you voluntarily submit through a waitlist or diagnostic form",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                <span className="text-[#64748b] mt-px leading-none shrink-0">—</span>
                {item}
              </li>
            ))}
          </ul>
          <p className={`${body} mt-4`}>
            We do not collect or store payment card details directly. Payments are
            processed entirely by Stripe (see &ldquo;Third-Party Services&rdquo; below)
            and are subject to Stripe&apos;s privacy policy.
          </p>
        </div>

        {/* How we use it */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">How We Use Your Information</h2>
          <ul className="space-y-2">
            {[
              "To generate your Upload Kit results, lane scores, and title/tag recommendations",
              "To send account, billing, and service-related emails",
              "To process payments and manage your subscription",
              "To understand, in aggregate, how TALLY is used, so we can improve it",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                <span className="text-[#64748b] mt-px leading-none shrink-0">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* YouTube API Services */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">YouTube API Services</h2>
          <p className={`${body} mb-4`}>
            We use YouTube API Services to fetch public video and channel data
            (titles, view counts, subscriber counts, tags) in order to score lanes
            and generate Upload Kits. We do not access private YouTube account data,
            YouTube Studio analytics, or anything that requires authenticated access
            to your channel.
          </p>
          <p className={`${body} mb-4`}>
            This application uses YouTube API Services. By using TALLY, you also
            agree to{" "}
            <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className={link}>
              Google&apos;s Privacy Policy
            </a>
            .
          </p>
          <p className={body}>
            Our use of the YouTube Data API also complies with the{" "}
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

        {/* Data storage & retention */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Storage &amp; Retention</h2>
          <p className={`${body} mb-4`}>
            Your data is stored securely using{" "}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className={link}>
              Supabase
            </a>
            , a managed database platform. Data is encrypted at rest and in transit.
          </p>
          <p className={`${body} mb-4`}>
            Lane analysis data — the cached YouTube video and channel metadata behind
            each lane&apos;s score — is cached for <strong className="text-white">14 days</strong>,
            after which it is automatically refreshed the next time that lane is
            requested.
          </p>
          <p className={body}>
            We retain your account, billing, and Upload Kit history for as long as
            your account is active, or as required by law.
          </p>
        </div>

        {/* Third-party services */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Third-Party Services</h2>
          <p className={`${body} mb-4`}>
            We rely on the following providers to operate TALLY:
          </p>
          <ul className="space-y-2">
            {[
              { name: "Stripe", desc: "payment processing. We never store your card details — all payment data is handled directly by Stripe." },
              { name: "Resend", desc: "transactional email delivery (account, billing, and Upload Kit notifications)." },
              { name: "Supabase", desc: "our database provider." },
              { name: "Vercel Analytics", desc: "anonymous, aggregate usage tracking. This does not identify you personally." },
            ].map((s) => (
              <li key={s.name} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                <span className="text-[#64748b] mt-px leading-none shrink-0">—</span>
                <span><strong className="text-white">{s.name}</strong> — {s.desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Data sharing */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Sharing &amp; Sale</h2>
          <p className={body}>
            We do not sell, rent, or share your personal information with third parties
            for marketing or advertising purposes. Your data is never sold. We share
            data only as required by law or to operate the core service (e.g., with the
            providers listed above).
          </p>
        </div>

        {/* Deletion */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Deletion Requests</h2>
          <p className={body}>
            You may request deletion of your personal data at any time by emailing us at{" "}
            <a href="mailto:tallyshop.contact@gmail.com" className={link}>
              tallyshop.contact@gmail.com
            </a>
            . We will process your request within 30 days and confirm deletion in writing.
          </p>
        </div>

        {/* Jurisdiction */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Jurisdiction</h2>
          <p className={body}>
            TALLY is operated from Canada. By using this service, you agree that any
            disputes relating to privacy will be governed by applicable Canadian
            federal and provincial privacy law, including the Personal Information
            Protection and Electronic Documents Act (PIPEDA).
          </p>
        </div>

        {/* Contact */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Contact</h2>
          <p className={body}>
            Questions about this policy? Email us at{" "}
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
