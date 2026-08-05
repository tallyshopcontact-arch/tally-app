"use client";

// Report Builder — generates a Tally growth report HTML file from any
// YouTube channel URL. Same shared-secret admin auth pattern as /admin/cards,
// /admin/insights, and /admin/prospects (each of those pages keeps its own
// copy of this LoginGate rather than importing a shared one — following that
// same convention here).
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SATURATED_THRESHOLD,
  MAX_MANUAL_ARTISTS,
  type ChannelAnalysis,
  type NicheCandidate,
  type ManualArtistScoreResult,
} from "@/lib/reports/channelAnalyzer";

type PrioritySlot = 1 | 2 | 3;
type PickerMode = "auto" | "manual";

// ── Login gate ────────────────────────────────────────────────────────────

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
      const data = await res.json();
      if (res.status === 401) setError("Incorrect password.");
      else if (!res.ok) setError(data.error ?? "Something went wrong.");
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
        <h1 className="text-2xl font-bold mb-2">Report Builder</h1>
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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "channel";
}

function downloadFilename(channelName: string, month: number, year: number): string {
  const mm = String(month).padStart(2, "0");
  return `tally_report_${slugify(channelName)}_${mm}${year}.html`;
}

const CANDIDATE_SOURCE_LABEL: Record<NicheCandidate["source"], string> = {
  own: "Your niche",
  expansion: "Co-mention pick",
  genre: "Genre pick",
  manual: "Your research",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Defaults to the previous completed calendar month — a report about the
// current month mid-way through would be misleading (see channelAnalyzer.ts).
function getDefaultMonthYear(): { month: number; year: number } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  return currentMonth === 1
    ? { month: 12, year: currentYear - 1 }
    : { month: currentMonth - 1, year: currentYear };
}

// ── Manual Curation mode — a scored candidate card ──────────────────────
// Distinct from the auto-picker's candidate rows: this card carries its OWN
// draft title-format + notes inputs (pre-filled from the real winner-data
// example, empty for notes) so the producer composes the pick before
// deciding which slot to assign it to — that draft is what actually seeds
// the slot's state on assignment (see ReportBuilder's assignPriority). Once
// assigned, further edits happen in the Priority N summary box above (same
// place auto-picker title-format edits already happen), not back on this
// card — this card's inputs stay a "compose your pick" staging area.

