"use client";

import { useState } from "react";
import Link from "next/link";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  genre: string;
  youtube_channel: string;
  created_at: string;
}

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
        <Link
          href="/"
          className="block text-sm font-bold tracking-[0.25em] mb-12"
        >
          TALLY
        </Link>
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Enter the admin password to view waitlist signups.
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
  const [entries, setEntries] = useState<WaitlistEntry[]>(initialEntries);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const refresh = async () => {
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-[0.25em]">
            TALLY
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[#94a3b8] hidden sm:block">
              Admin · Waitlist
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

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Waitlist Signups</h1>
            <p className="text-[#94a3b8] text-sm">
              {entries.length} {entries.length === 1 ? "signup" : "signups"} total
            </p>
          </div>
          <button
            onClick={refresh}
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
                  {[
                    "Name",
                    "Email",
                    "Genre",
                    "YouTube Channel",
                    "Date Signed Up",
                  ].map((h) => (
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
                    <td className="px-5 py-4 text-white font-medium">
                      {entry.name}
                    </td>
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
