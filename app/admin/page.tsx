"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import type { ChannelSnapshot } from "@/lib/channel-snapshot";
import type { OutreachSequence, OutreachMessage } from "@/lib/outreach-sequence";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  genre: string;
  youtube_channel: string;
  created_at: string;
}

interface ProducerProfile {
  id: string;
  name: string;
  email: string;
  subscription_status: string;
  beta_access: boolean;
}

interface Prospect {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscriber_count: number | null;
  latest_video_title: string | null;
  latest_video_url: string | null;
  latest_video_views: number | null;
  genre: string | null;
  email: string | null;
  instagram_handle: string | null;
  contact_method: string | null;
  contact_preference: "instagram" | "email" | null;
  offer_type: "founding" | "standard" | null;
  channel_snapshot: ChannelSnapshot | null;
  outreach_sequence: OutreachSequence | null;
  status: string;
  found_at: string;
  contacted_at: string | null;
  responded_at: string | null;
  signed_up_at: string | null;
  notes: string | null;
}

type Tab = "waitlist" | "beta" | "prospects" | "financials" | "tools";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPreference(p: Prospect): "instagram" | "email" {
  if (p.contact_preference) return p.contact_preference;
  return p.email ? "email" : "instagram";
}

function snapshotStatus(p: Prospect): string {
  if (p.outreach_sequence) return "Sequence ready";
  if (p.channel_snapshot) return "Snapshot ready";
  return "No snapshot";
}

