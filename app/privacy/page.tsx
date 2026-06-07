import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — TALLY",
  description: "How TALLY collects, uses, and protects your data.",
};

const section = "border-t border-[#1a1a1a] py-10";
const label = "text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4";
const body = "text-[#94a3b8] text-sm leading-relaxed";

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
          Last updated: June 2026
        </p>

        {/* What we collect */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Information We Collect</h2>
          <p className={`${body} mb-4`}>
            When you join the TALLY waitlist or subscribe to the service, we collect the following information:
          </p>
          <ul className="space-y-2">
            {[
              "Your name",
              "Your email address",
              "Your music genre",
              "Your YouTube channel link",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                <span className="text-[#64748b] mt-px leading-none">—</span>
                {item}
              </li>
            ))}
          </ul>
          <p className={`${body} mt-4`}>
            We do not collect payment information directly. Payments are processed
            by third-party providers and are subject to their privacy policies.
          </p>
        </div>

        {/* How we use it */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">How We Use Your Information</h2>
          <p className={`${body} mb-4`}>
            We use the information you provide solely to:
          </p>
          <ul className="space-y-2">
            {[
              "Notify you when your waitlist spot opens",
              "Deliver your monthly YouTube growth reports",
              "Tailor report analysis to your genre and channel",
              "Send service-related communications (no marketing spam)",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-[#94a3b8]">
                <span className="text-[#64748b] mt-px leading-none">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* YouTube Data API */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">YouTube Data API</h2>
          <p className={`${body} mb-4`}>
            TALLY uses the YouTube Data API (provided by Google) to analyze publicly
            available channel and video data. By using TALLY, you agree that your use
            of this service is also subject to{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              Google&apos;s Privacy Policy
            </a>
            .
          </p>
          <p className={body}>
            TALLY only accesses publicly visible YouTube data. We do not access your
            YouTube account credentials, private videos, or any data that is not
            already publicly available. Our use of the YouTube Data API complies with
            the{" "}
            <a
              href="https://developers.google.com/youtube/terms/api-services-terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              YouTube API Services Terms of Service
            </a>
            .
          </p>
        </div>

        {/* Data storage */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Storage</h2>
          <p className={body}>
            Your data is stored securely using{" "}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              Supabase
            </a>
            , a managed database platform. Data is encrypted at rest and in transit.
            We retain your data only as long as necessary to provide the service or
            as required by law.
          </p>
        </div>

        {/* Data sharing */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Sharing &amp; Sale</h2>
          <p className={body}>
            We do not sell, rent, or share your personal information with third parties
            for marketing or advertising purposes. Your data is never sold. We may share
            data only as required by law or to operate the core service (e.g., with our
            database provider, Supabase).
          </p>
        </div>

        {/* Deletion */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Data Deletion Requests</h2>
          <p className={body}>
            You may request deletion of your personal data at any time by emailing us at{" "}
            <a
              href="mailto:tallyshop.contact@gmail.com"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
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
            <a
              href="mailto:tallyshop.contact@gmail.com"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
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
