"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, Clock, Copy } from "lucide-react";

// ── Credentials ──────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@tally.com";
const DEMO_PASSWORD = "tally2026";

// ── Data ─────────────────────────────────────────────────────────────────────

const channel = {
  name: "Gritty Loops",
  handle: "@GrittyLoops",
  genre: "Boom Bap",
  subscribers: "8,412",
};

const stats = [
  { label: "Views this month", value: "47,230", delta: "+12%", sub: "vs last month" },
  { label: "New subscribers", value: "+312", delta: "+8%", sub: "vs last month" },
  { label: "Avg views / video", value: "15,743", delta: "Top 14%", sub: "in boom bap" },
  { label: "Watch time", value: "2,840 hrs", delta: "+19%", sub: "vs last month" },
];

const keywords = [
  { keyword: "jazz boom bap type beat",    searches: "18,400", competition: "Low",    growth: "+67%",  opportunity: "High"   },
  { keyword: "sample flip beat free",      searches: "12,100", competition: "Low",    growth: "+89%",  opportunity: "High"   },
  { keyword: "dusty loop beat",            searches: "6,700",  competition: "Low",    growth: "+112%", opportunity: "High"   },
  { keyword: "boom bap beat with hook",    searches: "8,300",  competition: "Low",    growth: "+41%",  opportunity: "High"   },
  { keyword: "boom bap type beat 2025",    searches: "31,200", competition: "Medium", growth: "+34%",  opportunity: "Medium" },
  { keyword: "underground rap beat",       searches: "24,500", competition: "Medium", growth: "+15%",  opportunity: "Medium" },
  { keyword: "boom bap for rappers",       searches: "28,900", competition: "Medium", growth: "+28%",  opportunity: "Medium" },
  { keyword: "90s hip hop beat free",      searches: "45,000", competition: "High",   growth: "+5%",   opportunity: "Low"    },
];

const topVideos = [
  {
    title: 'FREE | "Foundation" | Jazz Boom Bap Type Beat 2025',
    channel: "NinetyFlip",
    views: "234K",
    growth: "+89%",
    why: 'Jazz instrumentation + clean "FREE | Title | Genre Year" format. Mood-specific keyword drives search traffic.',
  },
  {
    title: '[FREE] "Smoky Room" | Jazz Boom Bap Instrumental',
    channel: "Vinyl Era Beats",
    views: "178K",
    growth: "+145%",
    why: "Mood-first title with strong jazz niche targeting. Minimal high-contrast thumbnail.",
  },
  {
    title: 'Grimy Boom Bap Beat "No Surrender" | FREE USE',
    channel: "BoomBap Society",
    views: "156K",
    growth: "+67%",
    why: '"FREE USE" outperforms plain "free" — signals broader licensing. Emotional, underground-coded title.',
  },
  {
    title: '"Sample Season" Boom Bap Instrumental | FREE',
    channel: "Dusty Crates",
    views: "98K",
    growth: "+34%",
    why: "Sample-focused branding aligns with the trending 'sample flip' search behavior this month.",
  },
  {
    title: '90s Boom Bap Beat "Concrete Jungle" [FREE]',
    channel: "Classic Mode Beats",
    views: "87K",
    growth: "+23%",
    why: "Nostalgic framing + era-specific keyword. Consistent 3×/week upload cadence amplifies reach.",
  },
];

const avoidItems = [
  {
    title: "Trap-Boom Bap Hybrid Titles",
    impact: "−31% avg views",
    detail:
      "Boom bap audiences actively filter out trap crossovers. Mixed positioning confuses both the algorithm and your audience. Keep genre identity clear in every title.",
  },
  {
    title: '"Type Beat 2025" Without a Genre Keyword',
    impact: "−40% CTR",
    detail:
      'Your niche searches by genre first, year second. A title like "boom bap type beat 2025" consistently outperforms "type beat 2025". Never lead with the year.',
  },
  {
    title: "Lo-fi Boom Bap Crossover Tags",
    impact: "High bounce rate",
    detail:
      "Tagging boom bap beats with lo-fi terms pulls the wrong audience. They expect lo-fi aesthetics, close the tab in seconds, and destroy your watch-time signal.",
  },
  {
    title: "Collab-Implied Titles Without a Featured Artist",
    impact: "Misleads intent",
    detail:
      "Titles like 'ft. [Artist]' without an actual rapper mislead search intent. Viewers expect a finished track, find a raw instrumental, and leave immediately.",
  },
];

