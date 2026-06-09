import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">404</p>
      <h1 className="text-3xl font-bold mb-3">Page not found</h1>
      <p className="text-[#94a3b8] text-sm mb-8 max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-white/90 transition"
        >
          Back to dashboard
        </Link>
        <Link href="/" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
          Home
        </Link>
      </div>
    </div>
  );
}