function ManualCandidateCard({
  candidate,
  isP1,
  isP2,
  isP3,
  onAssign,
}: {
  candidate: NicheCandidate;
  isP1: boolean;
  isP2: boolean;
  isP3: boolean;
  onAssign: (candidate: NicheCandidate, slot: PrioritySlot, titleFormat: string, notes: string) => void;
}) {
  const [titleFormat, setTitleFormat] = useState(candidate.titleFormatExample);
  const [notes, setNotes] = useState("");

  return (
    <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <span className="text-sm font-bold text-white">{candidate.score.artistName}</span>
          <span className="text-[#475569] text-xs">
            {" "}
            · Opportunity {candidate.score.opportunity}/100 · Saturation {candidate.score.saturation}/100 · Demand{" "}
            {candidate.score.demand}/100 · Winnability {candidate.score.winnability}/100
          </span>
          {candidate.score.saturation >= SATURATED_THRESHOLD && (
            <span className="text-[10px] text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-0.5 ml-2">Saturated</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onAssign(candidate, 1, titleFormat, notes)}
            className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP1 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
          >
            {isP1 ? "✓ Priority 1" : "Assign Priority 1"}
          </button>
          <button
            onClick={() => onAssign(candidate, 2, titleFormat, notes)}
            className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP2 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
          >
            {isP2 ? "✓ Priority 2" : "Assign Priority 2"}
          </button>
          <button
            onClick={() => onAssign(candidate, 3, titleFormat, notes)}
            className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP3 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
          >
            {isP3 ? "✓ Priority 3" : "Assign Priority 3"}
          </button>
        </div>
      </div>
      {candidate.topCoMentions.length > 0 && (
        <p className="text-xs text-[#94a3b8] mb-1.5">
          Co-mentions: {candidate.topCoMentions.map((cm) => `${cm.artist} (${cm.pct}%)`).join(", ")}
        </p>
      )}
      {candidate.realExampleTitle && (
        <p className="text-xs text-[#475569] italic mb-2">&quot;{candidate.realExampleTitle}&quot;</p>
      )}
      <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1">Title Format</label>
      <textarea
        value={titleFormat}
        onChange={(e) => setTitleFormat(e.target.value)}
        rows={2}
        className="w-full bg-[#0a0a0a] border border-[#1e1e1e] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none mb-2"
      />
      <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1">Notes — why this pick</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Why this artist fits, or why the producer should focus here…"
        rows={2}
        className="w-full bg-[#0a0a0a] border border-[#1e1e1e] px-2.5 py-2 text-xs text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
      />
    </div>
  );
}

// ── Builder ───────────────────────────────────────────────────────────────

function ReportBuilder({ password }: { password: string }) {
  const [channelUrl, setChannelUrl] = useState("");
  const defaultMonthYear = getDefaultMonthYear();
  const [month, setMonth] = useState<number>(defaultMonthYear.month);
  const [year, setYear] = useState<number>(defaultMonthYear.year);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analysis, setAnalysis] = useState<ChannelAnalysis | null>(null);

  const [experiment, setExperiment] = useState("");
  const [experimentAutoGenerated, setExperimentAutoGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [recommendationsWarning, setRecommendationsWarning] = useState("");
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  // Niche picker (curator model) — all three priorities are assigned from
  // the SAME candidate pool regardless of which mode supplied it
  // (analysis.nicheCandidates for Auto-Suggest, manualResults for Manual —
  // see pickerMode below). Priority 3 just starts pre-selected to
  // analysis.defaultHoldCandidate (the channel's highest-opportunity current
  // niche) as a sensible default the admin can change like any other pick.
  // Each title format field starts pre-filled from the candidate's
  // winner-data example but stays fully editable; notes are always optional
  // free text ("why this pick"), surfaced in the report's Section 3.
  const [priority1, setPriority1] = useState<NicheCandidate | null>(null);
  const [titleFormat1, setTitleFormat1] = useState("");
  const [notes1, setNotes1] = useState("");
  const [priority2, setPriority2] = useState<NicheCandidate | null>(null);
  const [titleFormat2, setTitleFormat2] = useState("");
  const [notes2, setNotes2] = useState("");
  const [priority3, setPriority3] = useState<NicheCandidate | null>(null);
  const [titleFormat3, setTitleFormat3] = useState("");
  const [notes3, setNotes3] = useState("");

  // Manual Curation mode — up to MAX_MANUAL_ARTISTS producer-researched
  // artist names, scored through the real pipeline via /score-artists
  // before they're offered as candidates. Auto-Suggest (analysis.nicheCandidates)
  // stays available unchanged in "auto" mode; this is purely additive.
  const [pickerMode, setPickerMode] = useState<PickerMode>("auto");
  const [manualNames, setManualNames] = useState<string[]>(Array(MAX_MANUAL_ARTISTS).fill(""));
  const [manualScoring, setManualScoring] = useState(false);
  const [manualScoreError, setManualScoreError] = useState("");
  const [manualResults, setManualResults] = useState<ManualArtistScoreResult[] | null>(null);

  // "Recommend staying in current niches" — an explicit alternative to
  // picking new priorities at all. When on, hides the picker (both modes)
  // in favor of one reasoning field; Section 3 reflects the consolidation
  // stance and Section 4 builds from the channel's own current niches.
  const [stayInCurrentNiches, setStayInCurrentNiches] = useState(false);
  const [stayNotes, setStayNotes] = useState("");

  const handleAnalyze = async () => {
    if (!channelUrl.trim() || !month || !year) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setAnalysis(null);
    setReportHtml(null);
    setExperiment("");
    setExperimentAutoGenerated(false);
    setPriority1(null);
    setTitleFormat1("");
    setNotes1("");
    setPriority2(null);
    setTitleFormat2("");
    setNotes2("");
    setPriority3(null);
    setTitleFormat3("");
    setNotes3("");
    setPickerMode("auto");
    setManualNames(Array(MAX_MANUAL_ARTISTS).fill(""));
    setManualScoring(false);
    setManualScoreError("");
    setManualResults(null);
    setStayInCurrentNiches(false);
    setStayNotes("");
    try {
      const res = await fetch("/api/admin/report-builder/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), month, year }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error ?? "Analysis failed");
        return;
      }
      setAnalysis(data.analysis);
      // Step 9 (channelAnalyzer.ts) — the diagnosis expressed as a testable
      // bet, pre-filled with this channel's real data. Still just a starting
      // point: fully editable below, and the blank-block guard still applies
      // if it gets cleared out entirely. Fix 2's regeneration effect (below)
      // refreshes this once Priority 1/3 are actually assigned.
      const generatedText = data.analysis?.generatedExperiment?.text ?? "";
      setExperiment(generatedText);
      setExperimentAutoGenerated(!!generatedText);
      // Fix 3 — Priority 3 pre-selects to the channel's own highest-
      // opportunity niche (guaranteed a slot in nicheCandidates), same as any
      // other candidate pick — the admin can reassign it to anything else in
      // the pool.
      const hold = data.analysis?.defaultHoldCandidate ?? null;
      setPriority3(hold);
      setTitleFormat3(hold?.titleFormatExample ?? "");
    } catch {
      setAnalyzeError("Network error.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Click-to-assign, with a toggle-off and a same-candidate guard: assigning
  // a candidate already in ANOTHER slot moves it rather than duplicating it,
  // and clicking a slot's own current candidate again un-assigns it. Fix 3 —
  // extended from 2 slots to 3 now that Priority 3 shares the same pool.
  // titleFormat/notes default to the candidate's own winner-data example /
  // empty when not supplied (auto-picker cards call it that way); Manual
  // Curation mode's cards pass their own composed draft values instead (see
  // ManualCandidateCard).
  const currentInSlot = (slot: PrioritySlot): NicheCandidate | null =>
    slot === 1 ? priority1 : slot === 2 ? priority2 : priority3;

  const clearSlot = (slot: PrioritySlot) => {
    if (slot === 1) { setPriority1(null); setTitleFormat1(""); setNotes1(""); }
    else if (slot === 2) { setPriority2(null); setTitleFormat2(""); setNotes2(""); }
    else { setPriority3(null); setTitleFormat3(""); setNotes3(""); }
  };

  const assignPriority = (
    candidate: NicheCandidate,
    slot: PrioritySlot,
    titleFormat: string = candidate.titleFormatExample,
    notes: string = ""
  ) => {
    const isInSlot = (s: PrioritySlot) => currentInSlot(s)?.score.laneId === candidate.score.laneId;

    if (isInSlot(slot)) { clearSlot(slot); return; } // toggle off
    ([1, 2, 3] as PrioritySlot[]).forEach((s) => { if (s !== slot && isInSlot(s)) clearSlot(s); });

    if (slot === 1) { setPriority1(candidate); setTitleFormat1(titleFormat); setNotes1(notes); }
    else if (slot === 2) { setPriority2(candidate); setTitleFormat2(titleFormat); setNotes2(notes); }
    else { setPriority3(candidate); setTitleFormat3(titleFormat); setNotes3(notes); }
  };

  const readyToGenerate = stayInCurrentNiches ? stayNotes.trim().length > 0 : !!priority1 && !!priority2;

  // Fix 2 — regenerate the draft experiment from Priority 1/3's real
  // selections whenever they change, as long as the field is still an
  // untouched auto-draft (experimentAutoGenerated) — a hand-edited experiment
  // is never silently overwritten by a priority change. Pure computation
  // server-side (no quota spend — see the /experiment route), so this is
  // cheap to fire on every selection change.
  useEffect(() => {
    if (!analysis || !experimentAutoGenerated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/report-builder/experiment", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({
            analysis,
            selection: {
              priority1: priority1 ? { laneId: priority1.score.laneId, artistName: priority1.score.artistName } : null,
              priority3: priority3 ? { laneId: priority3.score.laneId, artistName: priority3.score.artistName } : null,
            },
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.generatedExperiment?.text) {
          setExperiment(data.generatedExperiment.text);
        }
      } catch {
        // Best-effort — leave whatever's currently drafted if the regenerate call fails.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, priority1?.score.laneId, priority3?.score.laneId]);

  const handleGenerate = async () => {
    if (!analysis || !experiment.trim()) return;
    if (stayInCurrentNiches ? !stayNotes.trim() : !priority1 || !priority2) return;
    setGenerating(true);
    setGenerateError("");
    setRecommendationsWarning("");
    try {
      // Manual Curation mode's scored candidates aren't part of `analysis`
      // (they were scored in a later, separate request) — resend whichever
      // ones actually got scored so the server can resolve a manual pick's
      // laneId back to its real NicheScore (see report/route.ts's
      // resolveCandidateScore). Harmless to send all of them regardless of
      // which ended up assigned.
      const manualCandidates = (manualResults ?? [])
        .map((r) => r.candidate)
        .filter((c): c is NicheCandidate => c !== null);

      const selectedPlan = stayInCurrentNiches
        ? {}
        : {
            priority1: { laneId: priority1!.score.laneId, titleFormat: titleFormat1, notes: notes1 },
            priority2: { laneId: priority2!.score.laneId, titleFormat: titleFormat2, notes: notes2 },
            ...(priority3
              ? { priority3: { laneId: priority3.score.laneId, titleFormat: titleFormat3, notes: notes3 } }
              : {}),
          };

      const res = await fetch("/api/admin/report-builder/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          analysis,
          experiment,
          month,
          year,
          selectedPlan,
          manualCandidates,
          ...(stayInCurrentNiches ? { stayInCurrentNiches: { notes: stayNotes } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "Report generation failed");
        return;
      }
      setReportHtml(data.html);
      if (data.recommendationsSaved === false) {
        setRecommendationsWarning(
          "Report generated, but the tracking record failed to save — next month's grading data may be incomplete for this channel."
        );
      }
    } catch {
      setGenerateError("Network error.");
    } finally {
      setGenerating(false);
    }
  };

  const handleScoreManual = async () => {
    if (!analysis) return;
    const names = manualNames.map((n) => n.trim()).filter(Boolean).slice(0, MAX_MANUAL_ARTISTS);
    if (!names.length) return;
    setManualScoring(true);
    setManualScoreError("");
    setManualResults(null);
    try {
      const res = await fetch("/api/admin/report-builder/score-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ analysis, artistNames: names }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualScoreError(data.error ?? "Scoring failed");
        return;
      }
      setManualResults(data.results);
    } catch {
      setManualScoreError("Network error.");
    } finally {
      setManualScoring(false);
    }
  };

  // "Stay in current niches" supersedes the picker entirely — clear whatever
  // priorities were assigned so a stale pick can't leak into a consolidation
  // report if the admin flips the toggle back off later without re-picking.
  const handleToggleStayInCurrentNiches = (next: boolean) => {
    setStayInCurrentNiches(next);
    if (next) {
      clearSlot(1);
      clearSlot(2);
      clearSlot(3);
    }
  };

  const handleDownload = () => {
    if (!reportHtml || !analysis) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename(analysis.channel.channelName, month, year);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-[0.3em] hover:text-[#94a3b8] transition-colors">TALLY</Link>
          <Link href="/admin" className="text-sm text-[#94a3b8] hover:text-white transition-colors">← Admin</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Report Builder</h1>
        <p className="text-[#94a3b8] text-sm mb-8">
          Generate a growth report from any YouTube channel URL. Analysis takes 5-10 seconds.
        </p>

        {/* Report month/year */}
        <div className="mb-4 flex gap-3">
          <div className="w-40">
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Report Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              required
              className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">Report Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
              className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3a3a3a] transition-colors"
            >
              {[0, 1, 2].map((back) => {
                const y = new Date().getFullYear() - back;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Channel URL input */}
        <div className="mb-8">
          <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">YouTube Channel URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !analyzing && handleAnalyze()}
              placeholder="youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name"
              className="flex-1 bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !channelUrl.trim() || !month || !year}
              className="text-sm font-semibold bg-white text-black px-6 py-3 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {analyzing ? "Analyzing..." : "Analyze Channel"}
            </button>
          </div>
          {analyzeError && <p className="text-[#f87171] text-xs mt-2">{analyzeError}</p>}
        </div>

        {/* Loading state */}
        {analyzing && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center mb-8">
            <div className="w-5 h-5 border border-[#475569] border-t-white rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[#94a3b8] text-sm">Pulling channel data and scoring niches — this takes 5-10 seconds.</p>
          </div>
        )}

        {/* Analysis preview */}
        {analysis && !analyzing && (
          <div className="border border-[#1a1a1a] bg-[#0d0d0d] p-6 mb-8">
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">{analysis.channel.channelName}</h2>
                <p className="text-[#94a3b8] text-sm">{analysis.channel.subscriberCount.toLocaleString()} subscribers · {analysis.channel.videoCount.toLocaleString()} total videos</p>
              </div>
              {analysis.limitedData && (
                <span className="text-[10px] text-[#fbbf24] bg-[#fbbf24]/10 px-2.5 py-1">
                  Limited data — only {analysis.recentUploads.length} upload{analysis.recentUploads.length === 1 ? "" : "s"} found
                </span>
              )}
            </div>

            <p className="text-xs text-[#94a3b8] uppercase tracking-widest mb-3">Detected Niches</p>
            {analysis.detectedNiches.length === 0 ? (
              <p className="text-[#475569] text-sm mb-5">No niches detected from recent uploads.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-6">
                {analysis.detectedNiches.map((n) => (
                  <span
                    key={`${n.laneId ?? "untracked"}-${n.artistName}`}
                    className={`text-xs px-3 py-1.5 border ${n.laneId ? "border-[#1a1a1a] text-white" : "border-[#1a1a1a] text-[#94a3b8]"}`}
                  >
                    {n.artistName}
                    <span className="text-[#475569]"> · {n.uploadCount} upload{n.uploadCount === 1 ? "" : "s"} · {formatCount(n.avgViewsPerDay)}/day</span>
                    {!n.laneId && <span className="text-[10px] text-[#475569]"> (untracked)</span>}
                  </span>
                ))}
              </div>
            )}

            {/* "Recommend staying in current niches" — an explicit
                alternative to picking new priorities at all. Supersedes the
                whole picker below (both modes) when on. */}
            <div className="border-t border-[#1a1a1a] pt-6 mb-6">
              <label className="flex items-center gap-2 text-sm font-bold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={stayInCurrentNiches}
                  onChange={(e) => handleToggleStayInCurrentNiches(e.target.checked)}
                  className="accent-white"
                />
                Recommend staying in current niches
              </label>
              <p className="text-xs text-[#94a3b8] mt-1 mb-3">
                Skips picking new priorities — the report advises the producer to consolidate in their existing niches instead of expanding.
              </p>
              {stayInCurrentNiches && (
                <>
                  <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1">Reasoning</label>
                  <textarea
                    value={stayNotes}
                    onChange={(e) => setStayNotes(e.target.value)}
                    placeholder="Why consolidation is the right call this month…"
                    rows={3}
                    className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
                  />
                  <p className={`text-[10px] mt-1.5 ${stayNotes.trim() ? "text-[#475569]" : "text-[#f87171]"}`}>
                    {stayNotes.trim() ? "This becomes the report's Section 3 recommendation." : "Add your reasoning before generating"}
                  </p>
                </>
              )}
            </div>

            {!stayInCurrentNiches && (
              <>
                {/* Niche picker — curator model. Between analysis and
                    generation: the admin picks Priority 1, 2 & 3 from a
                    ranked, real-data shortlist instead of the plan being
                    auto-computed. Auto-Suggest pulls from TALLY's own
                    algorithm; Manual lets the producer supply their own
                    researched names, scored the same real way. */}
                <div className="border-t border-[#1a1a1a] pt-6 mb-6">
                  <p className="text-sm font-bold text-white mb-1">Select Your 3 Priority Niches</p>
                  <p className="text-xs text-[#94a3b8] mb-4">
                    Ranked by opportunity — click a candidate to assign it to Priority 1, 2, or 3. Priority 3 defaults to your
                    highest-opportunity current niche but is fully reassignable. Each title format pre-fills from real winner
                    data and stays editable.
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {(
                      [
                        [1, priority1, titleFormat1, setTitleFormat1, notes1, setNotes1],
                        [2, priority2, titleFormat2, setTitleFormat2, notes2, setNotes2],
                        [3, priority3, titleFormat3, setTitleFormat3, notes3, setNotes3],
                      ] as const
                    ).map(([slotNum, sel, fmt, setFmt, note, setNote]) => (
                      <div key={slotNum} className="border border-[#1a1a1a] bg-[#111] p-4">
                        <p className="text-[10px] text-[#94a3b8] uppercase tracking-widest mb-2">
                          Priority {slotNum}
                          {slotNum === 3 && sel && sel.score.laneId === analysis.defaultHoldCandidate?.score.laneId && (
                            <span className="normal-case text-[#475569] font-normal"> · default</span>
                          )}
                        </p>
                        {sel ? (
                          <>
                            <p className="text-sm font-bold text-white mb-2">{sel.score.artistName}</p>
                            <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1">Title Format</label>
                            <textarea
                              value={fmt}
                              onChange={(e) => setFmt(e.target.value)}
                              rows={2}
                              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none mb-2"
                            />
                            <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1">Notes</label>
                            <textarea
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Why this pick…"
                              rows={2}
                              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] px-2.5 py-2 text-xs text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
                            />
                          </>
                        ) : (
                          <p className="text-xs text-[#475569]">Not assigned — pick a candidate below.</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Mode toggle — Auto-Suggest (TALLY's algorithm, unchanged)
                      vs Manual (producer-researched names, scored for real). */}
                  <div className="flex gap-2 mb-4">
                    {(["auto", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setPickerMode(m)}
                        className={`text-xs font-semibold px-4 py-2 transition-colors ${pickerMode === m ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
                      >
                        {m === "auto" ? "Auto-Suggest" : "Manual"}
                      </button>
                    ))}
                  </div>

                  {pickerMode === "auto" ? (
                    analysis.nicheCandidates.length === 0 ? (
                      <p className="text-[#475569] text-sm mb-4">No open niche candidates found for this channel&#39;s genre yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 mb-4">
                        {analysis.nicheCandidates.map((c) => {
                          const isP1 = priority1?.score.laneId === c.score.laneId;
                          const isP2 = priority2?.score.laneId === c.score.laneId;
                          const isP3 = priority3?.score.laneId === c.score.laneId;
                          return (
                            <div key={c.score.laneId} className="border border-[#1a1a1a] bg-[#0d0d0d] p-4">
                              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                                <div>
                                  <span className="text-sm font-bold text-white">{c.score.artistName}</span>
                                  <span className="text-[#475569] text-xs"> · Opportunity {c.score.opportunity}/100 · {CANDIDATE_SOURCE_LABEL[c.source]}</span>
                                  {c.score.saturation >= SATURATED_THRESHOLD && (
                                    <span className="text-[10px] text-[#fbbf24] bg-[#fbbf24]/10 px-2 py-0.5 ml-2">Saturated</span>
                                  )}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={() => assignPriority(c, 1)}
                                    className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP1 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
                                  >
                                    {isP1 ? "✓ Priority 1" : "Assign Priority 1"}
                                  </button>
                                  <button
                                    onClick={() => assignPriority(c, 2)}
                                    className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP2 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
                                  >
                                    {isP2 ? "✓ Priority 2" : "Assign Priority 2"}
                                  </button>
                                  <button
                                    onClick={() => assignPriority(c, 3)}
                                    className={`text-[11px] font-semibold px-3 py-1.5 transition-colors ${isP3 ? "bg-white text-black" : "border border-[#1e1e1e] text-[#94a3b8] hover:text-white hover:border-[#3a3a3a]"}`}
                                  >
                                    {isP3 ? "✓ Priority 3" : "Assign Priority 3"}
                                  </button>
                                </div>
                              </div>
                              {c.topCoMentions.length > 0 && (
                                <p className="text-xs text-[#94a3b8] mb-1.5">
                                  Co-mentions: {c.topCoMentions.map((cm) => `${cm.artist} (${cm.pct}%)`).join(", ")}
                                </p>
                              )}
                              {c.realExampleTitle && (
                                <p className="text-xs text-[#475569] italic">&quot;{c.realExampleTitle}&quot;</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="mb-4">
                      <p className="text-xs text-[#94a3b8] mb-3">
                        Enter up to {MAX_MANUAL_ARTISTS} artist names you&#39;ve researched — TALLY scores each one with real
                        data (analyzed live if it isn&#39;t already cached) so you pick from actual numbers, not guesses.
                      </p>
                      <div className="grid grid-cols-1 gap-2 mb-3">
                        {manualNames.map((name, i) => (
                          <input
                            key={i}
                            type="text"
                            value={name}
                            onChange={(e) => {
                              const next = [...manualNames];
                              next[i] = e.target.value;
                              setManualNames(next);
                            }}
                            placeholder={`Artist ${i + 1}`}
                            className="w-full bg-[#111] border border-[#1e1e1e] px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors"
                          />
                        ))}
                      </div>
                      <button
                        onClick={handleScoreManual}
                        disabled={manualScoring || !manualNames.some((n) => n.trim())}
                        className="text-sm font-semibold bg-white text-black px-5 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors mb-4"
                      >
                        {manualScoring ? "Scoring..." : "Score These"}
                      </button>
                      {manualScoreError && <p className="text-[#f87171] text-xs mb-4">{manualScoreError}</p>}

                      {manualResults && (
                        <div className="grid grid-cols-1 gap-3">
                          {manualResults.map((r) =>
                            r.candidate ? (
                              <ManualCandidateCard
                                key={r.candidate.score.laneId}
                                candidate={r.candidate}
                                isP1={priority1?.score.laneId === r.candidate.score.laneId}
                                isP2={priority2?.score.laneId === r.candidate.score.laneId}
                                isP3={priority3?.score.laneId === r.candidate.score.laneId}
                                onAssign={assignPriority}
                              />
                            ) : (
                              <div key={r.artistName} className="border border-[#3a1a1a] bg-[#150d0d] p-4">
                                <span className="text-sm font-bold text-white">{r.artistName}</span>
                                <p className="text-[#f87171] text-xs mt-1">{r.error}</p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Fix 2 — surfaced at the picker step (same screen as Priority
                1/2), not gated behind assigning both priorities first: the
                experiment is already auto-generated by the time analysis
                lands, so it should be reviewable/editable immediately. The
                blank-block guard (server AND client) still blocks Generate
                with an empty field either way. */}
            <div className="border-t border-[#1a1a1a] pt-6 mb-6">
              <label className="block text-xs text-[#94a3b8] uppercase tracking-widest mb-2">
                Section 5 — This Month&#39;s Experiment {experimentAutoGenerated ? "(drafted by TALLY — edit as needed)" : "(written by you)"}
              </label>
              <textarea
                value={experiment}
                onChange={(e) => { setExperiment(e.target.value); setExperimentAutoGenerated(false); }}
                placeholder='e.g. "Drop Drake for 30 days and reallocate those slots to Veeze."'
                rows={3}
                className="w-full bg-[#111] border border-[#1e1e1e] px-4 py-3 text-sm text-white placeholder:text-[#475569] focus:outline-none focus:border-[#3a3a3a] transition-colors resize-none"
              />
              <p className={`text-[10px] mt-1.5 ${experiment.trim() ? "text-[#475569]" : "text-[#f87171]"}`}>
                {experiment.trim() ? "This becomes the report's Section 5 — This Month's Experiment." : "Add an experiment before generating"}
              </p>
            </div>

            {readyToGenerate && (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !experiment.trim()}
                  className="text-sm font-semibold bg-white text-black px-6 py-2.5 hover:bg-[#e8e8e8] disabled:opacity-40 transition-colors"
                >
                  {generating ? "Generating..." : "Generate Report"}
                </button>
                {generateError && <p className="text-[#f87171] text-xs mt-2">{generateError}</p>}
              </>
            )}
          </div>
        )}

        {/* Report result */}
        {reportHtml && (
          <div>
            {recommendationsWarning && (
              <p className="text-[#fbbf24] text-xs mb-4 bg-[#fbbf24]/10 px-3 py-2">{recommendationsWarning}</p>
            )}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Report Preview</h2>
              <button
                onClick={handleDownload}
                className="text-sm font-semibold bg-white text-black px-5 py-2.5 hover:bg-[#e8e8e8] transition-colors"
              >
                Download HTML
              </button>
            </div>
            <div className="border border-[#1a1a1a] bg-[#0d0d0d]">
              <iframe
                srcDoc={reportHtml}
                title="Report preview"
                className="w-full"
                style={{ height: "80vh", border: "none" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ReportBuilderPage() {
  const [password, setPassword] = useState<string | null>(null);

  if (!password) {
    return <LoginGate onAuth={setPassword} />;
  }
  return <ReportBuilder password={password} />;
}