const uploadKit = {
  title: 'FREE | "Midnight Cipher" | Jazz Boom Bap Type Beat | Sample Flip 2025',
  description: `FREE "Midnight Cipher" — Jazz Boom Bap Type Beat | Sample Flip 2025

▶ Licensing info: [your email]
🎵 Free download: [your link]

Free for non-profit / mixtape use. Purchase a license for commercial releases.

#BoomBap #JazzBoomBap #TypeBeat #FreeBeat #SampleFlip #HipHopInstrumental`,
  tags: [
    "boom bap type beat",
    "jazz boom bap",
    "sample flip beat",
    "free boom bap instrumental",
    "underground hip hop beat",
    "grimy rap beat",
    "90s boom bap 2025",
    "dusty loop beat",
    "boom bap for rappers",
    "free instrumental 2025",
    "jazz hip hop beat",
    "sample flip 2025",
  ],
  thumbnail:
    "Dark navy background. 'MIDNIGHT CIPHER' in bold white stencil or slab-serif font. Saxophone silhouette on the left, slightly desaturated. Vinyl record texture behind the title. Small 'FREE' badge in the top-right corner. Gritty grain overlay. High contrast — readable at 120px thumbnail size.",
  uploadTime: "Thursday or Friday · 2:00–5:00 pm EST",
  uploadNote:
    "Boom bap uploads on these days average 34% higher first-week views vs Monday–Wednesday.",
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const compBadge: Record<string, string> = {
  Low:    "bg-[#0a1f12] text-[#4ade80]",
  Medium: "bg-[#1f1800] text-[#fbbf24]",
  High:   "bg-[#1f0a0a] text-[#f87171]",
};

const oppColor: Record<string, string> = {
  High:   "text-[#4ade80]",
  Medium: "text-[#94a3b8]",
  Low:    "text-[#475569]",
};

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Channel card */}
      <div className="flex items-center gap-5 pb-8 border-b border-[#1a1a1a]">
        <div className="w-14 h-14 bg-[#1a1a1a] flex items-center justify-center font-bold text-lg tracking-wide shrink-0">
          GL
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">{channel.name}</h2>
            <span className="text-xs text-[#94a3b8] border border-[#2a2a2a] px-2 py-0.5">
              {channel.genre}
            </span>
          </div>
          <p className="text-[#94a3b8] text-sm">
            {channel.handle} · {channel.subscribers} subscribers
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a1a1a]">
        {stats.map(({ label, value, delta, sub }) => (
          <div key={label} className="bg-[#0a0a0a] p-6">
            <p className="text-[#94a3b8] text-xs uppercase tracking-widest mb-4">{label}</p>
            <p className="text-3xl font-bold mb-1">{value}</p>
            <p className="text-xs">
              <span className="text-[#4ade80]">{delta}</span>
              <span className="text-[#475569] ml-1">{sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Summary + Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#1a1a1a] p-6">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            June 2025 Summary
          </p>
          <p className="text-sm text-[#cbd5e1] leading-relaxed">
            Jazz-influenced boom bap is seeing its strongest month since Q4 2024.
            Sample flip content is outperforming standard boom bap by{" "}
            <span className="text-white font-semibold">89%</span> in your niche
            — this is the single most important trend to act on now.
          </p>
          <p className="text-sm text-[#94a3b8] leading-relaxed mt-3">
            Your watch time growth (+19%) outpaces subscriber growth (+8%),
            signaling strong content quality but weak discovery. Better title
            and tag optimization should close that gap.
          </p>
        </div>
        <div className="border border-[#1a1a1a] p-6">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            Key Opportunities
          </p>
          <ul className="space-y-4">
            {[
              '"Jazz boom bap" is underserved — high search volume, low competition.',
              "Sample flip content averages 2.4× more views than standard boom bap uploads.",
              "Thursday/Friday uploads in your genre get 34% higher first-week view counts.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <ArrowUpRight className="w-4 h-4 text-[#4ade80] shrink-0 mt-0.5" />
                <span className="text-sm text-[#cbd5e1]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KeywordsTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Trending in Boom Bap — June 2025</h2>
        <p className="text-[#94a3b8] text-sm">
          8 keywords with strong search volume and growth in your genre.
        </p>
      </div>
      <div className="border border-[#1a1a1a] overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              {["Keyword", "Monthly Searches", "Competition", "MoM Growth", "Opportunity"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {keywords.map((row, i) => (
              <tr
                key={i}
                className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors"
              >
                <td className="px-5 py-4 text-white font-medium">{row.keyword}</td>
                <td className="px-5 py-4 text-[#94a3b8]">{row.searches}</td>
                <td className="px-5 py-4">
                  <span className={`text-xs px-2 py-1 ${compBadge[row.competition]}`}>
                    {row.competition}
                  </span>
                </td>
                <td className="px-5 py-4 text-[#4ade80] font-medium">{row.growth}</td>
                <td className={`px-5 py-4 font-medium ${oppColor[row.opportunity]}`}>
                  {row.opportunity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopVideosTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Top Performing Videos in Your Genre</h2>
        <p className="text-[#94a3b8] text-sm">
          Highest-growth boom bap videos uploaded in the last 30 days.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {topVideos.map((video, i) => (
          <div
            key={i}
            className="bg-[#0a0a0a] p-6 flex flex-col md:flex-row md:items-start gap-5"
          >
            <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium mb-1 leading-snug">{video.title}</p>
              <p className="text-[#94a3b8] text-xs mb-3">{video.channel}</p>
              <p className="text-[#64748b] text-xs leading-relaxed">
                <span className="text-[#94a3b8] font-medium">Why it works: </span>
                {video.why}
              </p>
            </div>
            <div className="shrink-0 md:text-right">
              <p className="text-white font-bold text-xl">{video.views}</p>
              <p className="text-[#4ade80] text-xs">{video.growth} MoM</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvoidTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">What to Avoid This Month</h2>
        <p className="text-[#94a3b8] text-sm">
          Patterns pulling down performance in your genre right now.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {avoidItems.map((item, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
            <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <span className="shrink-0 text-xs text-[#f87171] bg-[#1f0a0a] px-2 py-1">
                  {item.impact}
                </span>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadKitTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Upload Kit — June 2025</h2>
        <p className="text-[#94a3b8] text-sm">
          Your ready-to-use package for your next upload, built from this month&apos;s report.
        </p>
      </div>
      <div className="space-y-4">
        {/* Title */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Recommended Title</p>
            <CopyButton text={uploadKit.title} />
          </div>
          <p className="text-white font-medium mb-3">{uploadKit.title}</p>
          <p className="text-[#94a3b8] text-xs leading-relaxed">
            Leads with FREE · uses the top jazz boom bap keyword · includes "sample flip" (+89% trending) · ends with year for freshness.
          </p>
        </div>

        {/* Description */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Description Template</p>
            <CopyButton text={uploadKit.description} />
          </div>
          <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {uploadKit.description}
          </pre>
        </div>

        {/* Tags */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Tags</p>
            <CopyButton text={uploadKit.tags.join(", ")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {uploadKit.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-[#94a3b8] bg-[#111] border border-[#1e1e1e] px-3 py-1.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Thumbnail + Upload time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[#1a1a1a] p-6">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
              Thumbnail Concept
            </p>
            <p className="text-[#cbd5e1] text-sm leading-relaxed">{uploadKit.thumbnail}</p>
          </div>
          <div className="border border-[#1a1a1a] p-6">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
              Best Time to Upload
            </p>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[#4ade80]" />
              <p className="text-white font-semibold">{uploadKit.uploadTime}</p>
            </div>
            <p className="text-[#94a3b8] text-sm leading-relaxed">{uploadKit.uploadNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginGate({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      onAuth();
    } else {
      setError(true);
    }
  };

  const inputClass =
    "w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12">
          TALLY
        </Link>
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Enter your credentials to access the dashboard.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(false); }}
            placeholder="Email"
            autoFocus
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Password"
            className={inputClass}
          />
          {error && (
            <p className="text-red-400 text-xs">Incorrect email or password.</p>
          )}
          <button
            type="submit"
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors"
          >
            Sign in
          </button>
        </form>

        {/* Demo credentials hint */}
        <div className="mt-8 border border-[#1a1a1a] p-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Demo account</p>
          <p className="text-[#cbd5e1] text-xs font-mono">{DEMO_EMAIL}</p>
          <p className="text-[#cbd5e1] text-xs font-mono">{DEMO_PASSWORD}</p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

type Tab = "overview" | "keywords" | "top-videos" | "avoid" | "upload-kit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",   label: "Overview"      },
  { id: "keywords",   label: "Keywords"      },
  { id: "top-videos", label: "Top Videos"    },
  { id: "avoid",      label: "What to Avoid" },
  { id: "upload-kit", label: "Upload Kit"    },
];

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Sticky header: nav + tab bar */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]">
        <nav className="border-b border-[#1a1a1a] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="text-sm font-bold tracking-[0.25em]">
              TALLY
            </Link>
            <div className="flex items-center gap-6">
              <span className="text-xs text-[#94a3b8] hidden sm:block">
                {channel.name} · June 2025 Report
              </span>
              <button
                onClick={onSignOut}
                className="text-sm text-[#94a3b8] hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
        <div className="border-b border-[#1a1a1a] px-6">
          <div className="max-w-5xl mx-auto flex overflow-x-auto">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 text-sm px-5 py-3.5 border-b-2 transition-colors ${
                  tab === id
                    ? "border-white text-white"
                    : "border-transparent text-[#94a3b8] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {tab === "overview"   && <OverviewTab />}
        {tab === "keywords"   && <KeywordsTab />}
        {tab === "top-videos" && <TopVideosTab />}
        {tab === "avoid"      && <AvoidTab />}
        {tab === "upload-kit" && <UploadKitTab />}
      </main>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  if (!authenticated) return <LoginGate onAuth={() => setAuthenticated(true)} />;
  return <Dashboard onSignOut={() => setAuthenticated(false)} />;
}
