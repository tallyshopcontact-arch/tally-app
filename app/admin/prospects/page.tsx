"use client";

// Lane-based Producer Finder. Deliberately separate from the older, genre/
// artist-based Producer Finder tab in /admin (ProspectFinderSection) — that
// one is a candidate for retirement once this simpler, lane-driven pipeline
// is validated in real use, but isn't removed yet. Search + save happens
// here; the "Saved Prospects" list below links each one to the DM composer
// at /admin/prospects/[id] (Brief 3).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface LaneOption {
  id: string;
  slug: string;
  displayName: string;
  opportunity: number;
}

interface Prospect {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  recentVideoTitle: string | null;
  channelUrl: string;
}

interface SavedProspect {
  id: string;
  channel_id: string;
  channel_name: string;
  subscriber_count: number;
  recent_video_title: string | null;
  artist_name: string;
  status: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Login gate — same shared-secret pattern and lane list as /admin/cards
// and /admin/insights (each of those pages has its own copy of this same
// component rather than a shared import — see their file headers). ──

function LoginGate({ onAuth }: { onAuth: (lanes: LaneOption[], password: string) => void }) {
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
      const data = await res.json();
      if (res.status === 401) setError("Incorrect password.");
      else if (!res.ok) setError(data.error ?? "Something went wrong.");
      else onAuth(data.lanes, password);
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
        <h1 className="text-2xl font-bold mb-2">Producer Finder</h1>
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

// ── Searchable lane picker — same as /admin/cards's and /admin/insights's ──

function LanePicker({
  label,
  lanes,
  value,
  onChange,
}: {
  label: string;
  lanes: LaneOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = lanes.find((l) => l.id === value);
  const filtered = query.trim()
    ? lanes.filter((l) => l.displayName.toLowerCase().includes(query.trim().toLowerCase()))
    : lanes;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-left hover:border-[#333] transition-colors"
      >
        <span className={selected ? "text-white" : "text-[#475569]"}>
          {selected ? `${selected.displayName} — ${selected.opportunity}/100` : "Select a lane..."}
        </span>
        <span className="text-[#94a3b8] text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-[#111] border border-[#1e1e1e] max-h-64 overflow-y-auto">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lanes..."
            className="w-full bg-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-2.5 text-sm text-white placeholder:text-[#475569] focus:outline-none sticky top-0"
          />
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#94a3b8]">No lanes found.</p>
          ) : (
            filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { onChange(l.id); setQuery(""); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-[#1a1a1a] transition-colors ${
                  l.id === value ? "bg-[#1a1a1a]" : ""
                }`}
              >
                <span className="text-white">{l.displayName}</span>
                <span className="text-[#94a3b8] text-xs">{l.opportunity}/100</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Prospect card ─────────────────────────────────────────────────────────

function ProspectCard({
  prospect,
  saveStatus,
  onSave,
  onSkip,
}: {
  prospect: Prospect;
  saveStatus: SaveStatus;
  onSave: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <a
          href={prospect.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white font-semibold text-sm hover:text-[#94a3b8] transition-colors"
        >
          {prospect.channelName || "(untitled channel)"}
        </a>
        <span className="text-xs text-[#94a3b8] shrink-0">{formatCount(prospect.subscriberCount)} subs</span>
      </div>
      {prospect.recentVideoTitle && (
        <p className="text-[#cbd5e1] text-xs leading-relaxed mb-4 truncate">{prospect.recentVideoTitle}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saveStatus === "saving" || saveStatus === "saved"}
          className="text-xs font-semibold px-3 py-2 hover:brightness-110 disabled:opacity-60 transition-all"
          style={{ backgroundColor: saveStatus === "saved" ? "#1a3a1a" : "#e8833a", color: saveStatus === "saved" ? "#4ade80" : "#0a0a0a" }}
        >
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : "Save to Outreach"}
        </button>
        {saveStatus !== "saved" && (
          <button
            onClick={onSkip}
            className="text-xs text-[#94a3b8] border border-[#1a1a1a] px-3 py-2 hover:border-[#333] hover:text-white transition-colors"
          >
            Skip
          </button>
        )}
        {saveStatus === "error" && <span className="text-[10px] text-[#f87171]">Failed to save</span>}
      </div>
    </div>
  );
}

// ── Saved prospect row — links to the DM composer (Brief 3) ─────────────

function SavedProspectRow({ prospect }: { prospect: SavedProspect }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <a
            href={`https://youtube.com/channel/${prospect.channel_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white font-semibold text-sm hover:text-[#94a3b8] transition-colors truncate"
          >
            {prospect.channel_name || "(untitled channel)"}
          </a>
          <span className="text-xs text-[#94a3b8] shrink-0">{formatCount(prospect.subscriber_count)} subs</span>
          <span className={`text-[10px] px-2 py-0.5 shrink-0 ${prospect.status === "responded" ? "text-[#a78bfa] bg-[#a78bfa]/10" : "text-[#94a3b8] bg-[#111]"}`}>
            {prospect.status}
          </span>
        </div>
        <p className="text-[#64748b] text-xs">{prospect.artist_name}</p>
        {prospect.recent_video_title && (
          <p className="text-[#cbd5e1] text-xs leading-relaxed mt-1 truncate">{prospect.recent_video_title}</p>
        )}
      </div>
      <Link
        href={`/admin/prospects/${prospect.id}`}
        className="text-xs font-semibold px-3 py-2 hover:brightness-110 transition-all shrink-0"
        style={{ backgroundColor: "#e8833a", color: "#0a0a0a" }}
      >
        Compose DM →
      </Link>
    </div>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────

function ProspectsBuilder({ lanes, password }: { lanes: LaneOption[]; password: string }) {
  const [laneId, setLaneId] = useState("");
  const [artistName, setArtistName] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [saveStatuses, setSaveStatuses] = useState<Record<string, SaveStatus>>({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const [savedProspects, setSavedProspects] = useState<SavedProspect[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState("");

  // Session-only — a skipped channel shouldn't reappear even after a fresh
  // "Find Producers" click on the same (or a different) lane this session.
  const skippedRef = useRef<Set<string>>(new Set());

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError("");
    try {
      const res = await fetch("/api/admin/prospects/list", { headers: { "x-admin-password": password } });
      const data = await res.json();
      if (!res.ok) {
        setSavedError(data.error ?? "Failed to load saved prospects");
        return;
      }
      setSavedProspects(data.prospects ?? []);
    } catch {
      setSavedError("Network error.");
    } finally {
      setSavedLoading(false);
    }
  }, [password]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const handleFind = useCallback(async () => {
    if (!laneId) return;
    setSearching(true);
    setSearchError("");
    setHasSearched(true);
    try {
      const res = await fetch("/api/admin/prospects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ laneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Search failed");
        setProspects([]);
        return;
      }
      setArtistName(data.artistName ?? "");
      setProspects((data.prospects as Prospect[]).filter((p) => !skippedRef.current.has(p.channelId)));
      setSaveStatuses({});
    } catch {
      setSearchError("Network error.");
      setProspects([]);
    } finally {
      setSearching(false);
    }
  }, [laneId, password]);

  const handleSave = async (prospect: Prospect) => {
    setSaveStatuses((s) => ({ ...s, [prospect.channelId]: "saving" }));
    try {
      const res = await fetch("/api/admin/prospects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          channelId: prospect.channelId,
          channelName: prospect.channelName,
          subscriberCount: prospect.subscriberCount,
          recentVideoTitle: prospect.recentVideoTitle,
          laneId,
          artistName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatuses((s) => ({ ...s, [prospect.channelId]: "error" }));
        return;
      }
      setSaveStatuses((s) => ({ ...s, [prospect.channelId]: "saved" }));
      // Prepend rather than refetch — the save route already returns the
      // full upserted row (including its id), so the new "Compose DM" link
      // is available immediately without a second round trip.
      const saved: SavedProspect = data.prospect;
      setSavedProspects((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
    } catch {
      setSaveStatuses((s) => ({ ...s, [prospect.channelId]: "error" }));
    }
  };

  const handleSkip = (prospect: Prospect) => {
    skippedRef.current.add(prospect.channelId);
    setProspects((prev) => prev.filter((p) => p.channelId !== prospect.channelId));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Producer Finder</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Find candidate producers by lane — active channels in the 500–50K sub sweet spot, not yet saved.
        </p>

        <div className="flex items-end gap-3 mb-8">
          <div className="flex-1">
            <LanePicker label="Lane" lanes={lanes} value={laneId} onChange={setLaneId} />
          </div>
          <button
            onClick={handleFind}
            disabled={!laneId || searching}
            className="text-sm font-semibold px-5 py-3 hover:brightness-110 disabled:opacity-40 transition-all shrink-0"
            style={{ backgroundColor: "#e8833a", color: "#0a0a0a" }}
          >
            {searching ? "Searching..." : "Find Producers"}
          </button>
        </div>

        {searchError && <p className="text-[#f87171] text-sm mb-6">{searchError}</p>}

        {searching ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
          </div>
        ) : !hasSearched ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#475569] text-sm">Select a lane and click &quot;Find Producers&quot; to search.</p>
          </div>
        ) : prospects.length === 0 && !searchError ? (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="text-[#94a3b8] text-sm">No new candidates found for {artistName || "this lane"}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prospects.map((p) => (
              <ProspectCard
                key={p.channelId}
                prospect={p}
                saveStatus={saveStatuses[p.channelId] ?? "idle"}
                onSave={() => handleSave(p)}
                onSkip={() => handleSkip(p)}
              />
            ))}
          </div>
        )}

        {/* Saved prospects — status pending/responded, each links to the DM composer */}
        <div className="mt-12">
          <h2 className="text-sm font-semibold mb-4">Saved Prospects</h2>
          {savedError && <p className="text-[#f87171] text-sm mb-4">{savedError}</p>}
          {savedLoading ? (
            <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-8 text-center">
              <div className="w-4 h-4 border border-[#475569] border-t-white rounded-full animate-spin mx-auto" />
            </div>
          ) : savedProspects.length === 0 ? (
            <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-8 text-center">
              <p className="text-[#475569] text-sm">No saved prospects yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedProspects.map((p) => (
                <SavedProspectRow key={p.id} prospect={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminProspectsPage() {
  const [auth, setAuth] = useState<{ lanes: LaneOption[]; password: string } | null>(null);

  if (!auth) {
    return <LoginGate onAuth={(lanes, password) => setAuth({ lanes, password })} />;
  }
  return <ProspectsBuilder lanes={auth.lanes} password={auth.password} />;
}
