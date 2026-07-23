"use client";

// Admin-only social card generator UI. Stateless: no writes, no history —
// every render is a fresh GET to /api/admin/cards/render, previewed as a
// blob: URL rather than a raw <img src="/api/..."> so the admin password
// (sent as a header, same pattern as the rest of /admin) never has to travel
// through a query string.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface LaneOption {
  slug: string;
  displayName: string;
  opportunity: number;
}

type Template = "single" | "versus" | "weekly";
type Size = "landscape" | "portrait";
type Theme = "dark" | "light";

const TEMPLATES: { value: Template; label: string }[] = [
  { value: "single", label: "Single lane" },
  { value: "versus", label: "Versus" },
  { value: "weekly", label: "Lane of the Week" },
];

const SIZES: { value: Size; label: string }[] = [
  { value: "landscape", label: "Landscape 1200×675 (X)" },
  { value: "portrait", label: "Portrait 1080×1350 (IG)" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

// ── Login gate — same shared-secret pattern as /admin (see app/admin/page.tsx) ──

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
        <h1 className="text-2xl font-bold mb-2">Social Cards</h1>
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

// ── Searchable lane picker ───────────────────────────────────────────────

function LanePicker({
  label,
  lanes,
  value,
  onChange,
}: {
  label: string;
  lanes: LaneOption[];
  value: string;
  onChange: (slug: string) => void;
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

  const selected = lanes.find((l) => l.slug === value);
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
                key={l.slug}
                type="button"
                onClick={() => { onChange(l.slug); setQuery(""); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-[#1a1a1a] transition-colors ${
                  l.slug === value ? "bg-[#1a1a1a]" : ""
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

// ── Builder ──────────────────────────────────────────────────────────────

function buildRenderQuery(template: Template, size: Size, theme: Theme, laneSlug1: string, laneSlug2: string): string {
  const params = new URLSearchParams({ template, size, theme });
  if (template === "versus") {
    params.set("laneSlug1", laneSlug1);
    params.set("laneSlug2", laneSlug2);
  } else {
    params.set("laneSlug", laneSlug1);
  }
  return params.toString();
}

function CardsBuilder({ lanes, password }: { lanes: LaneOption[]; password: string }) {
  const [template, setTemplate] = useState<Template>("single");
  const [size, setSize] = useState<Size>("landscape");
  const [theme, setTheme] = useState<Theme>("dark");
  const [laneSlug1, setLaneSlug1] = useState("");
  const [laneSlug2, setLaneSlug2] = useState("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const canPreview = template === "versus" ? !!laneSlug1 && !!laneSlug2 : !!laneSlug1;
  const requestIdRef = useRef(0);

  // Guards against an older, slow render finishing after a newer one and
  // clobbering it — requestIdRef always reflects the most recently *started*
  // request, so a response only applies its result if it's still current.
  const fetchPreview = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const qs = buildRenderQuery(template, size, theme, laneSlug1, laneSlug2);
      const res = await fetch(`/api/admin/cards/render?${qs}`, {
        headers: { "x-admin-password": password },
      });
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPreviewError(data.error ?? "Failed to render card");
        return;
      }
      const blob = await res.blob();
      if (requestIdRef.current !== requestId) return;
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch {
      if (requestIdRef.current === requestId) setPreviewError("Network error.");
    } finally {
      if (requestIdRef.current === requestId) setPreviewLoading(false);
    }
  }, [template, size, theme, laneSlug1, laneSlug2, password]);

  useEffect(() => {
    // When canPreview is false there's nothing to fetch: the render below
    // checks canPreview first and ignores previewUrl entirely while it's
    // false, and the unmount effect below revokes whatever URL is still
    // outstanding.
    if (canPreview) fetchPreview();
  }, [canPreview, fetchPreview]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if (!previewUrl) return;
    const name = template === "versus" ? `${laneSlug1}-vs-${laneSlug2}` : laneSlug1;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `tally-${template}-${name}-${size}-${theme}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Social Cards</h1>
        <p className="text-[#94a3b8] text-sm mb-8">Generate branded lane cards for X/Instagram. Nothing here is saved.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
          {/* Controls */}
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Template</label>
              <div className="flex border border-[#1a1a1a]">
                {TEMPLATES.map((t, i) => (
                  <button
                    key={t.value}
                    onClick={() => setTemplate(t.value)}
                    className={`flex-1 text-xs px-2 py-2.5 transition-colors ${i > 0 ? "border-l border-[#1a1a1a]" : ""} ${
                      template === t.value ? "bg-white text-black font-semibold" : "text-[#94a3b8] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Size</label>
              <div className="flex border border-[#1a1a1a]">
                {SIZES.map((s, i) => (
                  <button
                    key={s.value}
                    onClick={() => setSize(s.value)}
                    className={`flex-1 text-xs px-2 py-2.5 transition-colors ${i > 0 ? "border-l border-[#1a1a1a]" : ""} ${
                      size === s.value ? "bg-white text-black font-semibold" : "text-[#94a3b8] hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Theme</label>
              <div className="flex border border-[#1a1a1a]">
                {THEMES.map((t, i) => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`flex-1 text-xs px-2 py-2.5 transition-colors ${i > 0 ? "border-l border-[#1a1a1a]" : ""} ${
                      theme === t.value ? "bg-white text-black font-semibold" : "text-[#94a3b8] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <LanePicker
              label={template === "versus" ? "Lane 1" : "Lane"}
              lanes={lanes}
              value={laneSlug1}
              onChange={setLaneSlug1}
            />

            {template === "versus" && (
              <LanePicker label="Lane 2" lanes={lanes} value={laneSlug2} onChange={setLaneSlug2} />
            )}

            <button
              onClick={handleDownload}
              disabled={!previewUrl || previewLoading}
              className="w-full text-sm font-semibold py-3 hover:brightness-110 disabled:opacity-40 transition-all"
              style={{ backgroundColor: "#e8833a", color: "#0a0a0a" }}
            >
              Download PNG
            </button>
          </div>

          {/* Preview */}
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 flex items-center justify-center min-h-[400px]">
            {!canPreview ? (
              <p className="text-[#475569] text-sm">
                {template === "versus" ? "Select both lanes to preview." : "Select a lane to preview."}
              </p>
            ) : previewError ? (
              <p className="text-[#f87171] text-sm">{previewError}</p>
            ) : (
              <div className="relative w-full">
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/60">
                    <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Card preview" className="w-full h-auto border border-[#1a1a1a]" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminCardsPage() {
  const [auth, setAuth] = useState<{ lanes: LaneOption[]; password: string } | null>(null);

  if (!auth) {
    return <LoginGate onAuth={(lanes, password) => setAuth({ lanes, password })} />;
  }
  return <CardsBuilder lanes={auth.lanes} password={auth.password} />;
}
