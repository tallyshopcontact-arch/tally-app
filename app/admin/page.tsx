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
  channel_snapshot: ChannelSnapshot | null;
  outreach_sequence: OutreachSequence | null;
  status: string;
  found_at: string;
  contacted_at: string | null;
  responded_at: string | null;
  signed_up_at: string | null;
  notes: string | null;
}

type Tab = "waitlist" | "beta" | "prospects";

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
        <span className="text-[10px] text-[#475569]">
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
                <span className="text-[10px] text-[#475569] font-mono">{i + 1}</span>
              )}
              <span className={`text-xs font-medium ${msg.sent ? "text-[#4ade80]" : "text-[#94a3b8]"}`}>
                {msg.label}
              </span>
              {msg.sent && msg.sent_at && (
                <span className="text-[10px] text-[#475569]">
                  Sent {new Date(msg.sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <span className="text-[#475569] text-xs">{openIndex === i ? "▲" : "▼"}</span>
          </button>

          {/* Accordion body */}
          {openIndex === i && (
            <div className="px-4 pb-4 space-y-3 border-t border-[#1a1a1a]">
              {msg.subject && (
                <div className="mt-3">
                  <p className="text-[9px] text-[#475569] uppercase tracking-widest mb-1">Subject</p>
                  <p className="text-xs text-[#94a3b8] bg-[#111] px-3 py-2 border border-[#1a1a1a]">{msg.subject}</p>
                </div>
              )}
              <div className={msg.subject ? "" : "mt-3"}>
                {!msg.subject && <p className="text-[9px] text-[#475569] uppercase tracking-widest mb-1">Message</p>}
                <pre className="text-xs text-white whitespace-pre-wrap font-sans leading-relaxed bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-3">
                  {msg.body}
                </pre>
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

  // Stats
  const total = prospects.length;
  const contacted = prospects.filter((p) => ["contacted", "responded", "signed_up"].includes(p.status)).length;
  const responded = prospects.filter((p) => ["responded", "signed_up"].includes(p.status)).length;
  const signedUp = prospects.filter((p) => p.status === "signed_up").length;
  const thisWeek = prospects.filter((p) => {
    if (!p.contacted_at) return false;
    return Date.now() - new Date(p.contacted_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const statusCounts: Record<StatusFilter, number> = {
    all: total,
    pending: prospects.filter((p) => p.status === "pending").length,
    contacted: prospects.filter((p) => p.status === "contacted").length,
    responded: prospects.filter((p) => p.status === "responded").length,
    signed_up: signedUp,
    rejected: prospects.filter((p) => p.status === "rejected").length,
  };

  const byStatus = statusFilter === "all" ? prospects : prospects.filter((p) => p.status === statusFilter);
  const filtered = byStatus.filter((p) => {
    if (contactFilter === "email") return !!p.email;
    if (contactFilter === "instagram") return !p.email && !!p.instagram_handle;
    if (contactFilter === "check_manually") return !p.email && !p.instagram_handle;
    return true;
  });
  const contactCounts = {
    all: byStatus.length,
    email: byStatus.filter((p) => !!p.email).length,
    instagram: byStatus.filter((p) => !p.email && !!p.instagram_handle).length,
    check_manually: byStatus.filter((p) => !p.email && !p.instagram_handle).length,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1">Producer Finder</h2>
        <p className="text-[#94a3b8] text-sm mb-1">
          Find beat producers on YouTube, generate channel snapshots, and run outreach sequences.
        </p>
        <p className="text-[10px] text-[#475569]">
          Finding: Free · Snapshot: ~$0.01 (Claude) · Sequence: ~$0.03 (Claude) · PDF: Free
        </p>
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
                <span key={a} className="flex items-center gap-2 text-xs bg-[#111] border border-[#1e1e1e] px-3 py-1.5">
                  {a}
                  <button onClick={() => setArtists((prev) => prev.filter((x) => x !== a))}
                    className="text-[#475569] hover:text-[#f87171] transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[#475569] mt-2">Sub range 200–2,000</p>
        </div>
      )}

      {/* Find + clear row */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <button onClick={handleFind} disabled={finding || (searchMode === "genre" ? selectedGenres.length === 0 : artists.length === 0)}
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[#1a1a1a] mb-6">
        <div className="bg-[#0a0a0a] px-4 py-3 text-center">
          <p className="text-lg font-bold">{total}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">Total</p>
        </div>
        <div className="bg-[#0a0a0a] px-4 py-3 text-center">
          <p className="text-lg font-bold">{contacted}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">Contacted</p>
        </div>
        <div className="bg-[#0a0a0a] px-4 py-3 text-center">
          <p className="text-lg font-bold">{responded}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">
            Responded {contacted > 0 ? `(${Math.round((responded / contacted) * 100)}%)` : ""}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-4 py-3 text-center">
          <p className="text-lg font-bold">{signedUp}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">
            Signed up {total > 0 ? `(${Math.round((signedUp / total) * 100)}%)` : ""}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-4 py-3 text-center">
          <p className="text-lg font-bold">{thisWeek}</p>
          <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">This week</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 mb-3 flex-wrap border-b border-[#1a1a1a] pb-3">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 transition-colors ${
              statusFilter === s ? "bg-[#1a1a1a] text-white" : "text-[#94a3b8] hover:text-white"
            }`}>
            {s === "all" ? `All (${total})` : `${s.replace("_", " ")} (${statusCounts[s]})`}
          </button>
        ))}
      </div>

      {/* Contact filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] text-[#475569] uppercase tracking-widest">Contact:</span>
        {([
          { key: "all", label: "All", ac: "bg-[#1a1a1a] border-[#333] text-white" },
          { key: "email", label: "Email", ac: "bg-[#60a5fa]/10 border-[#60a5fa]/40 text-[#60a5fa]" },
          { key: "instagram", label: "Instagram", ac: "bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]" },
          { key: "check_manually", label: "Check Manually", ac: "bg-[#fbbf24]/10 border-[#fbbf24]/40 text-[#fbbf24]" },
        ] as const).map(({ key, label, ac }) => (
          <button key={key} onClick={() => setContactFilter(key)}
            className={`text-xs px-3 py-1 border transition-colors ${
              contactFilter === key ? ac : "border-[#1a1a1a] text-[#475569] hover:border-[#333] hover:text-[#94a3b8]"
            }`}>
            {label} <span className="opacity-60">({contactCounts[key]})</span>
          </button>
        ))}
      </div>

      {/* Prospects list */}
      {loadingProspects ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-[#1a1a1a] p-12 text-center">
          <p className="text-[#94a3b8] text-sm">
            {prospects.length === 0
              ? 'No prospects yet. Select genres and click "Find Producers".'
              : "No prospects in this view."}
          </p>
        </div>
      ) : (
        <div className="space-y-px">
          {filtered.map((p) => {
            const pref = getPreference(p);
            const isExpanded = expandedId === p.id;
            const hasSnapshot = !!p.channel_snapshot;
            const hasSequence = !!p.outreach_sequence;

            return (
              <Fragment key={p.id}>
                {/* ── Prospect row ── */}
                <div className="border border-[#1a1a1a] bg-[#0a0a0a]">
                  {/* Header */}
                  <div className="px-4 py-3 flex items-start gap-4 flex-wrap">
                    {/* Channel info */}
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={p.channel_url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-semibold text-white hover:text-[#94a3b8] transition-colors">
                          {p.channel_name}
                        </a>
                        <span className="text-[10px] text-[#475569]">
                          {p.subscriber_count?.toLocaleString() ?? "—"} subs
                        </span>
                        {p.genre && (
                          <span className="text-[10px] text-[#475569]">· {p.genre}</span>
                        )}
                      </div>
                      {/* Badges row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Contact badge */}
                        {p.email ? (
                          <span className="text-[9px] font-semibold text-[#60a5fa] bg-[#60a5fa]/10 px-1.5 py-0.5">Email</span>
                        ) : p.instagram_handle ? (
                          <span className="text-[9px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5">Instagram</span>
                        ) : (
                          <span className="text-[9px] font-semibold text-[#fbbf24] bg-[#fbbf24]/10 px-1.5 py-0.5">Check manually</span>
                        )}
                        {/* Snapshot status */}
                        <span className={`text-[9px] font-medium ${snapshotStatusColor(p)}`}>
                          {snapshotStatus(p)}
                        </span>
                        {/* Overall status */}
                        <StatusBadge status={p.status} />
                      </div>
                      {/* Contact info */}
                      {p.email && <p className="text-[10px] text-[#475569] mt-0.5">{p.email}</p>}
                      {!p.email && p.instagram_handle && <p className="text-[10px] text-[#475569] mt-0.5">@{p.instagram_handle}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      {/* Row 1: Snapshot + Contact toggle + Sequence + PDF */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Snapshot button */}
                        <button
                          onClick={() => handleGenerateSnapshot(p)}
                          disabled={snapshotLoadingId === p.id}
                          className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 ${
                            hasSnapshot
                              ? "border-[#fbbf24]/30 text-[#fbbf24] hover:border-[#fbbf24] hover:text-white"
                              : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                          }`}>
                          {snapshotLoadingId === p.id
                            ? "Analyzing..."
                            : hasSnapshot
                            ? "Re-snapshot"
                            : "Snapshot (~$0.01)"}
                        </button>

                        {/* Contact method toggle */}
                        <div className="flex border border-[#1a1a1a]">
                          <button
                            onClick={() => handleSetContactPreference(p, "instagram")}
                            disabled={actionId === p.id}
                            className={`text-[10px] px-2.5 py-1 transition-colors ${
                              pref === "instagram"
                                ? "bg-[#4ade80]/15 text-[#4ade80] border-r border-[#1a1a1a]"
                                : "text-[#475569] border-r border-[#1a1a1a] hover:text-[#94a3b8]"
                            }`}>
                            IG DM
                          </button>
                          <button
                            onClick={() => handleSetContactPreference(p, "email")}
                            disabled={actionId === p.id}
                            className={`text-[10px] px-2.5 py-1 transition-colors ${
                              pref === "email"
                                ? "bg-[#60a5fa]/15 text-[#60a5fa]"
                                : "text-[#475569] hover:text-[#94a3b8]"
                            }`}>
                            Email
                          </button>
                        </div>

                        {/* Sequence button */}
                        <button
                          onClick={() => handleGenerateSequence(p)}
                          disabled={sequenceLoadingId === p.id || !hasSnapshot}
                          className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 ${
                            !hasSnapshot
                              ? "border-[#1a1a1a] text-[#333] cursor-not-allowed"
                              : hasSequence
                              ? "border-[#a78bfa]/30 text-[#a78bfa] hover:border-[#a78bfa] hover:text-white"
                              : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                          }`}>
                          {sequenceLoadingId === p.id
                            ? "Generating..."
                            : hasSequence
                            ? "Regenerate (~$0.03)"
                            : "Sequence (~$0.03)"}
                        </button>

                        {/* PDF button */}
                        <button
                          onClick={() => handleGeneratePdf(p)}
                          disabled={pdfLoadingId === p.id || !hasSnapshot}
                          className={`text-[10px] border px-2.5 py-1 transition-colors disabled:opacity-40 ${
                            !hasSnapshot
                              ? "border-[#1a1a1a] text-[#333] cursor-not-allowed"
                              : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                          }`}>
                          {pdfLoadingId === p.id ? "Building PDF..." : "PDF"}
                        </button>
                      </div>

                      {/* Row 2: Status actions */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {hasSequence && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/30 px-2.5 py-1 hover:border-[#a78bfa] hover:text-white transition-colors">
                            {isExpanded ? "Hide Sequence" : "Show Sequence"}
                          </button>
                        )}
                        {p.status === "contacted" && (
                          <button
                            onClick={() => updateProspect(p.id, {
                              status: "responded",
                              responded_at: new Date().toISOString(),
                            })}
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
                            onClick={() => updateProspect(p.id, { status: "rejected" })}
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#475569] border border-[#1a1a1a] px-2.5 py-1 hover:border-[#f87171]/30 hover:text-[#f87171] transition-colors disabled:opacity-40">
                            Not interested
                          </button>
                        )}
                      </div>

                      {/* Errors */}
                      {snapshotError[p.id] && (
                        <p className="text-[10px] text-[#f87171]">Snapshot: {snapshotError[p.id]}</p>
                      )}
                      {sequenceError[p.id] && (
                        <p className="text-[10px] text-[#f87171]">Sequence: {sequenceError[p.id]}</p>
                      )}
                    </div>
                  </div>

                  {/* Snapshot insight (if available, collapsed preview) */}
                  {hasSnapshot && !isExpanded && (
                    <div className="px-4 pb-3 border-t border-[#111]">
                      <p className="text-[10px] text-[#475569] leading-relaxed">
                        <span className="text-[#94a3b8] font-medium">Insight: </span>
                        {p.channel_snapshot!.top_insight}
                      </p>
                    </div>
                  )}

                  {/* Sequence accordion */}
                  {isExpanded && p.outreach_sequence && (
                    <div className="px-4 pb-4 border-t border-[#111]">
                      <div className="mt-4">
                        <SequencePanel
                          sequence={p.outreach_sequence}
                          onMarkSent={(i) => handleMarkMessageSent(p, i)}
                        />
                      </div>

                      {/* Full snapshot data */}
                      {hasSnapshot && (
                        <div className="mt-4 space-y-2">
                          <p className="text-[9px] text-[#475569] uppercase tracking-widest">Channel Analysis</p>
                          {[
                            { label: "Top insight", value: p.channel_snapshot!.top_insight },
                            { label: "Gap", value: p.channel_snapshot!.positioning_gap },
                            { label: "Title pattern", value: p.channel_snapshot!.title_pattern },
                            { label: "Recommendation", value: p.channel_snapshot!.recommendation },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex gap-3">
                              <span className="text-[10px] text-[#475569] w-28 shrink-0">{label}</span>
                              <span className="text-[10px] text-[#94a3b8] leading-relaxed">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
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
