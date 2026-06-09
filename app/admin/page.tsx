"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";

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
  personalized_message: string | null;
  message_type: string | null;
  status: string;
  found_at: string;
  contacted_at: string | null;
  notes: string | null;
}

type Tab = "waitlist" | "beta" | "prospects";

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginGate({
  onAuth,
}: {
  onAuth: (entries: WaitlistEntry[], password: string) => void;
}) {
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

      if (res.status === 401) {
        setError("Incorrect password.");
      } else if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        onAuth(data.entries, password);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-sm font-bold tracking-[0.25em] mb-12">
          TALLY
        </Link>
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Enter the admin password to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="Password"
            autoFocus
            className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
          >
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
    approved: "text-[#4ade80] bg-[#4ade80]/10",
    sent: "text-[#fbbf24] bg-[#fbbf24]/10",
    responded: "text-[#a78bfa] bg-[#a78bfa]/10",
    signed_up: "text-[#4ade80] bg-[#4ade80]/20",
    rejected: "text-[#f87171] bg-[#f87171]/10",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 font-medium ${styles[status] ?? "text-[#94a3b8]"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ── Waitlist section ──────────────────────────────────────────────────────────

function WaitlistSection({
  entries,
  refreshing,
  refreshError,
  onRefresh,
}: {
  entries: WaitlistEntry[];
  refreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
}) {
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold mb-1">Waitlist Signups</h2>
          <p className="text-[#94a3b8] text-sm">
            {entries.length} {entries.length === 1 ? "signup" : "signups"} total
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-sm text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-4 py-2 hover:border-[#333] transition-colors disabled:opacity-40"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {refreshError && (
        <p className="text-red-400 text-sm mb-6">{refreshError}</p>
      )}

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
                  <th
                    key={h}
                    className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors"
                >
                  <td className="px-5 py-4 text-white font-medium">{entry.name}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{entry.email}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{entry.genre}</td>
                  <td className="px-5 py-4 max-w-[220px]">
                    <a
                      href={entry.youtube_channel}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#94a3b8] hover:text-white transition-colors truncate block"
                      title={entry.youtube_channel}
                    >
                      {entry.youtube_channel}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-[#94a3b8] whitespace-nowrap">
                    {formatDate(entry.created_at)}
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

// ── Beta access section ───────────────────────────────────────────────────────

function BetaSection({
  producers,
  loading,
  betaAction,
  onRefresh,
  onToggle,
}: {
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
          <p className="text-[#94a3b8] text-sm">
            Grant or revoke free access for beta producers.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-sm text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-4 py-2 hover:border-[#333] transition-colors disabled:opacity-40"
        >
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
                  <th
                    key={h}
                    className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-5 py-4 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {producers.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#111] transition-colors"
                >
                  <td className="px-5 py-4 text-white font-medium">{p.name || "—"}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{p.email}</td>
                  <td className="px-5 py-4 text-[#94a3b8]">{p.subscription_status}</td>
                  <td className="px-5 py-4">
                    {p.beta_access ? (
                      <span className="text-xs text-[#a78bfa] font-semibold">Beta</span>
                    ) : (
                      <span className="text-xs text-[#475569]">None</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {p.beta_access ? (
                      <button
                        onClick={() => onToggle(p.id, false)}
                        disabled={betaAction === p.id}
                        className="text-xs text-[#f87171] hover:text-white border border-[#f87171]/30 px-3 py-1 hover:border-[#f87171] transition-colors disabled:opacity-40"
                      >
                        {betaAction === p.id ? "…" : "Revoke"}
                      </button>
                    ) : (
                      <button
                        onClick={() => onToggle(p.id, true)}
                        disabled={betaAction === p.id}
                        className="text-xs text-[#4ade80] hover:text-white border border-[#4ade80]/30 px-3 py-1 hover:border-[#4ade80] transition-colors disabled:opacity-40"
                      >
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

// ── Producer finder section ───────────────────────────────────────────────────

const GENRES = [
  "Trap",
  "Drill",
  "Boom Bap",
  "Lo-Fi",
  "R&B",
  "Pop",
  "Afrobeats",
  "Reggaeton",
  "UK Drill",
  "Jersey Club",
];

const STATUS_TABS = [
  "all",
  "pending",
  "approved",
  "sent",
  "responded",
  "signed_up",
  "rejected",
] as const;

type StatusTab = (typeof STATUS_TABS)[number];

function getTemplateMessage(channelName: string, genre: string | null): string {
  return `Hey ${channelName} — I'm a fellow producer and I built a tool called TALLY that helps beat producers package their YouTube uploads for maximum discovery. Optimized titles, tags, and monthly niche data${genre ? ` specific to your ${genre} style` : ""}. I'd like to give you free access for 30 days — would you be open to trying it? tallyagc.com`;
}

function ProspectFinderSection({ password }: { password: string }) {
  // Search mode
  const [searchMode, setSearchMode] = useState<"genre" | "artist">("genre");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Trap", "Drill"]);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistInput, setArtistInput] = useState("");

  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  const [findResult, setFindResult] = useState<string | null>(null);

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [contactFilter, setContactFilter] = useState<"all" | "email" | "instagram" | "check_manually">("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [generatingMessageId, setGeneratingMessageId] = useState<string | null>(null);

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
    } catch {
      // silently fail
    } finally {
      setLoadingProspects(false);
    }
  }, [password]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  const handleFind = async () => {
    if (searchMode === "genre" && selectedGenres.length === 0) return;
    if (searchMode === "artist" && artists.length === 0) return;
    setFinding(true);
    setFindError("");
    setFindResult(null);
    try {
      const body =
        searchMode === "artist"
          ? { mode: "artist", artists, maxResults: 30 }
          : { mode: "genre", genres: selectedGenres, maxResults: 30 };
      const res = await fetch("/api/admin/find-producers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setFindResult(
          data.count > 0
            ? `Found ${data.count} new prospect${data.count === 1 ? "" : "s"}`
            : "No new prospects found (all channels already tracked)"
        );
        await loadProspects();
      } else {
        setFindError(data.error ?? "Failed to find producers");
      }
    } catch {
      setFindError("Network error");
    } finally {
      setFinding(false);
    }
  };

  const updateProspect = async (
    id: string,
    updates: Record<string, string | null>
  ) => {
    setActionId(id);
    try {
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) await loadProspects();
    } finally {
      setActionId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Delete all prospects? This cannot be undone.")) return;
    setFindResult(null);
    setFindError("");
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
        setFindError(data.error ?? "Failed to clear prospects");
      }
    } catch {
      setFindError("Network error");
    }
  };

  const handleGenerateMessage = async (prospectId: string, prospect: Prospect) => {
    setGeneratingMessageId(prospectId);
    try {
      const res = await fetch("/api/admin/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ prospect_id: prospectId }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setEditMessage(data.message);
        await loadProspects();
      }
    } catch {
      // silently fail — edit message stays as-is
    } finally {
      setGeneratingMessageId(null);
    }
    // keep prospect in scope for linter
    void prospect;
  };

  const handleAddArtist = () => {
    const trimmed = artistInput.trim();
    if (trimmed && !artists.includes(trimmed) && artists.length < 5) {
      setArtists((prev) => [...prev, trimmed]);
      setArtistInput("");
    }
  };

  const handleRemoveArtist = (name: string) =>
    setArtists((prev) => prev.filter((a) => a !== name));

  const toggleGenre = (g: string) =>
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );

  const stats = {
    all: prospects.length,
    pending: prospects.filter((p) => p.status === "pending").length,
    approved: prospects.filter((p) => p.status === "approved").length,
    sent: prospects.filter((p) => p.status === "sent").length,
    responded: prospects.filter((p) => p.status === "responded").length,
    signed_up: prospects.filter((p) => p.status === "signed_up").length,
    rejected: prospects.filter((p) => p.status === "rejected").length,
  };

  const byStatus =
    statusFilter === "all"
      ? prospects
      : prospects.filter((p) => p.status === statusFilter);

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

  const findDisabled =
    finding ||
    (searchMode === "genre" ? selectedGenres.length === 0 : artists.length === 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1">Producer Finder</h2>
        <p className="text-[#94a3b8] text-sm mb-2">
          Find beat producers on YouTube and reach out with personalized messages.
        </p>
        <p className="text-[10px] text-[#475569]">
          Finding producers: Free (YouTube API only) · Generating personalized message: ~$0.03/message (Claude API)
        </p>
      </div>

      {/* Search mode tabs */}
      <div className="flex gap-1 border-b border-[#1a1a1a] mb-6">
        {(["genre", "artist"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSearchMode(mode)}
            className={`text-xs px-4 py-2.5 border-b-2 -mb-px transition-colors ${
              searchMode === mode
                ? "border-white text-white font-semibold"
                : "border-transparent text-[#94a3b8] hover:text-white"
            }`}
          >
            {mode === "genre" ? "Genre Search" : "Artist Search"}
          </button>
        ))}
      </div>

      {/* Genre selector */}
      {searchMode === "genre" && (
        <div className="mb-5">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Genres</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`text-xs px-3 py-1.5 border transition-colors ${
                  selectedGenres.includes(g)
                    ? "bg-white text-black border-white"
                    : "border-[#1a1a1a] text-[#94a3b8] hover:border-[#333] hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Artist selector */}
      {searchMode === "artist" && (
        <div className="mb-5">
          <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">
            Artists (up to 5)
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddArtist()}
              placeholder="e.g. Nas, Drake, J Cole"
              className="flex-1 bg-[#111] border border-[#1e1e1e] px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
            />
            <button
              onClick={handleAddArtist}
              disabled={!artistInput.trim() || artists.length >= 5}
              className="text-xs border border-[#1a1a1a] px-4 py-2 text-[#94a3b8] hover:text-white hover:border-[#333] disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>
          {artists.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {artists.map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-2 text-xs bg-[#111] border border-[#1e1e1e] px-3 py-1.5"
                >
                  {a}
                  <button
                    onClick={() => handleRemoveArtist(a)}
                    className="text-[#475569] hover:text-[#f87171] transition-colors leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {searchMode === "artist" && (
            <p className="text-[10px] text-[#475569] mt-2">
              Searches &ldquo;[artist] type beat&rdquo;, &ldquo;[artist] type beat 2026&rdquo;, and &ldquo;[artist] instrumental&rdquo; · Sub range 200–2,000
            </p>
          )}
        </div>
      )}

      {/* Find button row */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <button
          onClick={handleFind}
          disabled={findDisabled}
          className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
        >
          {finding ? "Searching YouTube..." : "Find Producers"}
        </button>
        <button
          onClick={handleClearAll}
          disabled={finding || prospects.length === 0}
          className="text-xs text-[#f87171] border border-[#f87171]/30 px-4 py-2 hover:border-[#f87171] hover:text-white transition-colors disabled:opacity-30"
        >
          Clear All Prospects
        </button>
        {findResult && <p className="text-sm text-[#4ade80]">{findResult}</p>}
        {findError && <p className="text-sm text-[#f87171]">{findError}</p>}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-px bg-[#1a1a1a] mb-6">
        {STATUS_TABS.map((key) => (
          <div key={key} className="bg-[#0a0a0a] px-4 py-3 text-center">
            <p className="text-lg font-bold">{stats[key]}</p>
            <p className="text-[9px] text-[#94a3b8] uppercase tracking-widest">
              {key.replace("_", " ")}
            </p>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-3 flex-wrap border-b border-[#1a1a1a] pb-3">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 transition-colors ${
              statusFilter === s
                ? "bg-[#1a1a1a] text-white"
                : "text-[#94a3b8] hover:text-white"
            }`}
          >
            {s === "all"
              ? `All (${stats.all})`
              : `${s.replace("_", " ")} (${stats[s]})`}
          </button>
        ))}
      </div>

      {/* Contact filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] text-[#475569] uppercase tracking-widest">Contact:</span>
        {(
          [
            { key: "all", label: "All", activeClass: "bg-[#1a1a1a] border-[#333] text-white" },
            { key: "email", label: "Email", activeClass: "bg-[#60a5fa]/10 border-[#60a5fa]/40 text-[#60a5fa]" },
            { key: "instagram", label: "Instagram", activeClass: "bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]" },
            { key: "check_manually", label: "Check Manually", activeClass: "bg-[#fbbf24]/10 border-[#fbbf24]/40 text-[#fbbf24]" },
          ] as const
        ).map(({ key, label, activeClass }) => (
          <button
            key={key}
            onClick={() => setContactFilter(key)}
            className={`text-xs px-3 py-1 border transition-colors ${
              contactFilter === key
                ? activeClass
                : "border-[#1a1a1a] text-[#475569] hover:border-[#333] hover:text-[#94a3b8]"
            }`}
          >
            {label}{" "}
            <span className="opacity-60">({contactCounts[key]})</span>
          </button>
        ))}
      </div>

      {/* Prospects table */}
      {loadingProspects ? (
        <div className="border border-[#1a1a1a] p-8 text-center">
          <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-[#1a1a1a] p-12 text-center">
          <p className="text-[#94a3b8] text-sm">
            {prospects.length === 0
              ? 'No prospects yet. Select genres and click "Find Producers".'
              : contactFilter !== "all"
              ? `No prospects with ${contactFilter === "check_manually" ? "no direct contact" : `${contactFilter} contact`} in this view.`
              : "No prospects in this status."}
          </p>
        </div>
      ) : (
        <div className="border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                {["Channel", "Subs", "Genre", "Contact", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs text-[#94a3b8] uppercase tracking-widest px-4 py-3 font-medium"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
                    <td className="px-4 py-3 max-w-[220px]">
                      <a
                        href={p.channel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-[#94a3b8] font-medium transition-colors"
                      >
                        {p.channel_name}
                      </a>
                      {p.latest_video_title && (
                        <p
                          className="text-[10px] text-[#475569] mt-0.5 truncate"
                          title={p.latest_video_title}
                        >
                          {p.latest_video_url ? (
                            <a
                              href={p.latest_video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[#94a3b8] transition-colors"
                            >
                              {p.latest_video_title}
                            </a>
                          ) : (
                            p.latest_video_title
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap">
                      {p.subscriber_count?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8]">
                      {p.genre ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.email ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-[#60a5fa] bg-[#60a5fa]/10 px-1.5 py-0.5 w-fit">
                            Email
                          </span>
                          <span className="text-[11px] text-[#94a3b8]">{p.email}</span>
                        </div>
                      ) : p.instagram_handle ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-[#4ade80] bg-[#4ade80]/10 px-1.5 py-0.5 w-fit">
                            Instagram
                          </span>
                          <span className="text-[11px] text-[#94a3b8]">@{p.instagram_handle}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-[#fbbf24] bg-[#fbbf24]/10 px-1.5 py-0.5 w-fit">
                            Check manually
                          </span>
                          <a
                            href={p.channel_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#475569] hover:text-[#94a3b8] transition-colors"
                          >
                            Visit channel ↗
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Edit message */}
                        <button
                          onClick={() => {
                            if (editingId === p.id) {
                              setEditingId(null);
                            } else {
                              setEditingId(p.id);
                              setEditMessage(
                                p.personalized_message ??
                                  getTemplateMessage(p.channel_name, p.genre)
                              );
                            }
                          }}
                          className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-2 py-1 hover:border-[#333] transition-colors"
                        >
                          {editingId === p.id ? "Close" : "Edit"}
                        </button>

                        {/* Copy message (always available — uses template as fallback) */}
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              p.personalized_message ??
                                getTemplateMessage(p.channel_name, p.genre)
                            )
                          }
                          className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-2 py-1 hover:border-[#333] transition-colors"
                        >
                          Copy
                        </button>

                        {/* Approve */}
                        {p.status === "pending" && (
                          <button
                            onClick={() =>
                              updateProspect(p.id, { status: "approved" })
                            }
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#4ade80] border border-[#4ade80]/30 px-2 py-1 hover:border-[#4ade80] hover:text-white transition-colors disabled:opacity-40"
                          >
                            Approve
                          </button>
                        )}

                        {/* Mark Sent */}
                        {p.status === "approved" && (
                          <button
                            onClick={() =>
                              updateProspect(p.id, {
                                status: "sent",
                                contacted_at: new Date().toISOString(),
                              })
                            }
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#fbbf24] border border-[#fbbf24]/30 px-2 py-1 hover:border-[#fbbf24] hover:text-white transition-colors disabled:opacity-40"
                          >
                            Sent
                          </button>
                        )}

                        {/* Mark Responded */}
                        {p.status === "sent" && (
                          <button
                            onClick={() =>
                              updateProspect(p.id, { status: "responded" })
                            }
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/30 px-2 py-1 hover:border-[#a78bfa] hover:text-white transition-colors disabled:opacity-40"
                          >
                            Responded
                          </button>
                        )}

                        {/* Mark Signed Up */}
                        {!["signed_up", "rejected"].includes(p.status) && (
                          <button
                            onClick={() =>
                              updateProspect(p.id, { status: "signed_up" })
                            }
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#4ade80] border border-[#4ade80]/30 px-2 py-1 hover:border-[#4ade80] hover:text-white transition-colors disabled:opacity-40"
                          >
                            Signed Up
                          </button>
                        )}

                        {/* Reject */}
                        {!["rejected", "signed_up"].includes(p.status) && (
                          <button
                            onClick={() =>
                              updateProspect(p.id, { status: "rejected" })
                            }
                            disabled={actionId === p.id}
                            className="text-[10px] text-[#f87171] border border-[#f87171]/30 px-2 py-1 hover:border-[#f87171] hover:text-white transition-colors disabled:opacity-40"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline message editor */}
                  {editingId === p.id && (
                    <tr className="border-b border-[#1a1a1a] bg-[#0d0d0d]">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-3 max-w-2xl">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs text-[#94a3b8] uppercase tracking-widest">
                              {p.personalized_message
                                ? `Personalized Message${p.message_type ? ` · ${p.message_type}` : ""}`
                                : "Template Message (free)"}
                            </p>
                            <button
                              onClick={() => handleGenerateMessage(p.id, p)}
                              disabled={generatingMessageId === p.id}
                              className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/30 px-3 py-1 hover:border-[#a78bfa] hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                            >
                              {generatingMessageId === p.id
                                ? "Writing message..."
                                : p.personalized_message
                                ? "Regenerate (~$0.03)"
                                : "Generate personalized (~$0.03)"}
                            </button>
                          </div>
                          <textarea
                            value={editMessage}
                            onChange={(e) => setEditMessage(e.target.value)}
                            rows={6}
                            className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
                          />
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                setSavingId(p.id);
                                await updateProspect(p.id, {
                                  personalized_message: editMessage,
                                });
                                setSavingId(null);
                                setEditingId(null);
                              }}
                              disabled={savingId === p.id}
                              className="text-xs bg-white text-black px-4 py-2 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
                            >
                              {savingId === p.id ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-[#94a3b8] hover:text-white border border-[#1a1a1a] px-4 py-2 hover:border-[#333] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

function AdminDashboard({
  initialEntries,
  password,
  onSignOut,
}: {
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
      const res = await fetch("/api/admin/beta", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setProducers(data.producers ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setProducersLoading(false);
    }
  }, [password]);

  useEffect(() => {
    loadProducers();
  }, [loadProducers]);

  const toggleBeta = async (producerId: string, grant: boolean) => {
    setBetaAction(producerId);
    try {
      await fetch("/api/admin/beta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({ producer_id: producerId, beta_access: grant }),
      });
      await loadProducers();
    } finally {
      setBetaAction(null);
    }
  };

  const refreshWaitlist = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      const res = await fetch("/api/admin/waitlist", {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (res.ok) setEntries(data.entries);
      else setRefreshError(data.error ?? "Failed to refresh.");
    } catch {
      setRefreshError("Network error.");
    } finally {
      setRefreshing(false);
    }
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
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">
            TALLY
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[#94a3b8] hidden sm:block">Admin</span>
            <button
              onClick={onSignOut}
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Tab nav */}
        <div className="flex gap-6 border-b border-[#1a1a1a] mb-10">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-sm pb-3 border-b-2 transition-colors -mb-px ${
                tab === key
                  ? "border-white text-white font-semibold"
                  : "border-transparent text-[#94a3b8] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "waitlist" && (
          <WaitlistSection
            entries={entries}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={refreshWaitlist}
          />
        )}

        {tab === "beta" && (
          <BetaSection
            producers={producers}
            loading={producersLoading}
            betaAction={betaAction}
            onRefresh={loadProducers}
            onToggle={toggleBeta}
          />
        )}

        {tab === "prospects" && (
          <ProspectFinderSection password={password} />
        )}
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
      onSignOut={() => {
        setAuthenticated(false);
        setEntries([]);
        setPassword("");
      }}
    />
  );
}
