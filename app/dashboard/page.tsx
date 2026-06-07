"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  TrendingUp,
  TrendingDown,
  Users,
  Globe,
  Smartphone,
  Monitor,
  Search,
  Target,
  BarChart2,
  Zap,
} from "lucide-react";

// ── Credentials ──────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@tally.com";
const DEMO_PASSWORD = "tally2026";

// ── Data ─────────────────────────────────────────────────────────────────────

const channel = {
  name: "BoomBap_Marcus",
  handle: "@BoomBap_Marcus",
  genre: "Boom Bap",
  subscribers: "12,847",
};

const stats = [
  { label: "Views this month", value: "61,430", delta: "+18%", sub: "vs last month" },
  { label: "New subscribers",  value: "+487",   delta: "+14%", sub: "vs last month" },
  { label: "Avg views / video",value: "20,477", delta: "Top 11%", sub: "in boom bap" },
  { label: "Watch time",       value: "3,920 hrs", delta: "+22%", sub: "vs last month" },
];

const keywords = [
  { keyword: "jazz boom bap type beat",    searches: "19,200", competition: "Low",    growth: "+73%",  opportunity: "High"   },
  { keyword: "sample flip beat free",      searches: "13,400", competition: "Low",    growth: "+94%",  opportunity: "High"   },
  { keyword: "dusty loop beat",            searches: "7,100",  competition: "Low",    growth: "+118%", opportunity: "High"   },
  { keyword: "boom bap beat with hook",    searches: "8,900",  competition: "Low",    growth: "+47%",  opportunity: "High"   },
  { keyword: "boom bap type beat 2026",    searches: "34,500", competition: "Medium", growth: "+38%",  opportunity: "Medium" },
  { keyword: "underground rap beat",       searches: "26,200", competition: "Medium", growth: "+17%",  opportunity: "Medium" },
  { keyword: "boom bap for rappers",       searches: "30,100", competition: "Medium", growth: "+29%",  opportunity: "Medium" },
  { keyword: "90s hip hop beat free",      searches: "47,300", competition: "High",   growth: "+4%",   opportunity: "Low"    },
];

