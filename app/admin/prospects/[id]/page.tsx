"use client";

// DM Composer (Brief 3) — generates a personalized, copy/paste DM for a
// saved prospect using their real data plus 1-2 lane insights the producer
// picks. No sending automation: everything here is manual copy-paste onto
// Instagram or YouTube.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Prospect {
  id: string;
  channel_id: string;
  channel_name: string;
  subscriber_count: number;
  recent_video_title: string | null;
  lane_id: string;
  artist_name: string;
  status: string;
  created_at: string;
  contacted_at: string | null;
  dm_variation_used: string | null;
}

interface LaneInsight {
  type: string;
  sentence: string;
  rawValue: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Login gate — same shared-secret pattern and lane list as the other
// /admin/* tool pages (each has its own copy of this component). ──

function LoginGate({ onAuth }: { onAuth: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cards/lanes", {
        headers: { "x-admin-password": password },
      });
      if (res.status === 401) setError("Incorrect password.");
      else if (!res.ok) setError("Something went wrong.");
      else onAuth(password);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12">TALLY</Link>
        <h1 className="text-2xl font-bold mb-2">DM Composer</h1>
        <p className="text-[#94a3b8] text-sm mb-8">Enter the admin password to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Password"
            autoFocus
            className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors">
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-3 py-1.5 hover:border-[#333] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────

function Composer({ id, password }: { id: string; password: string }) {
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [insights, setInsights] = useState<LaneInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [variations, setVariations] = useState<string[] | null>(null);
  const [usedLLM, setUsedLLM] = useState(true);

  const [markingIndex, setMarkingIndex] = useState<number | null>(null);

  const loadProspect = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/prospects/${id}`, { headers: { "x-admin-password": password } });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load prospect");
        return;
      }
      setProspect(data.prospect);
    } catch {
      setLoadError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [id, password]);

  useEffect(() => { loadProspect(); }, [loadProspect]);

  const handleLoadInsights = async () => {
    if (!prospect) return;
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const res = await fetch(`/api/admin/insights?laneId=${encodeURIComponent(prospect.lane_id)}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (!res.ok) {
        setInsightsError(data.error ?? "Failed to load insights");
        return;
      }
      setInsights(data.insights ?? []);
    } catch {
      setInsightsError("Network error.");
    } finally {
      setInsightsLoading(false);
    }
  };

  const toggleInsight = (sentence: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sentence)) {
        next.delete(sentence);
      } else if (next.size < 2) {
        next.add(sentence);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selected.size) return;
    setGenerating(true);
    setGenerateError("");
    setVariations(null);
    try {
      const res = await fetch(`/api/admin/prospects/${id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ selectedInsights: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "Failed to generate DM");
        return;
      }
      setVariations(data.variations);
      setUsedLLM(data.usedLLM);
    } catch {
      setGenerateError("Network error.");
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkContacted = async (variationIndex: number) => {
    if (!variations) return;
    setMarkingIndex(variationIndex);
    try {
      const res = await fetch(`/api/admin/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ status: "contacted", dmVariationUsed: variations[variationIndex] }),
      });
      const data = await res.json();
      if (res.ok) setProspect(data.prospect);
    } finally {
      setMarkingIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !prospect) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-[#f87171] text-sm mb-4">{loadError || "Prospect not found."}</p>
          <Link href="/admin/prospects" className="text-[#94a3b8] text-sm hover:text-white transition-colors">← Back to Prospects</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin/prospects" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Back to Prospects</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Prospect context */}
        <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 mb-8">
          <div className="flex items-start justify-between gap-3 mb-2">
            <a
              href={`https://youtube.com/channel/${prospect.channel_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold hover:text-[#94a3b8] transition-colors"
            >
              {prospect.channel_name}
            </a>
            <span className="text-xs text-[#94a3b8] shrink-0">{formatCount(prospect.subscriber_count)} subs</span>
          </div>
          {prospect.recent_video_title && (
            <p className="text-[#cbd5e1] text-sm leading-relaxed mb-3">{prospect.recent_video_title}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest">Lane</span>
            <span className="text-xs text-white bg-[#111] px-2 py-0.5">{prospect.artist_name}</span>
            <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest ml-2">Status</span>
            <span className={`text-xs px-2 py-0.5 ${prospect.status === "contacted" ? "text-[#4ade80] bg-[#4ade80]/10" : "text-[#94a3b8] bg-[#111]"}`}>
              {prospect.status}
            </span>
          </div>
          {prospect.contacted_at && (
            <p className="text-[10px] text-[#475569] mt-2">
              Contacted {new Date(prospect.contacted_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Insights */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Lane Insights</h2>
            <button
              onClick={handleLoadInsights}
              disabled={insightsLoading}
              className="text-xs text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-3 py-1.5 hover:border-[#333] transition-colors disabled:opacity-40"
            >
              {insightsLoading ? "Loading..." : insights.length ? "Reload Insights" : "Load Insights"}
            </button>
          </div>

          {insightsError && <p className="text-[#f87171] text-sm mb-3">{insightsError}</p>}

          {insights.length === 0 ? (
            <p className="text-[#475569] text-sm">Load insights to pick 1-2 facts to include in the DM.</p>
          ) : (
            <div>
              <p className="text-[10px] text-[#94a3b8] uppercase tracking-widest mb-3">Pick up to 2</p>
              <div className="flex flex-col gap-2">
                {insights.map((insight, i) => {
                  const isSelected = selected.has(insight.sentence);
                  const disabled = !isSelected && selected.size >= 2;
                  return (
                    <button
                      key={i}
                      onClick={() => toggleInsight(insight.sentence)}
                      disabled={disabled}
                      className={`text-left text-sm px-4 py-3 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-[#e8833a] bg-[#e8833a]/10 text-white"
                          : "border-[#1a1a1a] bg-[#0d0d0d] text-[#cbd5e1] hover:border-[#333]"
                      }`}
                    >
                      {insight.sentence}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={!selected.size || generating}
            className="text-sm font-semibold px-5 py-3 hover:brightness-110 disabled:opacity-40 transition-all"
            style={{ backgroundColor: "#e8833a", color: "#0a0a0a" }}
          >
            {generating ? "Generating..." : "Generate DM"}
          </button>
          {generateError && <p className="text-[#f87171] text-sm mt-3">{generateError}</p>}
        </div>

        {/* Generated variations */}
        {variations && (
          <div className="space-y-4">
            {!usedLLM && (
              <p className="text-[10px] text-[#94a3b8] uppercase tracking-widest">Template fallback (LLM unavailable)</p>
            )}
            {variations.map((text, i) => (
              <div key={i} className="border border-[#1a1a1a] bg-[#0d0d0d] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest">Variation {i === 0 ? "A" : "B"}</span>
                  <div className="flex items-center gap-2">
                    <CopyButton text={text} />
                    <button
                      onClick={() => handleMarkContacted(i)}
                      disabled={markingIndex !== null}
                      className="text-xs text-[#4ade80] border border-[#4ade80]/30 px-3 py-1.5 hover:border-[#4ade80] hover:text-white transition-colors disabled:opacity-40"
                    >
                      {markingIndex === i ? "Marking..." : "Mark as Contacted"}
                    </button>
                  </div>
                </div>
                <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminProspectComposePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [password, setPassword] = useState<string | null>(null);

  if (!password) {
    return <LoginGate onAuth={setPassword} />;
  }
  return <Composer id={id} password={password} />;
}