function snapshotStatusColor(p: Prospect): string {
  if (p.outreach_sequence) return "text-[#4ade80]";
  if (p.channel_snapshot) return "text-[#fbbf24]";
  return "text-[#475569]";
}

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginGate({ onAuth }: { onAuth: (entries: WaitlistEntry[], password: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/waitlist", {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (res.status === 401) setError("Incorrect password.");
      else if (!res.ok) setError(data.error ?? "Something went wrong.");
      else onAuth(data.entries, password);
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
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "text-[#94a3b8] bg-[#94a3b8]/10",
    contacted: "text-[#fbbf24] bg-[#fbbf24]/10",
    responded: "text-[#a78bfa] bg-[#a78bfa]/10",
    signed_up: "text-[#4ade80] bg-[#4ade80]/20",
    rejected: "text-[#f87171] bg-[#f87171]/10",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 font-medium ${styles[status] ?? "text-[#94a3b8]"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Waitlist section ──────────────────────────────────────────────────────────

function WaitlistSection({ entries, refreshing, refreshError, onRefresh }: {
  entries: WaitlistEntry[];
  refreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
}) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold mb-1">Waitlist Signups</h2>
          <p className="text-[#94a3b8] text-sm">{entries.length} {entries.length === 1 ? "signup" : "signups"} total</p>
        </div>
        <button onClick={onRefresh} disabled={refreshing}
          className="text-sm text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-4 py-2 hover:border-[#333] transition-colors disabled:opacity-40">
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {refreshError && <p className="text-red-400 text-sm mb-6">{refreshError}</p>}
      {entries.length === 0 ? (
        <div className="border border-[#1a1a1a] p-16 text-center">
          <p className="text-[#94a3b8] text-sm">No signups yet.</p>
        </div>
      ) : (
        <div className="border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                {["Name", "Email", "Genre", "YouTube Channel", "Date Signed Up"].map((h) => (
                  <th key={h} className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-4 text-white font-medium">{entry.name}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{entry.email}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{entry.genre}</td>
                  <td className="px-5 py-4 max-w-[220px]">
                    <a href={entry.youtube_channel} target="_blank" rel="noopener noreferrer"
                      className="text-[#94a3b8] hover:text-white transition-colors truncate block" title={entry.youtube_channel}>
                      {entry.youtube_channel}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-[#94a3b8] whitespace-nowrap">{fmt(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Beta section ──────────────────────────────────────────────────────────────

function BetaSection({ producers, loading, betaAction, onRefresh, onToggle }: {
  producers: ProducerProfile[];
  loading: boolean;
  betaAction: string | null;
  onRefresh: () => void;
  onToggle: (id: string, grant: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Beta Access</h2>
          <p className="text-[#94a3b8] text-sm">Grant or revoke free access for beta producers.</p>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="text-sm text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-4 py-2 hover:border-[#333] transition-colors disabled:opacity-40">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {loading ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
        </div>
      ) : producers.length === 0 ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <p className="text-[#94a3b8] text-sm">No producers found.</p>
        </div>
      ) : (
        <div className="border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                {["Name", "Email", "Status", "Beta Access", "Action"].map((h) => (
                  <th key={h} className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {producers.map((p) => (
                <tr key={p.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors">
                  <td className="px-5 py-4 text-white font-medium">{p.name || "—"}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{p.email}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{p.subscription_status}</td>
                  <td className="px-5 py-4">
                    {p.beta_access
                      ? <span className="text-xs text-[#a78bfa] font-semibold">Beta</span>
                      : <span className="text-xs text-[#475569]">None</span>}
                  </td>
                  <td className="px-5 py-4">
                    {p.beta_access ? (
                      <button onClick={() => onToggle(p.id, false)} disabled={betaAction === p.id}
                        className="text-xs text-[#f87171] hover:text-white border border-[#f87171]/30 px-3 py-1 hover:border-[#f87171] transition-colors disabled:opacity-40">
                        {betaAction === p.id ? "…" : "Revoke"}
                      </button>
                    ) : (
                      <button onClick={() => onToggle(p.id, true)} disabled={betaAction === p.id}
                        className="text-xs text-[#4ade80] hover:text-white border border-[#4ade80]/30 px-3 py-1 hover:border-[#4ade80] transition-colors disabled:opacity-40">
                        {betaAction === p.id ? "…" : "Grant"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sequence panel ────────────────────────────────────────────────────────────

function SequencePanel({ sequence, onMarkSent }: {
  sequence: OutreachSequence;
  onMarkSent: (index: number) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copy = (msg: OutreachMessage, i: number) => {
    const text = msg.subject ? `Subject: ${msg.subject}\n\n${msg.body}` : msg.body;
    navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const sentCount = sequence.messages.filter((m) => m.sent).length;

  return (
    <div className="space-y-1">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-1">
          {sequence.messages.map((m, i) => (
            <div key={i}
              className={`w-6 h-1.5 ${m.sent ? "bg-[#4ade80]" : "bg-[#1e1e1e]"}`} />
          ))}
        </div>
        <span className="text-[10px] text-[#94a3b8]">
          {sentCount}/{sequence.messages.length} sent
          {sequence.format === "instagram" ? " · Instagram DM" : " · Email"}
        </span>
      </div>

      {sequence.messages.map((msg, i) => (
        <div key={i} className="border border-[#1a1a1a]">
          {/* Accordion header */}
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#111] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              {msg.sent ? (
                <span className="text-[10px] text-[#4ade80] font-bold">✓</span>
              ) : (
                <span className="text-[10px] text-[#94a3b8] font-mono">{i + 1}</span>
              )}
              <span className={`text-xs font-medium ${msg.sent ? "text-[#4ade80]" : "text-[#e2e8f0]"}`}>
                {msg.label}
              </span>
              {msg.sent && msg.sent_at && (
                <span className="text-[10px] text-[#94a3b8]">
                  Sent {new Date(msg.sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <span className="text-[#94a3b8] text-xs">{openIndex === i ? "▲" : "▼"}</span>
          </button>

          {/* Accordion body */}
          {openIndex === i && (
            <div className="px-4 pb-4 space-y-3 border-t border-[#1a1a1a]">
              {msg.subject && (
                <div className="mt-3">
                  <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mb-1">Subject</p>
                  <p className="text-xs text-[#e2e8f0] bg-[#111] px-3 py-2 border border-[#1a1a1a]">{msg.subject}</p>
                </div>
              )}
              <div className={msg.subject ? "" : "mt-3"}>
                {!msg.subject && <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mb-1">Message</p>}
                <pre className="text-xs text-white whitespace-pre-wrap font-sans leading-relaxed bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-3">
                  {msg.body}
                </pre>
                {sequence.format === "instagram" && (
                  <p className={`text-[9px] text-right mt-1 ${msg.body.length > 900 ? "text-[#f87171]" : "text-[#94a3b8]"}`}>
                    {msg.body.length}/1000
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copy(msg, i)}
                  className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-3 py-1.5 hover:border-[#333] transition-colors"
                >
                  {copiedIndex === i ? "Copied!" : "Copy"}
                </button>
                {!msg.sent && (
                  <button
                    onClick={() => onMarkSent(i)}
                    className="text-[10px] text-[#4ade80] border border-[#4ade80]/30 px-3 py-1.5 hover:border-[#4ade80] hover:text-white transition-colors"
                  >
                    Mark as sent
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Producer finder ───────────────────────────────────────────────────────────

const GENRES = ["Trap", "Drill", "Boom Bap", "Lo-Fi", "R&B", "Pop", "Afrobeats", "Reggaeton", "UK Drill", "Jersey Club"];

const STATUS_OPTIONS = ["all", "pending", "contacted", "responded", "signed_up", "rejected"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function ProspectFinderSection({ password }: { password: string }) {
  // Search
  const [searchMode, setSearchMode] = useState<"genre" | "artist">("genre");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Trap", "Drill"]);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistInput, setArtistInput] = useState("");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  const [findResult, setFindResult] = useState<string | null>(null);

  // Prospects
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [contactFilter, setContactFilter] = useState<"all" | "email" | "instagram" | "check_manually">("all");

  // Row actions
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snapshotLoadingId, setSnapshotLoadingId] = useState<string | null>(null);
  const [sequenceLoadingId, setSequenceLoadingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<Record<string, string>>({});
  const [sequenceError, setSequenceError] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "subs">("date");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [tabVisible, setTabVisible] = useState(true);

  const loadProspects = useCallback(async () => {
    setLoadingProspects(true);
    try {
      const res = await fetch("/api/admin/prospects", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setProspects(data.prospects ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingProspects(false); }
  }, [password]);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  const updateProspect = async (id: string, updates: Record<string, unknown>) => {
    setActionId(id);
    try {
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) await loadProspects();
    } finally { setActionId(null); }
  };

  const handleFind = async () => {
    if (searchMode === "genre" && selectedGenres.length === 0) return;
    if (searchMode === "artist" && artists.length === 0) return;
    setFinding(true); setFindError(""); setFindResult(null);
    try {
      const body = searchMode === "artist"
        ? { mode: "artist", artists, maxResults: 30 }
        : { mode: "genre", genres: selectedGenres, maxResults: 30 };
      const res = await fetch("/api/admin/find-producers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setFindResult(data.count > 0
          ? `Found ${data.count} new prospect${data.count === 1 ? "" : "s"}`
          : "No new prospects found");
        await loadProspects();
      } else {
        setFindError(data.error ?? "Failed to find producers");
      }
    } catch { setFindError("Network error"); }
    finally { setFinding(false); }
  };

  const handleClearAll = async () => {
    if (!confirm("Delete all prospects? This cannot be undone.")) return;
    setFindResult(null); setFindError("");
    try {
      const res = await fetch("/api/admin/prospects", {
        method: "DELETE",
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (res.ok) {
        setFindResult(`Deleted ${data.deleted} prospect${data.deleted === 1 ? "" : "s"}`);
        await loadProspects();
      } else {
        setFindError(data.error ?? "Failed to clear");
      }
    } catch { setFindError("Network error"); }
  };

  const handleGenerateSnapshot = async (p: Prospect) => {
    setSnapshotLoadingId(p.id);
    setSnapshotError((e) => { const n = { ...e }; delete n[p.id]; return n; });
    try {
      const res = await fetch("/api/admin/generate-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ prospect_id: p.id }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadProspects();
      } else {
        setSnapshotError((e) => ({ ...e, [p.id]: data.error ?? "Failed" }));
      }
    } catch {
      setSnapshotError((e) => ({ ...e, [p.id]: "Network error" }));
    } finally { setSnapshotLoadingId(null); }
  };

  const handleSetContactPreference = async (p: Prospect, pref: "instagram" | "email") => {
    await updateProspect(p.id, { contact_preference: pref });
  };

  const handleSetOfferType = async (p: Prospect, offerType: "founding" | "standard") => {
    await updateProspect(p.id, { offer_type: offerType });
  };

  const handleGenerateSequence = async (p: Prospect) => {
    setSequenceLoadingId(p.id);
    setSequenceError((e) => { const n = { ...e }; delete n[p.id]; return n; });
    try {
      const res = await fetch("/api/admin/generate-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ prospect_id: p.id, format: getPreference(p) }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadProspects();
        setExpandedId(p.id);
      } else {
        setSequenceError((e) => ({ ...e, [p.id]: data.error ?? "Failed" }));
      }
    } catch {
      setSequenceError((e) => ({ ...e, [p.id]: "Network error" }));
    } finally { setSequenceLoadingId(null); }
  };

  const handleGeneratePdf = async (p: Prospect) => {
    setPdfLoadingId(p.id);
    try {
      const res = await fetch("/api/admin/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ prospect_id: p.id }),
      });
      const data = await res.json();
      if (res.ok && data.base64) {
        // Trigger download
        const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename ?? "tally-report.pdf";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert(data.error ?? "PDF generation failed");
      }
    } catch {
      alert("Network error generating PDF");
    } finally { setPdfLoadingId(null); }
  };

  const handleMarkMessageSent = async (p: Prospect, msgIndex: number) => {
    if (!p.outreach_sequence) return;
    const updated: OutreachSequence = {
      ...p.outreach_sequence,
      messages: p.outreach_sequence.messages.map((m, i) =>
        i === msgIndex ? { ...m, sent: true, sent_at: new Date().toISOString() } : m
      ),
    };

    // If Message 1 is now sent → status = contacted
    const extraUpdates: Record<string, unknown> = { outreach_sequence: updated };
    if (msgIndex === 0 && !p.contacted_at) {
      extraUpdates.status = "contacted";
      extraUpdates.contacted_at = new Date().toISOString();
    }
    await updateProspect(p.id, extraUpdates);
  };

  const handleSignedUp = async (p: Prospect) => {
    await updateProspect(p.id, {
      status: "signed_up",
      signed_up_at: new Date().toISOString(),
      ...(p.email ? { grant_beta: true, email: p.email } : {}),
    });
  };

  const handleAddArtist = () => {
    const t = artistInput.trim();
    if (t && !artists.includes(t) && artists.length < 5) {
      setArtists((a) => [...a, t]);
      setArtistInput("");
    }
  };

  const handleReject = async (p: Prospect) => {
    setRejectingId(p.id);
    await new Promise<void>((r) => setTimeout(r, 280));
    await updateProspect(p.id, { status: "rejected" });
    setRejectingId(null);
  };

  const handleTabChange = (tab: StatusFilter) => {
    setTabVisible(false);
    setTimeout(() => { setStatusFilter(tab); setTabVisible(true); }, 150);
  };

  // Stats
  const total = prospects.length;
  const contacted = prospects.filter((p) => ["contacted", "responded", "signed_up"].includes(p.status)).length;
  const responded = prospects.filter((p) => ["responded", "signed_up"].includes(p.status)).length;
  const signedUp = prospects.filter((p) => p.status === "signed_up").length;
  const nonRejected = prospects.filter((p) => p.status !== "rejected");

  const statusCounts: Record<StatusFilter, number> = {
    all: nonRejected.length,
    pending: prospects.filter((p) => p.status === "pending").length,
    contacted: prospects.filter((p) => p.status === "contacted").length,
    responded: prospects.filter((p) => p.status === "responded").length,
    signed_up: signedUp,
    rejected: prospects.filter((p) => p.status === "rejected").length,
  };

  const byStatus = statusFilter === "all"
    ? nonRejected
    : prospects.filter((p) => p.status === statusFilter);

  const sorted = [...byStatus]
    .filter((p) => !searchQuery || p.channel_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "subs") return (b.subscriber_count ?? 0) - (a.subscriber_count ?? 0);
      return new Date(b.found_at).getTime() - new Date(a.found_at).getTime();
    });

  return (
    <div>
      {/* Header + search/sort */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Producer Finder</h2>
          <p className="text-[10px] text-[#94a3b8]">
            Finding: Free · Snapshot: ~$0.01 (Claude) · Sequence: ~$0.03 (Claude) · PDF: Free
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels..."
            className="bg-[#111] border border-[#1e1e1e] px-3 py-2 text-xs text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] w-44"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "subs")}
            className="bg-[#111] border border-[#1e1e1e] px-3 py-2 text-xs text-[#94a3b8] focus:outline-none"
          >
            <option value="date">Date found</option>
            <option value="subs">Subscribers</option>
          </select>
        </div>
      </div>

      {/* Search mode tabs */}
      <div className="flex gap-1 border-b border-[#1a1a1a] mb-6">
        {(["genre", "artist"] as const).map((mode) => (
          <button key={mode} onClick={() => setSearchMode(mode)}
            className={`text-xs px-4 py-2.5 border-b-2 -mb-px transition-colors ${
              searchMode === mode
                ? "border-white text-white font-semibold"
                : "border-transparent text-[#94a3b8] hover:text-white"
            }`}>
            {mode === "genre" ? "Genre Search" : "Artist Search"}
          </button>
        ))}
      </div>

      {searchMode === "genre" && (
        <div className="mb-5">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Genres</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button key={g}
                onClick={() => setSelectedGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                className={`text-xs px-3 py-1.5 border transition-colors ${
                  selectedGenres.includes(g) ? "bg-white text-black border-white" : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {searchMode === "artist" && (
        <div className="mb-5">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Artists (up to 5)</p>
          <div className="flex gap-2 mb-3">
            <input type="text" value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddArtist()}
              placeholder="e.g. Nas, Drake, J Cole"
              className="flex-1 bg-[#111] border border-[#1e1e1e] px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a]" />
            <button onClick={handleAddArtist} disabled={!artistInput.trim() || artists.length >= 5}
              className="text-xs border border-[#1a1a1a] px-4 py-2 text-[#94a3b8] hover:text-white hover:border-[#333] disabled:opacity-30 transition-colors">
              Add
            </button>
          </div>
          {artists.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {artists.map((a) => (
                <span key={a} className="flex items-center gap-2 text-xs text-[#e2e8f0] bg-[#111] border border-[#1e1e1e] px-3 py-1.5">
                  {a}
                  <button onClick={() => setArtists((prev) => prev.filter((x) => x !== a))}
                    className="text-[#94a3b8] hover:text-[#f87171] transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[#94a3b8] mt-2">Sub range 200–2,000</p>
        </div>
      )}

      {/* Find + clear */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <button onClick={handleFind}
          disabled={finding || (searchMode === "genre" ? selectedGenres.length === 0 : artists.length === 0)}
          className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors">
          {finding ? "Searching YouTube..." : "Find Producers"}
        </button>
        <button onClick={handleClearAll} disabled={finding || prospects.length === 0}
          className="text-xs text-[#f87171] border border-[#f87171]/30 px-4 py-2 hover:border-[#f87171] hover:text-white transition-colors disabled:opacity-30">
          Clear All
        </button>
        {findResult && <p className="text-sm text-[#4ade80]">{findResult}</p>}
        {findError && <p className="text-sm text-[#f87171]">{findError}</p>}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { label: "Total Found",    value: total,    color: "text-white" },
          { label: "Contacted",      value: contacted, color: "text-[#60a5fa]" },
          { label: "Response Rate",  value: contacted > 0 ? `${Math.round((responded / contacted) * 100)}%` : "—", color: "text-[#a78bfa]" },
          { label: "Signed Up",      value: signedUp, color: "text-[#4ade80]" },
          { label: "Conversion",     value: contacted > 0 ? `${Math.round((signedUp / contacted) * 100)}%` : "—", color: "text-[#4ade80]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0d0d0d] border border-[#1a1a1a] px-4 py-4">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Pill tab navigation */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {([
          { key: "all"       as const, label: "All" },
          { key: "pending"   as const, label: "Pending" },
          { key: "contacted" as const, label: "Contacted" },
          { key: "responded" as const, label: "Responded" },
          { key: "signed_up" as const, label: "Signed Up" },
          { key: "rejected"  as const, label: "Rejected" },
        ]).map(({ key, label }) => {
          const isActive = statusFilter === key;
          const activeClass =
            key === "rejected"  ? "bg-[#f87171]/10 border-[#f87171]/40 text-[#f87171]"
            : key === "signed_up" ? "bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]"
            : key === "responded" ? "bg-[#a78bfa]/10 border-[#a78bfa]/40 text-[#a78bfa]"
            : key === "contacted" ? "bg-[#60a5fa]/10 border-[#60a5fa]/40 text-[#60a5fa]"
            : "bg-white/10 border-white/20 text-white";
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`text-xs px-4 py-1.5 rounded-full border transition-all duration-200 ${
                isActive ? activeClass : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
              }`}
            >
              {label}
              <span className="ml-1.5 opacity-50">({statusCounts[key]})</span>
            </button>
          );
        })}
      </div>

      {/* Prospect cards */}
      {loadingProspects ? (
        <div className="border border-[#1a1a1a] p-12 text-center">
          <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="border border-[#1a1a1a] p-12 text-center">
          <p className="text-[#94a3b8] text-sm">
            {prospects.length === 0
              ? 'No prospects yet. Select genres and click "Find Producers".'
              : "No prospects in this view."}
          </p>
        </div>
      ) : (
        <div
          className="space-y-2 transition-opacity duration-150"
          style={{ opacity: tabVisible ? 1 : 0 }}
        >
          {sorted.map((p) => {
            const pref = getPreference(p);
            const isExpanded = expandedId === p.id;
            const hasSnapshot = !!p.channel_snapshot;
            const hasSequence = !!p.outreach_sequence;
            const isRejecting = rejectingId === p.id;

            const statusDotColor =
              p.status === "signed_up"  ? "bg-[#a78bfa]"
              : p.status === "responded"  ? "bg-[#4ade80]"
              : p.status === "contacted"  ? "bg-[#60a5fa]"
              : p.status === "rejected"   ? "bg-[#f87171]"
              : "bg-[#2a2a2a]";

            const subScore = Math.min(100, Math.round(((p.subscriber_count ?? 0) / 2000) * 100));
            const scoreColor = subScore >= 70 ? "#4ade80" : subScore >= 40 ? "#fbbf24" : "#94a3b8";

            return (
              <div
                key={p.id}
                className="transition-all duration-300"
                style={{
                  opacity: isRejecting ? 0 : 1,
                  transform: isRejecting ? "translateX(24px)" : "translateX(0)",
                }}
              >
                <div className="border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#252525] transition-colors duration-200">
                  <div className="p-5">

                    {/* Row 1: status dot + name + snapshot dot + status badge */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
                        <a
                          href={p.channel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white font-bold text-sm hover:text-[#94a3b8] transition-colors truncate"
                        >
                          {p.channel_name}
                        </a>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            hasSequence ? "bg-[#4ade80]" : hasSnapshot ? "bg-[#fbbf24]" : "bg-[#222]"
                          }`}
                          title={hasSequence ? "Sequence ready" : hasSnapshot ? "Snapshot ready" : "No snapshot"}
                        />
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    {/* Row 2: meta — subs, genre, contact badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[11px] text-[#e2e8f0]">
                        {p.subscriber_count?.toLocaleString() ?? "—"} subs
                      </span>
                      {p.genre && (
                        <span className="text-[10px] text-[#e2e8f0] bg-[#111] px-2 py-0.5">
                          {p.genre}
                        </span>
                      )}
                      {p.email ? (
                        <span className="text-[10px] font-medium text-[#60a5fa] bg-[#60a5fa]/10 px-2 py-0.5">
                          {p.email}
                        </span>
                      ) : p.instagram_handle ? (
                        <span className="text-[10px] font-medium text-[#4ade80] bg-[#4ade80]/10 px-2 py-0.5">
                          @{p.instagram_handle}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-[#94a3b8] bg-[#111] px-2 py-0.5">
                          No contact
                        </span>
                      )}
                    </div>

                    {/* Subscriber score bar */}
                    <div className="w-full h-px bg-[#1a1a1a] mb-3">
                      <div
                        className="h-full transition-all duration-700"
                        style={{ width: `${subScore}%`, backgroundColor: scoreColor, opacity: 0.7 }}
                      />
                    </div>

                    {/* Latest video */}
                    {p.latest_video_title && (
                      <p className="text-[11px] text-[#cbd5e1] truncate mb-2">
                        {p.latest_video_title}
                      </p>
                    )}

                    {/* Insight preview (collapsed) */}
                    {hasSnapshot && !isExpanded && (
                      <p className="text-[10px] text-[#94a3b8] truncate mb-3 leading-relaxed">
                        ▸ {p.channel_snapshot!.top_insight}
                      </p>
                    )}

                    {/* Action row 1 — generate / toggles */}
                    <div className="flex items-center gap-1.5 flex-wrap border-t border-[#111] pt-3 mt-1">
                      {/* Contact toggle */}
                      <div className="flex border border-[#1a1a1a]">
                        <button
                          onClick={() => handleSetContactPreference(p, "instagram")}
                          disabled={actionId === p.id}
                          className={`text-[10px] px-2.5 py-1 transition-colors ${
                            pref === "instagram"
                              ? "bg-[#4ade80]/10 text-[#4ade80] border-r border-[#1a1a1a]"
                              : "text-[#94a3b8] border-r border-[#1a1a1a] hover:text-white"
                          }`}>
                          IG DM
                        </button>
                        <button
                          onClick={() => handleSetContactPreference(p, "email")}
                          disabled={actionId === p.id}
                          className={`text-[10px] px-2.5 py-1 transition-colors ${
                            pref === "email"
                              ? "bg-[#60a5fa]/10 text-[#60a5fa]"
                              : "text-[#94a3b8] hover:text-white"
                          }`}>
                          Email
                        </button>
                      </div>

                      {/* Offer toggle */}
                      <div className="flex border border-[#1a1a1a]">
                        <button
                          onClick={() => handleSetOfferType(p, "founding")}
                          disabled={actionId === p.id}
                          className={`text-[10px] px-2.5 py-1 transition-colors ${
                            (p.offer_type ?? "founding") === "founding"
                              ? "bg-[#fbbf24]/10 text-[#fbbf24] border-r border-[#1a1a1a]"
                              : "text-[#94a3b8] border-r border-[#1a1a1a] hover:text-white"
                          }`}>
                          Founding
                        </button>
                        <button
                          onClick={() => handleSetOfferType(p, "standard")}
                          disabled={actionId === p.id}
                          className={`text-[10px] px-2.5 py-1 transition-colors ${
                            (p.offer_type ?? "founding") === "standard"
                              ? "bg-[#94a3b8]/10 text-[#94a3b8]"
                              : "text-[#94a3b8] hover:text-white"
                          }`}>
                          Standard
                        </button>
                      </div>

                      {/* Snapshot */}
                      <button
                        onClick={() => handleGenerateSnapshot(p)}
                        disabled={snapshotLoadingId === p.id}
                        className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 inline-flex items-center gap-1 ${
                          hasSnapshot
                            ? "border-[#fbbf24]/30 text-[#fbbf24] hover:border-[#fbbf24] hover:text-white"
                            : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                        }`}>
                        {snapshotLoadingId === p.id ? (
                          <><span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />Analyzing</>
                        ) : hasSnapshot ? "Re-snapshot" : "Snapshot (~$0.01)"}
                      </button>

                      {/* Sequence */}
                      <button
                        onClick={() => handleGenerateSequence(p)}
                        disabled={sequenceLoadingId === p.id || !hasSnapshot}
                        className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 inline-flex items-center gap-1 ${
                          !hasSnapshot
                            ? "border-[#1a1a1a] text-[#475569] cursor-not-allowed"
                            : hasSequence
                            ? "border-[#a78bfa]/30 text-[#a78bfa] hover:border-[#a78bfa] hover:text-white"
                            : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                        }`}>
                        {sequenceLoadingId === p.id ? (
                          <><span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />Generating</>
                        ) : hasSequence ? "Regenerate (~$0.03)" : "Sequence (~$0.03)"}
                      </button>

                      {/* PDF */}
                      <button
                        onClick={() => handleGeneratePdf(p)}
                        disabled={pdfLoadingId === p.id || !hasSnapshot}
                        className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 ${
                          !hasSnapshot
                            ? "border-[#1a1a1a] text-[#475569] cursor-not-allowed"
                            : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                        }`}>
                        {pdfLoadingId === p.id ? "Building..." : "PDF"}
                      </button>
                    </div>

                    {/* Action row 2 — status transitions */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {hasSequence && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/30 px-2.5 py-1 hover:border-[#a78bfa] hover:text-white transition-colors">
                          {isExpanded ? "Hide Messages" : "View Messages"}
                        </button>
                      )}
                      {p.status === "contacted" && (
                        <button
                          onClick={() => updateProspect(p.id, { status: "responded", responded_at: new Date().toISOString() })}
                          disabled={actionId === p.id}
                          className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/30 px-2.5 py-1 hover:border-[#a78bfa] hover:text-white transition-colors disabled:opacity-40">
                          They replied!
                        </button>
                      )}
                      {!["signed_up", "rejected"].includes(p.status) && (
                        <button
                          onClick={() => handleSignedUp(p)}
                          disabled={actionId === p.id}
                          className="text-[10px] text-[#4ade80] border border-[#4ade80]/30 px-2.5 py-1 hover:border-[#4ade80] hover:text-white transition-colors disabled:opacity-40">
                          Signed up!
                        </button>
                      )}
                      {!["rejected", "signed_up"].includes(p.status) && (
                        <button
                          onClick={() => handleReject(p)}
                          disabled={actionId === p.id || isRejecting}
                          className="text-[10px] text-[#94a3b8] hover:text-[#f87171] transition-colors disabled:opacity-40 ml-auto">
                          Reject
                        </button>
                      )}
                    </div>

                    {/* Errors */}
                    {snapshotError[p.id] && (
                      <p className="text-[10px] text-[#f87171] mt-2">Snapshot: {snapshotError[p.id]}</p>
                    )}
                    {sequenceError[p.id] && (
                      <p className="text-[10px] text-[#f87171] mt-1">Sequence: {sequenceError[p.id]}</p>
                    )}
                  </div>

                  {/* Sequence accordion — smooth height transition */}
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isExpanded ? "3000px" : "0" }}
                  >
                    {p.outreach_sequence && (
                      <div className="px-5 pb-5 border-t border-[#111]">
                        <div className="mt-4">
                          <SequencePanel
                            sequence={p.outreach_sequence}
                            onMarkSent={(i) => handleMarkMessageSent(p, i)}
                          />
                        </div>
                        {hasSnapshot && (
                          <div className="mt-4 pt-4 border-t border-[#111] space-y-2">
                            <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mb-2">Channel Analysis</p>
                            {[
                              { label: "Top insight",    value: p.channel_snapshot!.top_insight },
                              { label: "Gap",            value: p.channel_snapshot!.positioning_gap },
                              { label: "Title pattern",  value: p.channel_snapshot!.title_pattern },
                              { label: "Recommendation", value: p.channel_snapshot!.recommendation },
                            ].map(({ label, value }) => (
                              <div key={label} className="flex gap-3">
                                <span className="text-[10px] text-[#94a3b8] w-28 shrink-0">{label}</span>
                                <span className="text-[10px] text-[#e2e8f0] leading-relaxed">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Financials ────────────────────────────────────────────────────────────────

interface FinancialData {
  month: string;
  stripe: {
    activeCount: number;
    trialCount: number;
    cancelledCount: number;
    newCount: number;
    mrr: number;
    churnRate: number;
    projectedNextMonth: number;
  };
  variableCosts: { item: string; type: "variable"; amount: number; count: number }[];
  fixedCosts: { item: string; type: "fixed"; amount: number }[];
  summary: {
    totalVariable: number;
    totalFixed: number;
    totalCosts: number;
    mrr: number;
    netProfit: number;
    marginPct: number;
    costPerSub: number;
  };
  foundingMember: {
    exists: boolean;
    timesRedeemed: number;
    maxRedemptions: number;
    valid: boolean;
  } | null;
}

function buildMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

function fmt$(n: number): string {
  return `$${n.toFixed(2)}`;
}

function FinancialsSection({ password }: { password: string }) {
  const monthOptions = buildMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [couponMsg, setCouponMsg] = useState("");

  const loadData = useCallback(async (month: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/financials?month=${month}`, {
        headers: { "x-admin-password": password },
      });
      const d = await res.json();
      if (res.ok) setData(d);
      else setError(d.error ?? "Failed to load financials");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { loadData(selectedMonth); }, [loadData, selectedMonth]);

  const handleCheckCoupon = async () => {
    setCouponMsg("");
    try {
      const res = await fetch("/api/admin/create-founding-coupon", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const d = await res.json();
      if (res.ok) {
        setCouponMsg("FOUNDING20 is active in Stripe.");
        await loadData(selectedMonth);
      } else {
        setCouponMsg(d.error ?? "Not found.");
      }
    } catch {
      setCouponMsg("Network error");
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-6">Financials</h2>
        <div className="border border-[#1a1a1a] p-12 text-center">
          <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-6">Financials</h2>
        <p className="text-[#f87171] text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { stripe, variableCosts, fixedCosts, summary, foundingMember } = data;
  const isProfit = summary.netProfit >= 0;

  return (
    <div>
      {/* Header + month selector */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Financials</h2>
          <p className="text-[#94a3b8] text-sm">Revenue, costs, and margins for TALLY.</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-[#111] border border-[#1e1e1e] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1a1a1a] mb-8">
        <div className="bg-[#0a0a0a] px-5 py-5 text-center">
          <p className={`text-2xl font-bold ${stripe.mrr > 0 ? "text-[#4ade80]" : "text-white"}`}>
            {fmt$(stripe.mrr)}
          </p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">Monthly Revenue</p>
        </div>
        <div className="bg-[#0a0a0a] px-5 py-5 text-center">
          <p className="text-2xl font-bold">{stripe.activeCount}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">Active Subscribers</p>
        </div>
        <div className="bg-[#0a0a0a] px-5 py-5 text-center">
          <p className={`text-2xl font-bold ${isProfit ? "text-[#4ade80]" : "text-[#f87171]"}`}>
            {fmt$(summary.netProfit)}
          </p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">Net Profit</p>
        </div>
        <div className="bg-[#0a0a0a] px-5 py-5 text-center">
          <p className={`text-2xl font-bold ${isProfit ? "text-[#4ade80]" : "text-[#f87171]"}`}>
            {summary.marginPct.toFixed(1)}%
          </p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">Profit Margin</p>
        </div>
      </div>

      {/* Revenue section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="border border-[#1a1a1a] p-6">
          <h3 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-5">Revenue</h3>
          <div className="space-y-3">
            {[
              { label: "MRR", value: fmt$(stripe.mrr) },
              { label: "New this month", value: `${stripe.newCount} subscribers` },
              { label: "Churned this month", value: `${stripe.cancelledCount} subscribers` },
              { label: "Trial subscribers", value: `${stripe.trialCount} (not yet paying)` },
              { label: "Churn rate", value: `${stripe.churnRate.toFixed(1)}%` },
              { label: "Projected next month", value: fmt$(stripe.projectedNextMonth) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-[#475569]">{label}</span>
                <span className="text-xs text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="border border-[#1a1a1a] p-6">
          <h3 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-5">Profit / Loss</h3>
          <div className="space-y-3">
            {[
              { label: "Revenue", value: fmt$(summary.mrr), color: "text-[#4ade80]" },
              { label: "Variable costs", value: `−${fmt$(summary.totalVariable)}`, color: "text-[#f87171]" },
              { label: "Fixed costs", value: `−${fmt$(summary.totalFixed)}`, color: "text-[#f87171]" },
              { label: "Total costs", value: `−${fmt$(summary.totalCosts)}`, color: "text-[#f87171]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between border-b border-[#111] pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-[#475569]">{label}</span>
                <span className={`text-xs font-medium ${color}`}>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#1a1a1a] flex items-center justify-between">
            <span className="text-sm font-semibold">Net {isProfit ? "profit" : "loss"}</span>
            <span className={`text-sm font-bold ${isProfit ? "text-[#4ade80]" : "text-[#f87171]"}`}>
              {fmt$(summary.netProfit)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#475569]">Margin</span>
            <span className={`text-xs font-medium ${isProfit ? "text-[#4ade80]" : "text-[#f87171]"}`}>
              {summary.marginPct.toFixed(1)}%
            </span>
          </div>
          {stripe.activeCount > 0 && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-[#475569]">Cost per subscriber</span>
              <span className="text-xs text-white">{fmt$(summary.costPerSub)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cost breakdown table */}
      <div className="border border-[#1a1a1a] mb-8">
        <div className="px-5 py-4 border-b border-[#1a1a1a]">
          <h3 className="text-xs text-[#94a3b8] uppercase tracking-widest">Cost Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="text-left text-[9px] text-[#475569] uppercase tracking-widest px-5 py-3 font-medium">Item</th>
              <th className="text-left text-[9px] text-[#475569] uppercase tracking-widest px-5 py-3 font-medium">Type</th>
              <th className="text-right text-[9px] text-[#475569] uppercase tracking-widest px-5 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {variableCosts.map((c) => (
              <tr key={c.item} className="border-b border-[#111] hover:bg-[#0d0d0d]">
                <td className="px-5 py-3 text-xs text-[#94a3b8]">
                  {c.item}
                  {c.count > 0 && <span className="text-[#475569] ml-2">({c.count} uses)</span>}
                </td>
                <td className="px-5 py-3 text-[9px] text-[#fbbf24]">Variable</td>
                <td className="px-5 py-3 text-xs text-white text-right">{fmt$(c.amount)}</td>
              </tr>
            ))}
            {fixedCosts.map((c) => (
              <tr key={c.item} className="border-b border-[#111] hover:bg-[#0d0d0d]">
                <td className="px-5 py-3 text-xs text-[#94a3b8]">{c.item}</td>
                <td className="px-5 py-3 text-[9px] text-[#60a5fa]">Fixed</td>
                <td className="px-5 py-3 text-xs text-white text-right">{fmt$(c.amount)}</td>
              </tr>
            ))}
            <tr className="bg-[#111]">
              <td className="px-5 py-3 text-xs font-semibold">Total costs</td>
              <td className="px-5 py-3" />
              <td className="px-5 py-3 text-xs font-semibold text-right text-[#f87171]">
                {fmt$(summary.totalCosts)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Founding member section */}
      <div className="border border-[#1a1a1a] p-6">
        <h3 className="text-xs text-[#94a3b8] uppercase tracking-widest mb-5">Founding Member Coupon</h3>

        {foundingMember ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold font-mono">FOUNDING20</span>
                <span className={`text-[9px] px-2 py-0.5 font-semibold ${
                  foundingMember.valid ? "text-[#4ade80] bg-[#4ade80]/10" : "text-[#f87171] bg-[#f87171]/10"
                }`}>
                  {foundingMember.valid ? "Active" : "Expired / Max reached"}
                </span>
              </div>
              <p className="text-sm text-[#94a3b8]">
                {foundingMember.timesRedeemed}/{foundingMember.maxRedemptions} founding member codes used
              </p>
              {foundingMember.timesRedeemed >= foundingMember.maxRedemptions && (
                <p className="text-xs text-[#fbbf24] mt-1">All codes have been redeemed. Remove the banner from the landing page.</p>
              )}
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="w-32 h-1.5 bg-[#1a1a1a]">
                <div
                  className="h-full bg-[#4ade80] transition-all"
                  style={{ width: `${Math.min(100, (foundingMember.timesRedeemed / foundingMember.maxRedemptions) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-[#475569]">
                {foundingMember.timesRedeemed}/{foundingMember.maxRedemptions}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[#94a3b8] mb-3">
              FOUNDING20 promotion code not found in Stripe.
            </p>
            <p className="text-xs text-[#475569] mb-4">
              Go to the{" "}
              <a
                href="https://dashboard.stripe.com/coupons"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-2 hover:text-[#94a3b8] transition-colors"
              >
                Stripe Coupons dashboard
              </a>
              {" "}→ open your FOUNDING20 coupon → Add promotion code → set code to{" "}
              <span className="font-mono text-white">FOUNDING20</span>.
              Then click Refresh below.
            </p>
            {couponMsg && (
              <p className={`text-xs mb-4 ${couponMsg.startsWith("FOUNDING20 is") ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                {couponMsg}
              </p>
            )}
            <button
              onClick={handleCheckCoupon}
              className="text-sm border border-[#1a1a1a] px-5 py-2.5 text-[#94a3b8] hover:border-[#333] hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {foundingMember && couponMsg && (
          <p className={`text-xs mt-4 ${couponMsg.startsWith("FOUNDING20 is") ? "text-[#4ade80]" : "text-[#f87171]"}`}>
            {couponMsg}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tools ─────────────────────────────────────────────────────────────────────
// Standalone admin tools — each is its own route with its own password gate
// (same shared-secret pattern as this page, just a separate session). Append
// new tools here as they're built; nothing else on this page needs to change.

interface AdminTool {
  key: string;
  name: string;
  description: string;
  href: string;
}

const ADMIN_TOOLS: AdminTool[] = [
  {
    key: "insights",
    name: "Insights",
    description: "Lane insight extractor — copy-friendly market intel per lane.",
    href: "/admin/insights",
  },
  {
    key: "cards",
    name: "Cards",
    description: "Social card generator — branded lane PNGs for X/Instagram.",
    href: "/admin/cards",
  },
  {
    key: "prospects",
    name: "Prospects",
    description: "Lane-based Producer Finder — find and save candidate producers by lane.",
    href: "/admin/prospects",
  },
];

function ToolsSection() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1">Tools</h2>
        <p className="text-[#94a3b8] text-sm">Standalone admin tools — each opens in its own page.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ADMIN_TOOLS.map((tool) => (
          <Link
            key={tool.key}
            href={tool.href}
            className="block border border-[#1a1a1a] bg-[#0d0d0d] p-6 hover:border-[#333] transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-white">{tool.name}</h3>
              <span className="text-[#94a3b8] text-sm group-hover:text-white transition-colors">→</span>
            </div>
            <p className="text-[#94a3b8] text-sm leading-relaxed">{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

function AdminDashboard({ initialEntries, password, onSignOut }: {
  initialEntries: WaitlistEntry[];
  password: string;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("waitlist");
  const [entries, setEntries] = useState<WaitlistEntry[]>(initialEntries);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [producers, setProducers] = useState<ProducerProfile[]>([]);
  const [producersLoading, setProducersLoading] = useState(true);
  const [betaAction, setBetaAction] = useState<string | null>(null);

  const loadProducers = useCallback(async () => {
    setProducersLoading(true);
    try {
      const res = await fetch("/api/admin/beta", { headers: { "x-admin-password": password } });
      if (res.ok) setProducers((await res.json()).producers ?? []);
    } catch { /* silent */ }
    finally { setProducersLoading(false); }
  }, [password]);

  useEffect(() => { loadProducers(); }, [loadProducers]);

  const toggleBeta = async (producerId: string, grant: boolean) => {
    setBetaAction(producerId);
    try {
      await fetch("/api/admin/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ producer_id: producerId, beta_access: grant }),
      });
      await loadProducers();
    } finally { setBetaAction(null); }
  };

  const refreshWaitlist = async () => {
    setRefreshing(true); setRefreshError("");
    try {
      const res = await fetch("/api/admin/waitlist", { headers: { "x-admin-password": password } });
      const data = await res.json();
      if (res.ok) setEntries(data.entries);
      else setRefreshError(data.error ?? "Failed to refresh.");
    } catch { setRefreshError("Network error."); }
    finally { setRefreshing(false); }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "waitlist", label: "Waitlist" },
    { key: "beta", label: "Beta Access" },
    { key: "prospects", label: "Producer Finder" },
    { key: "financials", label: "Financials" },
    { key: "tools", label: "Tools" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">TALLY</Link>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[#94a3b8] hidden sm:block">Admin</span>
            <button onClick={onSignOut} className="text-sm text-[#94a3b8] hover:text-white transition-colors">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex gap-6 border-b border-[#1a1a1a] mb-10">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`text-sm pb-3 border-b-2 transition-colors -mb-px ${
                tab === key ? "border-white text-white font-semibold" : "border-transparent text-[#94a3b8] hover:text-white"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "waitlist" && (
          <WaitlistSection entries={entries} refreshing={refreshing} refreshError={refreshError} onRefresh={refreshWaitlist} />
        )}
        {tab === "beta" && (
          <BetaSection producers={producers} loading={producersLoading} betaAction={betaAction} onRefresh={loadProducers} onToggle={toggleBeta} />
        )}
        {tab === "prospects" && <ProspectFinderSection password={password} />}
        {tab === "financials" && <FinancialsSection password={password} />}
        {tab === "tools" && <ToolsSection />}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [password, setPassword] = useState("");

  if (!authenticated) {
    return (
      <LoginGate
        onAuth={(fetchedEntries, pw) => {
          setEntries(fetchedEntries);
          setPassword(pw);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <AdminDashboard
      initialEntries={entries}
      password={password}
      onSignOut={() => { setAuthenticated(false); setEntries([]); setPassword(""); }}
    />
  );
}