const topVideos = [
  {
    title: 'FREE | "Foundation" | Jazz Boom Bap Type Beat 2026',
    channel: "NinetyFlip",
    views: "261K",
    growth: "+94%",
    why: 'Jazz instrumentation + clean "FREE | Title | Genre Year" format. Mood-specific keyword drives search traffic.',
  },
  {
    title: '[FREE] "Smoky Room" | Jazz Boom Bap Instrumental',
    channel: "Vinyl Era Beats",
    views: "194K",
    growth: "+152%",
    why: "Mood-first title with strong jazz niche targeting. Minimal high-contrast thumbnail doubled CTR.",
  },
  {
    title: 'Grimy Boom Bap Beat "No Surrender" | FREE USE',
    channel: "BoomBap Society",
    views: "173K",
    growth: "+71%",
    why: '"FREE USE" outperforms plain "free" — signals broader licensing. Emotional, underground-coded title.',
  },
  {
    title: '"Sample Season" Boom Bap Instrumental | FREE',
    channel: "Dusty Crates",
    views: "109K",
    growth: "+38%",
    why: "Sample-focused branding aligns with the trending 'sample flip' search behavior this month.",
  },
  {
    title: '90s Boom Bap Beat "Concrete Jungle" [FREE]',
    channel: "Classic Mode Beats",
    views: "92K",
    growth: "+21%",
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
    title: '"Type Beat 2026" Without a Genre Keyword',
    impact: "−40% CTR",
    detail:
      'Your niche searches by genre first, year second. A title like "boom bap type beat 2026" consistently outperforms "type beat 2026". Never lead with the year.',
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
  title: 'FREE | "Midnight Cipher" | Jazz Boom Bap Type Beat | Sample Flip 2026',
  description: `FREE "Midnight Cipher" — Jazz Boom Bap Type Beat | Sample Flip 2026

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
    "90s boom bap 2026",
    "dusty loop beat",
    "boom bap for rappers",
    "free instrumental 2026",
    "jazz hip hop beat",
    "sample flip 2026",
  ],
  thumbnail:
    "Dark navy background. 'MIDNIGHT CIPHER' in bold white stencil or slab-serif font. Saxophone silhouette on the left, slightly desaturated. Vinyl record texture behind the title. Small 'FREE' badge in the top-right corner. Gritty grain overlay. High contrast — readable at 120px thumbnail size.",
  uploadTime: "Thursday or Friday · 2:00–5:00 pm EST",
  uploadNote:
    "Boom bap uploads on these days average 34% higher first-week views vs Monday–Wednesday.",
};

const competitors = [
  {
    channel: "NinetyFlip",
    handle: "@NinetyFlip",
    subs: "48.2K",
    monthlyViews: "312K",
    freq: "3× / week",
    trend: "+12%",
    trending: true,
    topVideo: '"Foundation" Jazz Boom Bap Type Beat 2026',
    insight: "Owns the jazz sub-niche. High consistency — never misses a Thursday upload.",
  },
  {
    channel: "Vinyl Era Beats",
    handle: "@VinylEraBeats",
    subs: "31.5K",
    monthlyViews: "198K",
    freq: "2× / week",
    trend: "+19%",
    trending: true,
    topVideo: '"Smoky Room" Jazz Boom Bap Instrumental',
    insight: "Fastest growing competitor this month. Minimal thumbnails driving above-average CTR.",
  },
  {
    channel: "BoomBap Society",
    handle: "@BoomBapSociety",
    subs: "67.1K",
    monthlyViews: "445K",
    freq: "5× / week",
    trend: "+3%",
    trending: true,
    topVideo: 'Grimy Boom Bap "No Surrender" | FREE USE',
    insight: "Largest channel but slowing. High volume diluting per-video quality signals.",
  },
  {
    channel: "Dusty Crates",
    handle: "@DustyCrates",
    subs: "22.8K",
    monthlyViews: "156K",
    freq: "2× / week",
    trend: "+8%",
    trending: true,
    topVideo: '"Sample Season" Boom Bap Instrumental',
    insight: "Sample-flip positioning is catching fire — directly competing with your opportunity.",
  },
  {
    channel: "Classic Mode Beats",
    handle: "@ClassicModeBeats",
    subs: "19.3K",
    monthlyViews: "112K",
    freq: "1× / week",
    trend: "-4%",
    trending: false,
    topVideo: '90s Boom Bap "Concrete Jungle" [FREE]',
    insight: "Declining. Pure nostalgia framing without jazz or sample-flip hooks is losing ground.",
  },
];

const audience = {
  ageGroups: [
    { label: "18–24", pct: 42 },
    { label: "25–34", pct: 38 },
    { label: "35–44", pct: 14 },
    { label: "45+",   pct: 6  },
  ],
  countries: [
    { country: "United States", flag: "🇺🇸", pct: 54 },
    { country: "United Kingdom", flag: "🇬🇧", pct: 12 },
    { country: "Canada",         flag: "🇨🇦", pct: 8  },
    { country: "Germany",        flag: "🇩🇪", pct: 5  },
    { country: "France",         flag: "🇫🇷", pct: 4  },
    { country: "Other",          flag: "🌐", pct: 17 },
  ],
  devices: [
    { label: "Mobile",  pct: 61, icon: "mobile"  },
    { label: "Desktop", pct: 33, icon: "desktop" },
    { label: "Tablet",  pct: 6,  icon: "tablet"  },
  ],
  traffic: [
    { source: "YouTube Search",    pct: 44, color: "#4ade80" },
    { source: "Suggested Videos",  pct: 29, color: "#60a5fa" },
    { source: "External",          pct: 12, color: "#c084fc" },
    { source: "Browse Features",   pct: 9,  color: "#fbbf24" },
    { source: "Other",             pct: 6,  color: "#475569" },
  ],
};

const contentGaps = [
  {
    topic: "Boom Bap Drill Fusion Beat",
    searches: "8,400",
    supply: 0,
    opportunity: "Very High",
    why: "Zero competitor videos this month targeting this crossover. Growing search trend driven by NY rap resurgence.",
  },
  {
    topic: "Jazz Soul Boom Bap Instrumental",
    searches: "9,100",
    supply: 4,
    opportunity: "High",
    why: "Only 4 videos in the last 30 days vs ~9K monthly searches. Jazz + soul combo is underserved.",
  },
  {
    topic: "Boom Bap Beat Breakdown Tutorial",
    searches: "7,200",
    supply: 3,
    opportunity: "High",
    why: "Producers want to learn. Tutorial content builds authority and drives sustained long-tail traffic.",
  },
  {
    topic: "Sample Pack Showcase — Boom Bap",
    searches: "5,100",
    supply: 2,
    opportunity: "High",
    why: "Sample pack videos average 4× longer watch time. Builds community and drives affiliate/kit sales.",
  },
  {
    topic: "Old School Hip Hop Beat 2026",
    searches: "14,300",
    supply: 9,
    opportunity: "Medium",
    why: "Decent volume but growing competition. Differentiate with a strong visual brand or unique sub-style.",
  },
  {
    topic: "Grimy Trap Beat (Boom Bap Adjacent)",
    searches: "21,600",
    supply: 31,
    opportunity: "Low",
    why: "Heavily saturated. Unless you have a unique angle, better to focus on pure boom bap territory.",
  },
];

const seoAudit = [
  {
    category: "Title Optimization",
    score: 72,
    status: "Fair",
    finding: "4 of your last 8 uploads are missing the year. YouTube treats 2026 as a freshness signal for type beats.",
    fix: 'Add "2026" to all active video titles. Takes 2 minutes per video in Studio.',
  },
  {
    category: "Tag Coverage",
    score: 64,
    status: "Fair",
    finding: '6 of the top 8 trending keywords this month are missing from your recent video tags — including "sample flip" (+94%).',
    fix: "Update tags on your top 5 videos. Retroactive tag updates still influence ranking within 24–48 hrs.",
  },
  {
    category: "Description Length",
    score: 45,
    status: "Weak",
    finding: "Most descriptions are under 150 characters. YouTube reads descriptions for keyword context — optimal length is 400–600 chars.",
    fix: "Use the Upload Kit description template. It hits all relevant keywords without being spammy.",
  },
  {
    category: "Thumbnail CTR",
    score: 78,
    status: "Good",
    finding: "Your CTR is 3.8% (niche avg: 4.2%). Slightly below par — likely a contrast issue on mobile at small sizes.",
    fix: "Test one higher-contrast thumbnail variant. Even a +0.4% CTR lift compounds into thousands of extra views monthly.",
  },
  {
    category: "Channel Keyword",
    score: 88,
    status: "Good",
    finding: '"Boom bap" and "type beat" are well-placed in your channel name and about section.',
    fix: "No changes needed. Add 'jazz boom bap' to About section to capture the growing sub-niche.",
  },
  {
    category: "Playlist Structure",
    score: 33,
    status: "Weak",
    finding: "No public playlists. Playlists extend session time, improve suggested video placement, and signal content organization to YouTube.",
    fix: 'Create 3 playlists: "Jazz Boom Bap", "Free Beats 2026", "Sample Flip Beats". Populate with your existing videos.',
  },
];

const growthForecast = {
  current: 12847,
  projections: [
    {
      month: "June 2026",
      baseline: 13467,
      optimized: 13737,
      baselineDelta: "+620",
      optimizedDelta: "+890",
    },
    {
      month: "July 2026",
      baseline: 14147,
      optimized: 14877,
      baselineDelta: "+680",
      optimizedDelta: "+1,140",
    },
    {
      month: "August 2026",
      baseline: 14867,
      optimized: 16257,
      baselineDelta: "+720",
      optimizedDelta: "+1,380",
    },
  ],
  milestones: [
    { label: "15K subscribers", eta: "July 2026 (optimized)", current: false },
    { label: "20K subscribers", eta: "Q1 2027 (optimized)", current: false },
    { label: "Monetization threshold", eta: "Already eligible", current: true },
  ],
  actions: [
    { action: "Fix description length on 5 recent uploads", impact: "+8% avg views", effort: "Low" },
    { action: "Add 2026 year tag to all active titles", impact: "+12% search impressions", effort: "Low" },
    { action: "Upload 1 jazz boom bap video this month", impact: "+23% subscriber conversion", effort: "Medium" },
    { action: "Build 3 keyword playlists", impact: "+15% session duration", effort: "Low" },
    { action: "Shift to Thursday/Friday upload schedule", impact: "+34% first-week views", effort: "Low" },
  ],
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
  "Very High": "text-[#4ade80] font-semibold",
  High:        "text-[#4ade80]",
  Medium:      "text-[#94a3b8]",
  Low:         "text-[#475569]",
};

const scoreColor = (s: number) =>
  s >= 80 ? "text-[#4ade80]" : s >= 60 ? "text-[#fbbf24]" : "text-[#f87171]";

const scoreBarColor = (s: number) =>
  s >= 80 ? "bg-[#4ade80]" : s >= 60 ? "bg-[#fbbf24]" : "bg-[#f87171]";

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-5 pb-8 border-b border-[#1a1a1a]">
        <div className="w-14 h-14 bg-[#1a1a1a] flex items-center justify-center font-bold text-lg tracking-wide shrink-0">
          BM
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#1a1a1a] p-6">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-4">
            May 2026 Summary
          </p>
          <p className="text-sm text-[#cbd5e1] leading-relaxed">
            Jazz-influenced boom bap is at its highest point in 18 months.
            Sample flip content is outperforming standard boom bap by{" "}
            <span className="text-white font-semibold">94%</span> in your niche
            — this is the single most important trend to act on now.
          </p>
          <p className="text-sm text-[#94a3b8] leading-relaxed mt-3">
            Your watch time growth (+22%) outpaces subscriber growth (+14%),
            signaling strong content quality but room to improve discovery.
            Better title and tag optimization is the highest-leverage fix.
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
        <h2 className="text-xl font-bold mb-1">Trending in Boom Bap — May 2026</h2>
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
        <h2 className="text-xl font-bold mb-1">Upload Kit — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Your ready-to-use package for your next upload, built from this month&apos;s report.
        </p>
      </div>
      <div className="space-y-4">
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Recommended Title</p>
            <CopyButton text={uploadKit.title} />
          </div>
          <p className="text-white font-medium mb-3">{uploadKit.title}</p>
          <p className="text-[#94a3b8] text-xs leading-relaxed">
            Leads with FREE · uses the top jazz boom bap keyword · includes &quot;sample flip&quot; (+94% trending) · ends with year for freshness.
          </p>
        </div>

        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Description Template</p>
            <CopyButton text={uploadKit.description} />
          </div>
          <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {uploadKit.description}
          </pre>
        </div>

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

function CompetitorsTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Competitor Tracking — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Your closest competitors in boom bap. Sorted by monthly views.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {competitors.map((c, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-5">
              <div className="w-8 h-8 bg-[#1a1a1a] flex items-center justify-center text-[#475569] text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <p className="text-white font-semibold">{c.channel}</p>
                  <span className="text-[#475569] text-xs">{c.handle}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-[#94a3b8] mb-3">
                  <span><span className="text-white font-medium">{c.subs}</span> subs</span>
                  <span><span className="text-white font-medium">{c.monthlyViews}</span> views/mo</span>
                  <span>{c.freq}</span>
                </div>
                <p className="text-[#64748b] text-xs leading-relaxed">
                  <span className="text-[#94a3b8] font-medium">Top video: </span>
                  {c.topVideo}
                </p>
                <p className="text-[#64748b] text-xs leading-relaxed mt-1">
                  <span className="text-[#94a3b8] font-medium">Insight: </span>
                  {c.insight}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5 md:mt-1">
                {c.trending
                  ? <TrendingUp className="w-3.5 h-3.5 text-[#4ade80]" />
                  : <TrendingDown className="w-3.5 h-3.5 text-[#f87171]" />
                }
                <span className={`text-sm font-semibold ${c.trending ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                  {c.trend} MoM
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudienceTab() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Audience Demographics — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Who&apos;s watching your channel and where they&apos;re coming from.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Age */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Age Groups</p>
          </div>
          <div className="space-y-4">
            {audience.ageGroups.map((a) => (
              <div key={a.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#cbd5e1]">{a.label}</span>
                  <span className="text-white font-semibold">{a.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#1a1a1a]">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${a.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            Core audience is 18–34 (80%). Skews younger than the broader hip-hop demographic — optimize for mobile-first thumbnails and short, punchy descriptions.
          </p>
        </div>

        {/* Geography */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Top Countries</p>
          </div>
          <div className="space-y-3">
            {audience.countries.map((c) => (
              <div key={c.country} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="text-sm text-[#cbd5e1]">{c.country}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1 bg-[#1a1a1a]">
                    <div
                      className="h-full bg-[#94a3b8]"
                      style={{ width: `${(c.pct / 54) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-white font-medium w-8 text-right">{c.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Devices */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Smartphone className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Device Breakdown</p>
          </div>
          <div className="space-y-4">
            {audience.devices.map((d) => (
              <div key={d.label} className="flex items-center gap-4">
                <div className="w-24 shrink-0 flex items-center gap-2">
                  {d.icon === "mobile"  ? <Smartphone className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  {d.icon === "desktop" ? <Monitor className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  {d.icon === "tablet"  ? <Monitor className="w-3.5 h-3.5 text-[#64748b]" /> : null}
                  <span className="text-sm text-[#cbd5e1]">{d.label}</span>
                </div>
                <div className="flex-1 h-1.5 bg-[#1a1a1a]">
                  <div className="h-full bg-white" style={{ width: `${d.pct}%` }} />
                </div>
                <span className="text-sm text-white font-semibold w-8 text-right">{d.pct}%</span>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            61% mobile. Thumbnail text must be legible at 120px. Avoid small fine-print in thumbnail designs.
          </p>
        </div>

        {/* Traffic sources */}
        <div className="border border-[#1a1a1a] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Search className="w-4 h-4 text-[#64748b]" />
            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Traffic Sources</p>
          </div>
          <div className="space-y-4">
            {audience.traffic.map((t) => (
              <div key={t.source}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[#cbd5e1]">{t.source}</span>
                  <span className="text-white font-semibold">{t.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#1a1a1a]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[#475569] text-xs mt-5 leading-relaxed">
            44% search-driven. Your channel is more search-dependent than average (niche avg: 31%) — improving tags and titles has outsized impact.
          </p>
        </div>
      </div>
    </div>
  );
}

function ContentGapsTab() {
  const oppBadge: Record<string, string> = {
    "Very High": "bg-[#0a1f12] text-[#4ade80]",
    High:        "bg-[#0a1f12] text-[#86efac]",
    Medium:      "bg-[#1f1800] text-[#fbbf24]",
    Low:         "bg-[#1f0a0a] text-[#f87171]",
  };
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Content Gaps — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          Topics with strong search demand but low supply in boom bap right now.
        </p>
      </div>
      <div className="space-y-px bg-[#1a1a1a]">
        {contentGaps.map((gap, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6 flex gap-5">
            <Target className="w-4 h-4 text-[#4ade80] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-white">{gap.topic}</h3>
                <span className={`shrink-0 text-xs px-2 py-1 ${oppBadge[gap.opportunity]}`}>
                  {gap.opportunity}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-[#94a3b8] mb-3">
                <span>
                  <span className="text-white font-medium">{gap.searches}</span> monthly searches
                </span>
                <span>
                  <span className="text-white font-medium">{gap.supply}</span> competing videos this month
                </span>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{gap.why}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SEOAuditTab() {
  const statusColor: Record<string, string> = {
    Good: "text-[#4ade80]",
    Fair: "text-[#fbbf24]",
    Weak: "text-[#f87171]",
  };
  const overall = Math.round(seoAudit.reduce((s, a) => s + a.score, 0) / seoAudit.length);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">SEO Audit — May 2026</h2>
        <p className="text-[#94a3b8] text-sm">
          How well your channel and videos are optimized for search right now.
        </p>
      </div>

      {/* Overall score */}
      <div className="border border-[#1a1a1a] p-6 mb-6 flex items-center gap-6">
        <div>
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Overall SEO Score</p>
          <p className={`text-5xl font-bold ${scoreColor(overall)}`}>{overall}<span className="text-xl text-[#475569]">/100</span></p>
        </div>
        <div className="flex-1 hidden sm:block">
          <div className="h-2 bg-[#1a1a1a]">
            <div
              className={`h-full transition-all ${scoreBarColor(overall)}`}
              style={{ width: `${overall}%` }}
            />
          </div>
          <p className="text-[#94a3b8] text-xs mt-2">
            Quick wins on descriptions and tags alone could push this to 80+.
          </p>
        </div>
      </div>

      <div className="space-y-px bg-[#1a1a1a]">
        {seoAudit.map((item, i) => (
          <div key={i} className="bg-[#0a0a0a] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <BarChart2 className="w-4 h-4 text-[#64748b] shrink-0" />
                <h3 className="font-semibold text-white">{item.category}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${scoreColor(item.score)}`}>{item.score}</span>
                <span className={`text-xs ${statusColor[item.status]}`}>{item.status}</span>
              </div>
            </div>
            <div className="h-1 bg-[#1a1a1a] mb-4 ml-7">
              <div
                className={`h-full ${scoreBarColor(item.score)}`}
                style={{ width: `${item.score}%` }}
              />
            </div>
            <p className="text-[#94a3b8] text-sm leading-relaxed ml-7 mb-2">{item.finding}</p>
            <p className="text-xs text-[#4ade80] ml-7">
              <span className="text-[#64748b]">Fix: </span>{item.fix}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthForecastTab() {
  const effortColor: Record<string, string> = {
    Low:    "text-[#4ade80] bg-[#0a1f12]",
    Medium: "text-[#fbbf24] bg-[#1f1800]",
    High:   "text-[#f87171] bg-[#1f0a0a]",
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Growth Forecast — Next 90 Days</h2>
        <p className="text-[#94a3b8] text-sm">
          Projected growth with and without applying this month&apos;s recommendations.
        </p>
      </div>

      {/* Current baseline */}
      <div className="border border-[#1a1a1a] p-6 mb-6">
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-1">Current Subscribers</p>
        <p className="text-4xl font-bold">{growthForecast.current.toLocaleString()}</p>
        <p className="text-[#94a3b8] text-sm mt-1">as of May 2026</p>
      </div>

      {/* Projection table */}
      <div className="border border-[#1a1a1a] overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">Month</th>
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">No changes</th>
              <th className="text-left text-xs text-[#4ade80] uppercase tracking-widest px-5 py-4 font-medium">With optimizations</th>
              <th className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">Uplift</th>
            </tr>
          </thead>
          <tbody>
            {growthForecast.projections.map((p, i) => {
              const uplift = p.optimized - p.baseline;
              return (
                <tr key={i} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-4 text-white font-medium">{p.month}</td>
                  <td className="px-5 py-4">
                    <span className="text-white">{p.baseline.toLocaleString()}</span>
                    <span className="text-[#475569] text-xs ml-2">({p.baselineDelta})</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[#4ade80] font-semibold">{p.optimized.toLocaleString()}</span>
                    <span className="text-[#4ade80] text-xs ml-2">({p.optimizedDelta})</span>
                  </td>
                  <td className="px-5 py-4 text-[#94a3b8] text-xs">+{uplift.toLocaleString()} extra</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Milestones */}
      <div className="border border-[#1a1a1a] p-6 mb-6">
        <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-5">Milestones</p>
        <div className="space-y-3">
          {growthForecast.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-2 h-2 shrink-0 ${m.current ? "bg-[#4ade80]" : "bg-[#1a1a1a] border border-[#3a3a3a]"}`} />
              <span className="text-sm text-white font-medium">{m.label}</span>
              <span className="text-sm text-[#94a3b8]">—</span>
              <span className={`text-sm ${m.current ? "text-[#4ade80]" : "text-[#94a3b8]"}`}>{m.eta}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action plan */}
      <div className="border border-[#1a1a1a] p-6">
        <div className="flex items-center gap-2 mb-5">
          <Zap className="w-4 h-4 text-[#fbbf24]" />
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest">Top Actions This Month</p>
        </div>
        <div className="space-y-3">
          {growthForecast.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3">
              <span className="text-[#475569] text-xs font-bold w-4 shrink-0 mt-0.5">{i + 1}.</span>
              <span className="text-sm text-[#cbd5e1] flex-1">{a.action}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[#4ade80]">{a.impact}</span>
                <span className={`text-xs px-2 py-0.5 ${effortColor[a.effort]}`}>{a.effort} effort</span>
              </div>
            </div>
          ))}
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
          Enter your credentials to access your report.
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
            <p className="text-[#f87171] text-xs">Incorrect email or password.</p>
          )}
          <button
            type="submit"
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] transition-colors cursor-pointer"
          >
            Sign in
          </button>
        </form>

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

type Tab =
  | "overview"
  | "keywords"
  | "top-videos"
  | "avoid"
  | "upload-kit"
  | "competitors"
  | "audience"
  | "content-gaps"
  | "seo-audit"
  | "growth-forecast";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",        label: "Overview"       },
  { id: "keywords",        label: "Keywords"       },
  { id: "top-videos",      label: "Top Videos"     },
  { id: "avoid",           label: "What to Avoid"  },
  { id: "upload-kit",      label: "Upload Kit"     },
  { id: "competitors",     label: "Competitors"    },
  { id: "audience",        label: "Audience"       },
  { id: "content-gaps",    label: "Content Gaps"   },
  { id: "seo-audit",       label: "SEO Audit"      },
  { id: "growth-forecast", label: "Growth Forecast"},
];

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="sticky top-0 z-10 bg-[#0a0a0a]">
        <nav className="border-b border-[#1a1a1a] px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="text-sm font-bold tracking-[0.25em]">
              TALLY
            </Link>
            <div className="flex items-center gap-6">
              <span className="text-xs text-[#94a3b8] hidden sm:block">
                {channel.name} · May 2026 Report
              </span>
              <button
                onClick={onSignOut}
                className="text-sm text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
        <div className="border-b border-[#1a1a1a] px-6">
          <div className="max-w-6xl mx-auto flex overflow-x-auto">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 text-sm px-4 py-3.5 border-b-2 transition-colors cursor-pointer ${
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

      <main className="max-w-6xl mx-auto px-6 py-10">
        {tab === "overview"        && <OverviewTab />}
        {tab === "keywords"        && <KeywordsTab />}
        {tab === "top-videos"      && <TopVideosTab />}
        {tab === "avoid"           && <AvoidTab />}
        {tab === "upload-kit"      && <UploadKitTab />}
        {tab === "competitors"     && <CompetitorsTab />}
        {tab === "audience"        && <AudienceTab />}
        {tab === "content-gaps"    && <ContentGapsTab />}
        {tab === "seo-audit"       && <SEOAuditTab />}
        {tab === "growth-forecast" && <GrowthForecastTab />}
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
