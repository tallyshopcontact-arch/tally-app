import Link from "next/link";

export const metadata = {
  title: "Terms of Service — TALLY",
  description: "Terms governing your use of the TALLY service.",
};

const section = "border-t border-[#1a1a1a] py-10";
const body = "text-[#94a3b8] text-sm leading-relaxed";
const label = "text-xs text-[#94a3b8] font-medium tracking-[0.2em] uppercase mb-4";

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
          Last updated: June 2026
        </p>
        <p className={`${body} mt-4`}>
          By joining the waitlist or subscribing to TALLY, you agree to these
          terms. Please read them carefully.
        </p>

        {/* Subscription */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Subscription &amp; Billing</h2>
          <p className={`${body} mb-4`}>
            TALLY is a subscription service billed at <strong className="text-white">$29 USD per month</strong>.
            Your subscription begins on the date you are onboarded and your first
            payment is processed. Billing recurs monthly on the same date unless
            cancelled.
          </p>
          <p className={body}>
            You authorize TALLY to charge your payment method on a recurring monthly
            basis until you cancel. Prices may change with 30 days&apos; notice sent
            to your registered email address.
          </p>
        </div>

        {/* Cancellation */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Cancellation</h2>
          <p className={`${body} mb-4`}>
            You may cancel your subscription at any time. Cancellation takes effect
            at the end of your current billing period — you will retain access to the
            service through the end of the period you have already paid for.
          </p>
          <p className={body}>
            To cancel, email{" "}
            <a
              href="mailto:tallyshop.contact@gmail.com"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              tallyshop.contact@gmail.com
            </a>{" "}
            with your account email and the subject line &ldquo;Cancel subscription.&rdquo;
          </p>
        </div>

        {/* Report delivery */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Report Delivery</h2>
          <p className={`${body} mb-4`}>
            Reports are delivered monthly to your registered email address. We aim to
            deliver reports on the 1st of each calendar month. Delivery timing may
            vary slightly due to processing volume.
          </p>
          <p className={body}>
            If you do not receive your report within 5 business days of the expected
            delivery date, contact us at{" "}
            <a
              href="mailto:tallyshop.contact@gmail.com"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              tallyshop.contact@gmail.com
            </a>
            .
          </p>
        </div>

        {/* YouTube data */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">YouTube Data Usage</h2>
          <p className={body}>
            TALLY analyses publicly available YouTube data only, accessed via the
            YouTube Data API provided by Google. We do not access private account
            data, YouTube Studio analytics, or any information that requires
            authenticated access to your account. All analysis is based on data
            that is publicly visible to anyone on YouTube.
          </p>
        </div>

        {/* Disclaimer */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">No Guarantee of Results</h2>
          <p className={body}>
            TALLY provides data-driven insights and recommendations based on publicly
            available YouTube data. We do not guarantee specific view counts, subscriber
            growth, revenue, or any other outcome. Growth results depend on many factors
            outside our control, including the quality of your content, your publishing
            consistency, and platform algorithm changes. The service is provided as-is,
            for informational purposes only.
          </p>
        </div>

        {/* Refunds */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Refund Policy</h2>
          <p className={`${body} mb-4`}>
            We offer a <strong className="text-white">7-day refund for your first month only</strong>.
            If you are not satisfied with your first report, contact us within 7 days of
            receiving it and we will issue a full refund.
          </p>
          <p className={body}>
            Subsequent monthly charges are non-refundable. Partial-month refunds are
            not available. To request a first-month refund, email{" "}
            <a
              href="mailto:tallyshop.contact@gmail.com"
              className="text-white underline underline-offset-2 hover:text-[#cbd5e1] transition-colors"
            >
              tallyshop.contact@gmail.com
            </a>{" "}
            with your account email and order details.
          </p>
        </div>

        {/* Acceptable use */}
        <div className={section}>
          <h2 className="font-semibold text-white mb-3">Acceptable Use</h2>
          <p className={body}>
            You agree to use TALLY for lawful purposes only and in connection with a
            legitimate YouTube channel that you own or manage. You may not share,
            resell, or redistribute reports or any content generated by TALLY without
            written permission. TALLY reserves the right to terminate accounts that
            violate these terms.
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
