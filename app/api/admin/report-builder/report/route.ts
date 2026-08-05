// Report Builder — HTML report generation endpoint. Takes the analysis
// object the client already fetched from /analyze (no new YouTube calls here)
// plus a human-written experiment line, and renders it into the
// tally_report_dark.html design (Nunito + Outfit, dark panel layout) as one
// self-contained HTML string the client can preview in an iframe and download.
import { NextRequest, NextResponse } from "next/server";
import type { ChannelAnalysis, Diagnosis, DetectedNiche, NicheScore, RecentUpload } from "@/lib/reports/channelAnalyzer";
import { monthLabel } from "@/lib/reports/channelAnalyzer";
import { findSmallChannelExample } from "@/lib/lanes/nicheMatch";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        analysis?: ChannelAnalysis;
        experiment?: string;
        month?: number;
        year?: number;
        selectedPlan?: SelectedPlan;
      }
    | null;
  if (!body?.analysis) {
    return NextResponse.json({ error: "Missing analysis" }, { status: 400 });
  }
  const month = body.month ?? body.analysis.reportMonth;
  const year = body.year ?? body.analysis.reportYear;
  if (!month || !year) {
    return NextResponse.json({ error: "Missing month/year" }, { status: 400 });
  }

  // Server-side enforcement of the same rule the client already disables its
  // button for — a report without an experiment isn't sending-quality, and
  // the client check alone doesn't stop a direct API call.
  const experiment = (body.experiment ?? "").trim();
  if (!experiment) {
    return NextResponse.json({ error: "Missing experiment — add one before generating." }, { status: 400 });
  }

  // Curator model — same defense-in-depth as the experiment check above:
  // the picker UI already requires both before enabling Generate, but a
  // direct API call could skip it.
  const selectedPlan = body.selectedPlan ?? {};
  if (!selectedPlan.priority1?.laneId || !selectedPlan.priority2?.laneId) {
    return NextResponse.json(
      { error: "Missing niche selections — assign Priority 1 and Priority 2 before generating." },
      { status: 400 }
    );
  }

  try {
    const { html, plan } = buildReportHtml(body.analysis, experiment, month, year, selectedPlan);

    // Growth-report tracking — the input side of next month's (not-yet-built)
    // grading loop. Best-effort: a DB hiccup here must not cost the admin
    // the HTML report they're waiting on, but it's surfaced back to the
    // client (recommendationsSaved) rather than silently swallowed, since a
    // silent miss here is a permanent gap next month's grading can't recover.
    const recommendations = buildRecommendationsPayload(body.analysis, experiment, plan);
    let recommendationsSaved = true;
    try {
      const supabase = createServerClient();
      const { error: insertErr } = await supabase.from("growth_reports").upsert(
        {
          channel_id: body.analysis.channel.channelId,
          channel_name: body.analysis.channel.channelName,
          report_month: month,
          report_year: year,
          diagnosis_type: recommendations.diagnosisType,
          recommendations,
        },
        { onConflict: "channel_id,report_month,report_year" }
      );
      if (insertErr) throw new Error(insertErr.message);
    } catch (persistErr) {
      console.error("[report-builder/report] failed to persist recommendations:", persistErr);
      recommendationsSaved = false;
    }

    return NextResponse.json({ html, recommendationsSaved });
  } catch (err) {
    console.error("[report-builder/report] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Report generation failed: ${message}` }, { status: 500 });
  }
}

// ── Small formatting helpers ─────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Fix 2 — a low absolute score with no trend data is a different claim than
// a declining niche. computeStatus (lib/lanes/scoring.ts) only ever sees the
// current opportunity number, so its "red" tells us nothing about whether
// this is a niche in decline or one that's simply always scored low and
// hasn't been re-analyzed yet. "Exit" implies the former; without a prior
// saturation reading to confirm it, this reports "Tough" instead — still a
// real warning, but not a claim TALLY can't yet back up. green/yellow never
// needed this distinction, so they pass straight through.
type ReportStatusKey = "open" | "hold" | "tough" | "exit";

interface ReportStatus {
  key: ReportStatusKey;
  label: string;
  color: string;
  bg: string;
  /** Replaces the old flat STATUS_LABEL lookup — "tough" and "exit" now read
   * differently since one is a confirmed decline and the other isn't. */
  narrative: string;
}

const OPEN_COLOR = { color: "#10B981", bg: "rgba(16,185,129,0.12)" };
const HOLD_COLOR = { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
const LOW_COLOR = { color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
const UNTRACKED_BADGE = { label: "Untracked", color: "#475569", bg: "rgba(71,85,105,0.14)" };

function getNicheReportStatus(score: NicheScore): ReportStatus {
  if (score.status === "green") {
    return { key: "open", label: "Open", ...OPEN_COLOR, narrative: "a strong opportunity" };
  }
  if (score.status === "yellow") {
    return { key: "hold", label: "Hold", ...HOLD_COLOR, narrative: "a moderate opportunity" };
  }
  // status === "red" (opportunity < 40) — Fix 2's split.
  if (score.priorSaturation === null) {
    return {
      key: "tough",
      label: "Tough",
      ...LOW_COLOR,
      narrative: "a tough lane right now — no trend data yet to call it a decline",
    };
  }
  return { key: "exit", label: "Exit", ...LOW_COLOR, narrative: "a lane trending down, with a measurable decline" };
}

// ── Report builder ───────────────────────────────────────────────────────

interface ReportBuild {
  html: string;
  plan: ActionPlan;
}

function buildReportHtml(
  analysis: ChannelAnalysis,
  experiment: string,
  month: number,
  year: number,
  selectedPlan: SelectedPlan
): ReportBuild {
  const monthYear = monthLabel(month, year);

  const uploads = analysis.recentUploads;
  // Fix 1 — a video can land in more than one niche group now (a co-mention
  // title counts toward every artist it names), so this maps to an array,
  // not a single DetectedNiche.
  const nicheByVideoId = new Map<string, DetectedNiche[]>();
  for (const n of analysis.detectedNiches) {
    for (const v of n.videos) {
      const list = nicheByVideoId.get(v.videoId) ?? [];
      list.push(n);
      nicheByVideoId.set(v.videoId, list);
    }
  }
  const nicheScoreByLaneId = new Map(analysis.nicheScores.map((s) => [s.laneId, s]));

  const bestNiche = analysis.detectedNiches[0] ?? null;
  const genreLabel = bestNiche?.genreHint ?? "Uncategorized";

  // Fix 3 — sections are numbered by what actually renders, not by a fixed
  // 01-05 scheme. Rising Windows (previously always "03") is only included
  // when there's real data, so everything after it shifts up rather than
  // leaving a gap or renumbering nothing.
  let sectionNumber = 1;
  const sections: string[] = [
    buildSection1(analysis, uploads, nicheByVideoId, nicheScoreByLaneId, monthYear, sectionNumber++),
    buildSection2(analysis, sectionNumber++),
  ];
  if (analysis.risingWindowsAvailable && analysis.risingWindows.length) {
    sections.push(buildSection3(analysis, sectionNumber++));
  }
  const plan = buildSelectedPlanCards(analysis, selectedPlan);
  sections.push(buildSection4(analysis, sectionNumber++, plan));
  sections.push(buildSection5(experiment, monthYear, sectionNumber++));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Tally — Channel Growth Report · ${escapeHtml(analysis.channel.channelName)} · ${monthYear}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@200;300;400;600;700;800&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
${REPORT_CSS}
</style>
</head>
<body>
<div class="page">

  ${buildCoverHeader(analysis, monthYear, genreLabel)}
  ${buildDiagnosisHeadline(analysis.diagnosis)}
  ${sections.join("\n  ")}
  ${buildMethodologySection(analysis)}

  <div class="report-footer">
    <div class="rf-logo"><span>t</span>ally</div>
    <div class="rf-meta">tallyagc.com · ${monthYear} · Confidential — ${escapeHtml(analysis.channel.channelName)} only</div>
    <div class="rf-page">Page 1 of 1</div>
  </div>

</div>
</body>
</html>
`;

  return { html, plan };
}

function buildCoverHeader(analysis: ChannelAnalysis, monthYear: string, genreLabel: string): string {
  const name = escapeHtml(analysis.channel.channelName);
  return `
  <div class="cover-header">
    <div class="cover-top">
      <div>
        <div class="logo"><span>t</span>ally</div>
        <div class="logo-sub">Growth Intelligence</div>
      </div>
      <div class="cover-titles">
        <div class="cover-eyebrow">Channel Growth Report · ${monthYear}</div>
        <h1 class="cover-title"><strong>${name}</strong> — Monthly Growth Report</h1>
        <div class="cover-subtitle">Niche Intelligence · Upload Strategy · Rising Windows</div>
      </div>
    </div>
    <div class="accent-bar"></div>
    <div class="meta-bar">
      <div class="meta-item">
        <div class="meta-label">Channel</div>
        <div class="meta-value">${name}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Subscribers</div>
        <div class="meta-value">${analysis.channel.subscriberCount.toLocaleString()}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Genre</div>
        <div class="meta-value">${escapeHtml(genreLabel)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Report Period</div>
        <div class="meta-value">${monthYear}</div>
      </div>
    </div>
    ${
      analysis.limitedData
        ? `<div class="week-note" style="margin-top:16px;">⚠ Limited data — only ${analysis.recentUploads.length} recent upload${analysis.recentUploads.length === 1 ? "" : "s"} found. More uploads are needed for a full analysis; treat the numbers below as directional.</div>`
        : ""
    }
  </div>`;
}

// Step 8 (channelAnalyzer.ts) — the report headline, rendered above Section 1
// as one root cause rather than a stats wall. headline/detail are plain text
// from the analyzer (see Diagnosis's doc comment) — this is the one place
// that turns them into markup, escaping both since they can embed a
// channel-sourced niche/artist name.
const DIAGNOSIS_EYEBROW: Record<Diagnosis["type"], string> = {
  expansion: "The Diagnosis · Expansion",
  concentration: "The Diagnosis · Concentration",
  discoverability: "The Diagnosis · Discoverability",
  positioning: "The Diagnosis · Positioning",
  consistency: "The Diagnosis · Consistency",
  scale: "The Diagnosis · Scale",
};

function buildDiagnosisHeadline(diagnosis: Diagnosis): string {
  return `
  <div class="diagnosis-block">
    <div class="diagnosis-eyebrow">${DIAGNOSIS_EYEBROW[diagnosis.type]}</div>
    <div class="diagnosis-headline">${escapeHtml(diagnosis.headline)}</div>
    <div class="diagnosis-detail">${escapeHtml(diagnosis.detail)}</div>
  </div>`;
}

// Fix 1 — a video can carry several niches now ("Boldy James x Larry June x
// Roc Marciano Type Beat" lands in all three), so this names every one of
// them, then adds the score detail for whichever named niche actually has
// lane data (the first one found, in title order) rather than picking just
// one to describe and silently dropping the rest.
function videoNicheCommentary(
  video: RecentUpload | null,
  nicheByVideoId: Map<string, DetectedNiche[]>,
  nicheScoreByLaneId: Map<string, NicheScore>
): string {
  if (!video) return "";
  const niches = nicheByVideoId.get(video.videoId) ?? [];
  if (!niches.length) return "This upload didn&#39;t match a niche TALLY currently tracks.";

  const names = niches.map((n) => `<strong>${escapeHtml(n.artistName)}</strong>`).join(", ");
  const nicheWord = niches.length > 1 ? "niches" : "niche";

  const scoredNiche = niches.find((n) => n.laneId && nicheScoreByLaneId.has(n.laneId));
  if (!scoredNiche) {
    const allUntracked = niches.every((n) => !n.laneId);
    return allUntracked
      ? `This upload landed in your ${names} ${nicheWord} — TALLY doesn&#39;t have lane data for ${niches.length > 1 ? "these yet (untracked niches)" : "it yet (untracked niche)"}.`
      : `This upload landed in your ${names} ${nicheWord}.`;
  }
  const score = nicheScoreByLaneId.get(scoredNiche.laneId!)!;
  const status = getNicheReportStatus(score);
  return `This upload landed in your ${names} ${nicheWord} — ${escapeHtml(scoredNiche.artistName)} is currently ${status.narrative} at <strong>${score.opportunity}/100</strong> (saturation ${score.saturation}/100).`;
}

function buildSection1(
  analysis: ChannelAnalysis,
  uploads: RecentUpload[],
  nicheByVideoId: Map<string, DetectedNiche[]>,
  nicheScoreByLaneId: Map<string, NicheScore>,
  monthYear: string,
  sectionNumber: number
): string {
  const numLabel = String(sectionNumber).padStart(2, "0");

  if (!uploads.length) {
    return `
  <div class="kpi-section">
    <div class="section-eyebrow">${numLabel} · Performance</div>
    <div class="section-title">Your Month at a Glance</div>
    <p style="font-size:13px;color:var(--sub);">No public uploads were found on this channel&#39;s uploads playlist yet.</p>
  </div>`;
  }

  const uploadCount = uploads.length;
  const totalViews = uploads.reduce((s, v) => s + v.viewCount, 0);
  const avgViewsPerDay = Math.round(uploads.reduce((s, v) => s + v.viewsPerDay, 0) / uploadCount);
  const sortedByVelocity = [...uploads].sort((a, b) => b.viewsPerDay - a.viewsPerDay);
  const best = sortedByVelocity[0];
  const worst = sortedByVelocity[sortedByVelocity.length - 1];
  const hasDistinctWorst = uploads.length >= 2;
  const bestMultiplier = avgViewsPerDay > 0 ? best.viewsPerDay / avgViewsPerDay : null;

  const bestNichesForBest = nicheByVideoId.get(best.videoId) ?? [];
  const bestDeltaLabel = bestNichesForBest.length
    ? `${escapeHtml(bestNichesForBest.map((n) => n.artistName).join(" / "))} niche${bestNichesForBest.length > 1 ? "s" : ""}`
    : "Best upload";

  const bwGrid = hasDistinctWorst
    ? `
    <div class="bw-grid">
      <div class="bw-card best">
        <div class="bw-type">🏆 Best Upload</div>
        <div class="bw-title">${escapeHtml(best.title)}</div>
        <div class="bw-body"><strong>${formatViews(best.viewCount)} views${bestMultiplier ? ` · ${bestMultiplier.toFixed(1)}× your average` : ""}.</strong> ${videoNicheCommentary(best, nicheByVideoId, nicheScoreByLaneId)}</div>
      </div>
      <div class="bw-card worst">
        <div class="bw-type">📉 Worst Upload</div>
        <div class="bw-title">${escapeHtml(worst.title)}</div>
        <div class="bw-body">${formatViews(worst.viewCount)} views. ${videoNicheCommentary(worst, nicheByVideoId, nicheScoreByLaneId)}</div>
      </div>
    </div>`
    : `
    <div class="bw-grid" style="grid-template-columns:1fr;">
      <div class="bw-card best">
        <div class="bw-type">🏆 Only Upload Found</div>
        <div class="bw-title">${escapeHtml(best.title)}</div>
        <div class="bw-body"><strong>${formatViews(best.viewCount)} views.</strong> ${videoNicheCommentary(best, nicheByVideoId, nicheScoreByLaneId)} Not enough uploads yet for a best-vs-worst comparison.</div>
      </div>
    </div>`;

  const benchmarkHtml = buildBenchmarkNarrative(analysis, nicheScoreByLaneId);

  return `
  <div class="kpi-section">
    <div class="section-eyebrow">${numLabel} · Performance</div>
    <div class="section-title">Your Month at a Glance</div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:22px;font-weight:300;">Based on uploads from ${escapeHtml(monthYear)}</p>
    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">Uploads</div>
        <div class="kpi-value">${uploadCount}</div>
        <div class="kpi-sub">Most recent uploads analyzed</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Total Views</div>
        <div class="kpi-value">${totalViews.toLocaleString()}</div>
        <div class="kpi-sub">Combined across analyzed uploads</div>
      </div>
      <div class="kpi-card cyan">
        <div class="kpi-label">Avg Views / Day</div>
        <div class="kpi-value">${avgViewsPerDay.toLocaleString()}</div>
        <div class="kpi-sub">Per upload average</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Best Upload</div>
        <div class="kpi-value">${bestMultiplier ? `${bestMultiplier.toFixed(1)}×` : "—"}</div>
        <div class="kpi-sub">Above your channel average</div>
        <div class="kpi-delta up">${escapeHtml(bestDeltaLabel)}</div>
      </div>
    </div>
  </div>

  <div class="section" style="padding-top:24px; border-top: none;">
    ${bwGrid}
  </div>

  <div class="narrative-box">
    <div class="narrative-eyebrow">Benchmark Insight</div>
    <div class="narrative-text">${benchmarkHtml}</div>
  </div>`;
}

// Fix 1 — describes the actual title pattern behind a niche's winners
// (co-mention + [FREE] usage from stored patterns data) instead of a bare
// percentage, so the benchmark line points at something actionable.
function describeWinningPattern(score: NicheScore | undefined): string {
  if (!score) return "not enough winner data yet to identify one";
  const patterns = score.patterns as { topCoMentions?: { artist: string }[]; freePrefixPct?: number };
  const topCoMention = patterns.topCoMentions?.[0];
  const usesFree = (patterns.freePrefixPct ?? 0) >= 50;

  if (topCoMention) {
    const coName = titleCase(topCoMention.artist);
    return usesFree
      ? `a [FREE]-prefixed title with a co-mention of ${coName}`
      : `a co-mention of ${coName} in the title`;
  }
  return usesFree ? "a [FREE]-prefixed title" : "not enough winner data yet to identify one";
}

function buildBenchmarkNarrative(
  analysis: ChannelAnalysis,
  nicheScoreByLaneId: Map<string, NicheScore>
): string {
  const bestNiche = analysis.detectedNiches[0];
  if (!bestNiche) return "Not enough upload data yet to establish a niche benchmark.";

  const score = bestNiche.laneId ? nicheScoreByLaneId.get(bestNiche.laneId) : undefined;
  const benchmark = score?.benchmark;

  if (!benchmark || benchmark.medianViewsPerDay <= 0) {
    return `Your best niche right now is <strong>${escapeHtml(bestNiche.artistName)}</strong>, averaging ${bestNiche.avgViewsPerDay.toLocaleString()} views/day. No stored winner benchmark is available for this niche yet.`;
  }

  const poolLabel = benchmark.isComparableSet ? "Comparable small channels" : "Top performers";
  const median = benchmark.medianViewsPerDay.toLocaleString();
  const avg = bestNiche.avgViewsPerDay.toLocaleString();
  const niche = escapeHtml(bestNiche.artistName);

  if (bestNiche.avgViewsPerDay < benchmark.medianViewsPerDay) {
    const pattern = describeWinningPattern(score);
    return `Your <strong>${niche}</strong> uploads average <strong>${avg} views/day</strong>. ${poolLabel} in this niche average <strong>${median} views/day</strong>. The pattern separating top performers: ${pattern}.`;
  }

  // Item 1 — "performing above median for channels your size" when this really
  // is a same-tier comparison; the fallback pool (too few same-tier channels)
  // keeps saying "top performers in this niche," never "comparable channels,"
  // since it isn't one.
  const sizeLabel = benchmark.isComparableSet ? "channels your size" : "top performers in this niche";
  return `Your <strong>${niche}</strong> uploads are performing above median for ${sizeLabel} — <strong>${avg} views/day</strong> vs <strong>${median} views/day</strong> median.`;
}

function buildSection2(analysis: ChannelAnalysis, sectionNumber: number): string {
  const numLabel = String(sectionNumber).padStart(2, "0");
  const rows = analysis.detectedNiches.slice(0, 8);
  if (!rows.length) {
    return `
  <div class="section">
    <div class="section-eyebrow">${numLabel} · Market Intel</div>
    <div class="section-title">What Moved in Your Niches</div>
    <p style="font-size:13px;color:var(--sub);">No niches could be detected from this channel&#39;s recent uploads yet.</p>
  </div>`;
  }

  const scoreByLaneId = new Map(analysis.nicheScores.map((s) => [s.laneId, s]));

  const rowsHtml = rows
    .map((n) => {
      const score = n.laneId ? scoreByLaneId.get(n.laneId) : undefined;
      if (!score) {
        return `
        <tr>
          <td><div class="niche-name">${escapeHtml(n.artistName)}</div></td>
          <td>—</td>
          <td style="color:var(--muted)">—</td>
          <td><span class="status-badge" style="background:${UNTRACKED_BADGE.bg};color:${UNTRACKED_BADGE.color}">● ${UNTRACKED_BADGE.label}</span></td>
          <td>No lane data yet for this niche — TALLY hasn&#39;t analyzed it.</td>
        </tr>`;
      }

      const status = getNicheReportStatus(score);
      let movement: string;
      let arrowColor: string;
      let arrow: string;
      if (score.priorOpportunity === null) {
        movement = "New — no prior data";
        arrowColor = "#94A3B8";
        arrow = "–";
      } else {
        const diff = score.opportunity - score.priorOpportunity;
        if (diff > 2) {
          movement = `Up from ${score.priorOpportunity}`;
          arrowColor = "#10B981";
          arrow = "▲";
        } else if (diff < -2) {
          movement = `Down from ${score.priorOpportunity}`;
          arrowColor = "#EF4444";
          arrow = "▼";
        } else {
          movement = "Stable";
          arrowColor = "#F59E0B";
          arrow = "▶";
        }
      }

      let saturationNote: string;
      if (score.priorSaturation === null) {
        saturationNote = "no prior saturation reading yet.";
      } else {
        const satDiff = score.saturation - score.priorSaturation;
        const direction = satDiff > 2 ? "rising" : satDiff < -2 ? "easing" : "holding steady";
        saturationNote = `Saturation is ${direction} (${score.saturation} vs ${score.priorSaturation}).`;
      }

      const sentenceCased = status.narrative.charAt(0).toUpperCase() + status.narrative.slice(1);
      const analysisText = `${sentenceCased} at ${score.opportunity}/100. ${saturationNote}`;

      return `
        <tr>
          <td><div class="niche-name">${escapeHtml(n.artistName)}</div></td>
          <td>
            <div class="score-pill" style="color:${arrowColor}">${score.opportunity} <span class="arrow" style="color:${arrowColor}">${arrow}</span></div>
            <div class="score-bar-wrap">
              <div class="score-bar-bg"><div class="score-bar-fill" style="width:${score.opportunity}%;background:${arrowColor}"></div></div>
            </div>
          </td>
          <td style="color:${arrowColor};font-weight:500">${movement}</td>
          <td><span class="status-badge" style="background:${status.bg};color:${status.color}">● ${status.label}</span></td>
          <td>${analysisText}</td>
        </tr>`;
    })
    .join("");

  return `
  <div class="section">
    <div class="section-eyebrow">${numLabel} · Market Intel</div>
    <div class="section-title">What Moved in Your Niches</div>
    <table class="niche-table">
      <thead>
        <tr>
          <th>Artist Niche</th>
          <th>Score</th>
          <th>Movement</th>
          <th>Status</th>
          <th>Analysis</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;
}

// Fix 3 — only called when risingWindowsAvailable && risingWindows.length;
// the caller omits this section entirely otherwise (no "coming soon"
// placeholder for a feature the methodology section already explains isn't
// live for this channel yet).
function buildSection3(analysis: ChannelAnalysis, sectionNumber: number): string {
  const numLabel = String(sectionNumber).padStart(2, "0");
  const body = analysis.risingWindows
    .map(
      (w, i) => `
      <div class="rising-item">
        <div class="rising-rank">${i + 1}</div>
        <div class="rising-body">
          <div class="rising-artist">${escapeHtml(w.artist)}</div>
          <div class="rising-desc">${w.description ? escapeHtml(w.description) : `Momentum building in ${escapeHtml(w.genre ?? "this genre")}.`}</div>
        </div>
        <div class="rising-right">
          <div class="rising-pct">${w.momentumPct >= 0 ? "+" : ""}${Math.round(w.momentumPct)}%</div>
          <div class="rising-badge" style="color:${i === 0 ? "var(--green)" : "var(--cyan)"}">● ${i === 0 ? "Strong Window" : "Rising"}</div>
        </div>
      </div>`
    )
    .join("");

  return `
  <div class="section">
    <div class="section-eyebrow">${numLabel} · Rising Windows</div>
    <div class="section-title">Move Here Before It Floods</div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:18px;font-weight:300">
      Streaming momentum cross-referenced against niche saturation. Ranked by opportunity size.
    </p>
    <div class="rising-list">${body}</div>
  </div>`;
}

interface NichePlanCard {
  label: string;
  niche: string;
  titleFormat: string;
  tags: string;
  note: string;
  /** Item 4 — a real example pulled from top_videos, not just a score.
   * Undefined only when no small-channel video exists in the stored pool to
   * cite (or there's no pool at all, e.g. an untracked niche). */
  receipt?: string;
}

// Item 4 — "an 812-sub channel took #2 in this niche last month with this
// title: X." findSmallChannelExample (lib/lanes/nicheMatch.ts) reuses the
// same small-channel threshold pipeline.ts already uses to build
// winner_videos, rather than inventing a second "small" definition.
// "an 812-sub channel" only reads right because 812 is spoken "eight
// twelve" — a vowel sound. Most subscriber counts aren't: "a 133-sub
// channel," not "an." Approximates by the leading digits actually spoken
// with a vowel sound (eight-, eleven-, eighteen-) rather than hardcoding
// the brief's own example's article.
function articleFor(n: number): "a" | "an" {
  const s = String(n);
  if (s.startsWith("8") || s.startsWith("11") || s.startsWith("18")) return "an";
  return "a";
}

function buildReceiptLine(score: NicheScore): string | undefined {
  const example = findSmallChannelExample(score.topVideos);
  if (!example) return undefined;
  const article = articleFor(example.subscriberCount);
  return `${article} ${example.subscriberCount.toLocaleString()}-sub channel took #${example.rank} in this niche last month with this title: "${example.title}"`;
}

function planCardForScore(label: string, score: NicheScore): NichePlanCard {
  const patterns = score.patterns as {
    topCoMentions?: { artist: string }[];
    freePrefixPct?: number;
    topTags?: { tag: string }[];
  };
  const topCoMention = patterns.topCoMentions?.[0];
  const usesFree = (patterns.freePrefixPct ?? 0) >= 50;
  const prefix = usesFree ? "[FREE] " : "";
  const titleFormat = topCoMention
    ? `${prefix}${score.artistName} x ${titleCase(topCoMention.artist)} Type Beat "{Name}"`
    : `${prefix}${score.artistName} Type Beat "{Name}"`;
  const tags = (patterns.topTags ?? []).slice(0, 5).map((t) => t.tag).join(" · ") || "no tag data yet";
  return {
    label,
    niche: score.artistName,
    titleFormat,
    tags,
    note: `⚡ Opportunity score ${score.opportunity}/100 — ${getNicheReportStatus(score).narrative}.`,
    receipt: buildReceiptLine(score),
  };
}

function renderPlanCards(cards: NichePlanCard[]): string {
  return cards
    .map(
      (c) => `
      <div class="week-card">
        <div class="week-num">${escapeHtml(c.label)}</div>
        <div class="week-niche">${escapeHtml(c.niche)}</div>
        ${
          c.titleFormat
            ? `<div class="week-field-label">Title Format</div>
        <div class="week-field-val">${escapeHtml(c.titleFormat)}</div>
        <div class="week-field-label">Tags</div>
        <div class="week-field-val">${escapeHtml(c.tags)}</div>`
            : ""
        }
        <div class="week-note">${c.note}</div>
        ${c.receipt ? `<div class="week-receipt">📎 ${escapeHtml(c.receipt)}</div>` : ""}
      </div>`
    )
    .join("");
}

interface ActionPlan {
  cards: NichePlanCard[];
  framing: string;
}

// Curator model — the admin picks all three priorities from channelAnalyzer.ts's
// Step 10 niche-picker shortlist (analysis.nicheCandidates), editing each
// title format in the picker UI before generating. Fix 3 — Priority 3 is
// just a third slot into that same pool now (pre-selected client-side to
// analysis.defaultHoldCandidate, the channel's highest-opportunity current
// niche, but freely reassignable to any candidate); there is no longer a
// separately auto-filled "hold" slot outside the shortlist. This entirely
// replaced the old auto-computed plan (mono-niche/saturated/EXIT-aware
// ranking) — that logic now lives one step earlier, in what the picker
// offers as candidates in the first place, not in what Section 4 renders.

export interface SelectedPlanSlot {
  laneId: string;
  titleFormat: string;
}

export interface SelectedPlan {
  priority1?: SelectedPlanSlot;
  priority2?: SelectedPlanSlot;
  priority3?: SelectedPlanSlot;
}

/** A selected laneId can come from any of three places the client saw it:
 * the picker shortlist, the default hold candidate (guaranteed a slot in
 * that same shortlist as of Fix 3, so this is now mostly a defensive
 * fallback), or the channel's own scored niches. */
function resolveCandidateScore(analysis: ChannelAnalysis, laneId: string): NicheScore | null {
  const fromCandidates = analysis.nicheCandidates.find((c) => c.score.laneId === laneId);
  if (fromCandidates) return fromCandidates.score;
  if (analysis.defaultHoldCandidate?.score.laneId === laneId) return analysis.defaultHoldCandidate.score;
  return analysis.nicheScores.find((s) => s.laneId === laneId) ?? null;
}

/** Section 4's single source of truth now that the admin picks the plan
 * instead of it being auto-computed — also what the POST handler persists
 * into growth_reports.recommendations, so what the channel owner reads and
 * what next month's grading loop checks against can't drift apart. Reuses
 * planCardForScore for the note/receipt (still real, score-derived data);
 * only titleFormat is overridden with whatever the admin edited it to in
 * the picker, falling back to the auto-computed format if left blank. */
function buildSelectedPlanCards(analysis: ChannelAnalysis, selectedPlan: SelectedPlan): ActionPlan {
  const slots: { sel: SelectedPlanSlot | undefined; label: string }[] = [
    { sel: selectedPlan.priority1, label: "Priority 1" },
    { sel: selectedPlan.priority2, label: "Priority 2" },
    { sel: selectedPlan.priority3, label: "Priority 3" },
  ];

  const cards: NichePlanCard[] = [];
  for (const { sel, label } of slots) {
    if (!sel?.laneId) continue;
    const score = resolveCandidateScore(analysis, sel.laneId);
    if (!score) continue;
    const base = planCardForScore(label, score);
    cards.push({ ...base, titleFormat: sel.titleFormat?.trim() || base.titleFormat });
  }

  // Always cite the diagnosis as framing — there's no separate auto-compute
  // story to avoid duplicating anymore; the plan below is just the admin's
  // response to the same root cause named above it.
  return { cards, framing: analysis.diagnosis.detail };
}

// ── growth_reports persistence ───────────────────────────────────────────
// Not read by anything yet — this is the input side of next month's
// grading loop (not built this pass). Written from report #1 onward so the
// history exists by the time the reader does.

interface RecommendationsPayload {
  diagnosisType: string;
  experiment: {
    text: string;
    type: string;
    predictedMetric: string;
    predictedTarget: number;
  };
  recommendedNiches: { niche: string; priority: number; predictedAction: string }[];
  benchmarkSnapshot: {
    niche: string | null;
    channelVelocity: number | null;
    peerMedian: number | null;
  };
}

function parsePlanPriority(label: string): number {
  const m = label.match(/Priority (\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Reuses buildActionPlanCards' output (the caller already computed it for
 * Section 4's HTML) rather than re-deriving "what's recommended" a second
 * way — recommendedNiches is exactly what the channel owner sees, in the
 * same priority order, with the same predictedAction copy. */
function buildRecommendationsPayload(
  analysis: ChannelAnalysis,
  experimentText: string,
  plan: ActionPlan
): RecommendationsPayload {
  const bestNiche = analysis.detectedNiches[0] ?? null;
  const bestScore = bestNiche?.laneId
    ? analysis.nicheScores.find((s) => s.laneId === bestNiche.laneId)
    : undefined;

  return {
    diagnosisType: analysis.diagnosis.type,
    experiment: {
      // The final text sent (possibly hand-edited from the auto-generated
      // draft) — the predicted metric/target below still reflect what
      // TALLY calculated for the auto-generated bet at generation time,
      // since free text can't be reliably re-parsed into a grading target.
      text: experimentText,
      type: analysis.generatedExperiment.type,
      predictedMetric: analysis.generatedExperiment.predictedMetric,
      predictedTarget: analysis.generatedExperiment.predictedTarget,
    },
    recommendedNiches: plan.cards.map((c) => ({
      niche: c.niche,
      priority: parsePlanPriority(c.label),
      predictedAction: c.note,
    })),
    benchmarkSnapshot: {
      niche: bestNiche?.artistName ?? null,
      channelVelocity: bestNiche?.avgViewsPerDay ?? null,
      peerMedian: bestScore?.benchmark?.medianViewsPerDay ?? null,
    },
  };
}

function buildSection4(analysis: ChannelAnalysis, sectionNumber: number, plan: ActionPlan): string {
  const numLabel = String(sectionNumber).padStart(2, "0");
  return `
  <div class="section">
    <div class="section-eyebrow">${numLabel} · Action Plan</div>
    <div class="section-title">Your Next 30 Days</div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:18px;font-weight:300">${plan.framing}</p>
    <div class="week-grid">${renderPlanCards(plan.cards)}</div>
  </div>`;
}

function buildSection5(experiment: string, monthYear: string, sectionNumber: number): string {
  const numLabel = String(sectionNumber).padStart(2, "0");
  const hasExperiment = experiment.length > 0;
  // Fix 3 — title is always the heading; only the body varies with whether
  // an experiment was supplied. Previously both slots said "Experiment: TBD"
  // when blank, which read as a duplicated placeholder rather than a
  // heading + a value.
  return `
  <div class="section">
    <div class="section-eyebrow">${numLabel} · This Month&#39;s Experiment</div>
    <div class="section-title">One Bet to Track</div>
    <div class="experiment-box">
      <div class="exp-icon">🧪</div>
      <div class="exp-body">
        <div class="exp-label">Experiment · ${monthYear}</div>
        <div class="exp-title">This Month&#39;s Bet</div>
        <div class="exp-text">${hasExperiment ? escapeHtml(experiment) : "Experiment: TBD — add manually before sending."}</div>
        <div class="exp-footer">Next month&#39;s report opens with your scorecard: did the plan work?</div>
      </div>
    </div>
  </div>`;
}

function buildMethodologySection(analysis: ChannelAnalysis): string {
  // Now that Step 6 (channelAnalyzer.ts) queries the real momentum engine,
  // risingWindowsAvailable is true whenever the query itself succeeds — it no
  // longer implies there are any windows to show. What decides which
  // explainer text renders here is the same "any real results" check
  // Section 3 and the action plan already gate on, so this never claims the
  // methodology text describes live data when the section is actually hidden.
  const risingWindowsText = analysis.risingWindowsAvailable && analysis.risingWindows.length
    ? "Spotify + Last.fm follower/listener growth over the past ~28 days, cross-referenced against current upload saturation on YouTube. Streaming momentum precedes YouTube search volume by 2–4 weeks."
    : "Momentum data is still building for this channel — weekly snapshots need a few weeks of history before a real window can be ranked.";

  return `
  <div class="section methodology">
    <div class="section-eyebrow">How We Built This Report</div>
    <div class="section-title">The Data Behind Every Number</div>
    <div class="methodology-grid">

      <div class="method-item">
        <div class="method-label">Opportunity Score</div>
        <div class="method-text">Computed from upload volume, views-per-day velocity, and how often small channels break through — pulled from the last 30 days of YouTube data for each niche.</div>
      </div>

      <div class="method-item">
        <div class="method-label">Niche Movement</div>
        <div class="method-text">The arrow and score change reflect a real delta — TALLY&#39;s current analysis compared against the prior stored analysis for that niche. Not an estimate.</div>
      </div>

      <div class="method-item">
        <div class="method-label">Rising Windows</div>
        <div class="method-text">${risingWindowsText}</div>
      </div>

      <div class="method-item">
        <div class="method-label">Benchmark Comparison</div>
        <div class="method-text">Your uploads are measured against the median views-per-day of channels in your own subscriber tier (under 1K, under 10K, or under 50K) in the same niche — a peer comparison, not the whole winner pool. Fewer than 3 channels in your tier falls back to the niche's top performers instead.</div>
      </div>

      <div class="method-item">
        <div class="method-label">30-Day Plan</div>
        <div class="method-text">Priority 1, 2 & 3 are chosen by TALLY's producer from a shortlist ranked by opportunity score and co-mention proximity to your own catalog — not fully automated. Title formats are pre-filled from real top-performing videos in each niche, then reviewed and adjusted before sending.</div>
      </div>

    </div>
  </div>`;
}

// ── CSS — copied from tally_report_dark.html verbatim ────────────────────

const REPORT_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0B0E14;
  --panel:    #111827;
  --panel2:   #161F2E;
  --border:   #1E2D40;
  --border2:  #243350;
  --text:     #F1F5F9;
  --sub:      #94A3B8;
  --muted:    #475569;
  --accent:   #7C3AED;
  --cyan:     #06B6D4;
  --green:    #10B981;
  --green-bg: rgba(16,185,129,0.10);
  --red:      #EF4444;
  --red-bg:   rgba(239,68,68,0.10);
  --yellow:   #F59E0B;
  --yellow-bg:rgba(245,158,11,0.10);
  --radius:   10px;
}

body {
  font-family: 'Outfit', sans-serif;
  background: #0B0E14;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  font-weight: 300;
}

.page {
  width: 900px;
  margin: 40px auto;
  background: var(--panel);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 60px rgba(0,0,0,0.6);
}

.cover-header {
  background: var(--panel2);
  padding: 48px 56px 40px;
  border-bottom: 1px solid var(--border);
}
.cover-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32px;
}
.logo {
  font-family: 'Nunito', sans-serif;
  font-size: 26px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.5px;
}
.logo span { color: var(--cyan); }
.logo-sub {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 4px;
}
.cover-titles { flex: 1; padding-left: 40px; text-align: right; }
.cover-eyebrow {
  font-family: 'Outfit', sans-serif;
  font-size: 9px;
  letter-spacing: 3.5px;
  text-transform: uppercase;
  color: var(--cyan);
  opacity: 0.8;
  margin-bottom: 10px;
}
.cover-title {
  font-family: 'Nunito', sans-serif;
  font-size: 28px;
  font-weight: 300;
  color: var(--text);
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin-bottom: 6px;
}
.cover-title strong { font-weight: 700; color: var(--text); }
.cover-subtitle {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 1.5px;
  color: var(--sub);
  text-transform: uppercase;
}
.accent-bar {
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--cyan));
  border-radius: 2px;
  margin-bottom: 28px;
}
.meta-bar {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--border);
  padding-top: 20px;
}
.meta-item { flex: 1; padding-right: 24px; }
.meta-item + .meta-item {
  padding-left: 24px;
  border-left: 1px solid var(--border);
}
.meta-label {
  font-size: 9px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 5px;
}
.meta-value {
  font-family: 'Nunito', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--text);
}

.diagnosis-block {
  margin: 28px 56px 0;
  padding: 22px 26px;
  background: linear-gradient(135deg, rgba(124,58,237,0.14), rgba(6,182,212,0.08));
  border: 1px solid var(--border2);
  border-radius: var(--radius);
}
.diagnosis-eyebrow {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--cyan);
  font-weight: 600;
  margin-bottom: 10px;
}
.diagnosis-headline {
  font-family: 'Nunito', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.3px;
  line-height: 1.3;
  margin-bottom: 10px;
}
.diagnosis-detail {
  font-size: 13px;
  line-height: 1.7;
  color: var(--sub);
  font-weight: 300;
}

.kpi-section { padding: 36px 56px 0; }
.section-eyebrow {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
  font-weight: 500;
}
.section-title {
  font-family: 'Nunito', sans-serif;
  font-size: 20px;
  font-weight: 300;
  color: var(--text);
  margin-bottom: 22px;
  letter-spacing: -0.3px;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}
.kpi-card {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 18px 18px;
  position: relative;
  overflow: hidden;
}
.kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--accent);
  border-radius: var(--radius) var(--radius) 0 0;
}
.kpi-card.cyan::before  { background: var(--cyan); }
.kpi-card.green::before { background: var(--green); }
.kpi-card.red::before   { background: var(--red); }
.kpi-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}
.kpi-value {
  font-family: 'Nunito', sans-serif;
  font-size: 30px;
  font-weight: 600;
  color: var(--text);
  line-height: 1;
  margin-bottom: 6px;
}
.kpi-sub { font-size: 11px; color: var(--sub); line-height: 1.4; }
.kpi-delta {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  margin-top: 5px;
}
.kpi-delta.up   { background: var(--green-bg);  color: var(--green); }
.kpi-delta.down { background: var(--red-bg);    color: var(--red); }
.kpi-delta.neu  { background: var(--yellow-bg); color: var(--yellow); }

.narrative-box {
  margin: 0 56px 36px;
  background: var(--panel2);
  border-left: 3px solid var(--cyan);
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 18px 22px;
}
.narrative-eyebrow {
  font-size: 9px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--cyan);
  margin-bottom: 7px;
  font-weight: 500;
}
.narrative-text {
  font-size: 13px;
  line-height: 1.75;
  color: var(--sub);
  font-weight: 300;
}
.narrative-text strong { font-weight: 600; color: var(--text); }

.section { padding: 32px 56px; border-top: 1px solid var(--border); }

.bw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
.bw-card {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
}
.bw-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  border-radius: var(--radius) var(--radius) 0 0;
}
.bw-card.best::before  { background: var(--green); }
.bw-card.worst::before { background: var(--red); }
.bw-type {
  font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
  margin-bottom: 8px; font-weight: 500;
}
.bw-card.best  .bw-type { color: var(--green); }
.bw-card.worst .bw-type { color: var(--red); }
.bw-title {
  font-family: 'Nunito', sans-serif;
  font-size: 13px; font-weight: 600;
  color: var(--text); margin-bottom: 8px; line-height: 1.35;
}
.bw-body { font-size: 12px; color: var(--sub); line-height: 1.6; font-weight: 300; }
.bw-body strong { color: var(--text); font-weight: 600; }

.niche-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.niche-table thead tr { background: var(--panel2); }
.niche-table thead th {
  padding: 10px 14px;
  text-align: left;
  font-size: 9px;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}
.niche-table tbody tr { border-bottom: 1px solid var(--border); }
.niche-table tbody tr:last-child { border-bottom: none; }
.niche-table tbody td { padding: 14px 14px; color: var(--sub); vertical-align: middle; font-size: 13px; }
.niche-name {
  font-family: 'Nunito', sans-serif;
  font-weight: 600; font-size: 14px; color: var(--text);
}
.score-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Nunito', sans-serif;
  font-size: 18px; font-weight: 700;
}
.arrow { font-size: 11px; font-weight: 700; }
.score-bar-wrap { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.score-bar-bg { flex: 1; height: 4px; background: var(--border2); border-radius: 2px; overflow: hidden; }
.score-bar-fill { height: 100%; border-radius: 2px; }
.status-badge {
  display: inline-block;
  padding: 3px 10px; border-radius: 20px;
  font-size: 9px; letter-spacing: 1px; text-transform: uppercase; font-weight: 500;
}

.rising-list { display: flex; flex-direction: column; gap: 10px; }
.rising-item {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 18px;
}
.rising-rank {
  font-family: 'Nunito', sans-serif;
  font-size: 28px; font-weight: 800;
  color: var(--accent); opacity: 0.5;
  min-width: 32px; text-align: center;
}
.rising-body { flex: 1; }
.rising-artist {
  font-family: 'Nunito', sans-serif;
  font-size: 15px; font-weight: 600; color: var(--text);
  margin-bottom: 4px;
}
.rising-desc { font-size: 12px; color: var(--sub); line-height: 1.6; font-weight: 300; }
.rising-right { text-align: right; min-width: 90px; }
.rising-pct {
  font-family: 'Nunito', sans-serif;
  font-size: 22px; font-weight: 700; color: var(--green);
}
.rising-badge {
  font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
  font-weight: 600; margin-top: 3px;
}

.week-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.week-card {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
}
.week-num {
  font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase;
  color: var(--accent); font-weight: 500; margin-bottom: 6px;
}
.week-niche {
  font-family: 'Nunito', sans-serif;
  font-size: 15px; font-weight: 600; color: var(--text);
  margin-bottom: 14px;
}
.week-field-label {
  font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--muted); font-weight: 500; margin-bottom: 4px;
}
.week-field-val {
  font-size: 12px; color: var(--sub); line-height: 1.55;
  margin-bottom: 12px; font-weight: 300;
}
.week-note {
  font-size: 11px; color: var(--yellow);
  padding: 6px 10px;
  background: var(--yellow-bg);
  border-radius: 6px;
  margin-top: 8px;
}
.week-receipt {
  font-size: 11px; color: var(--cyan);
  padding: 6px 10px;
  background: rgba(6,182,212,0.08);
  border-radius: 6px;
  margin-top: 6px;
  line-height: 1.5;
}

.experiment-box {
  background: var(--panel2);
  border: 1.5px solid var(--accent);
  border-radius: var(--radius);
  padding: 24px 28px;
  display: flex; gap: 20px; align-items: flex-start;
}
.exp-icon { font-size: 28px; line-height: 1; margin-top: 2px; }
.exp-body { flex: 1; }
.exp-label {
  font-size: 9px; letter-spacing: 3px; text-transform: uppercase;
  color: var(--accent); font-weight: 500; margin-bottom: 8px;
}
.exp-title {
  font-family: 'Nunito', sans-serif;
  font-size: 18px; font-weight: 600; color: var(--text);
  margin-bottom: 10px; letter-spacing: -0.3px;
}
.exp-text {
  font-size: 13px; color: var(--sub); line-height: 1.75; font-weight: 300;
}
.exp-text strong { color: var(--text); font-weight: 600; }
.exp-footer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 11px; color: var(--muted); letter-spacing: 0.5px;
}

.report-footer {
  background: var(--panel2);
  border-top: 1px solid var(--border);
  padding: 18px 56px;
  display: flex; align-items: center; justify-content: space-between;
}
.rf-logo {
  font-family: 'Nunito', sans-serif;
  font-size: 16px; font-weight: 800; color: var(--text);
}
.rf-logo span { color: var(--cyan); }
.rf-meta { font-size: 10px; letter-spacing: 1.5px; color: var(--muted); text-align: center; text-transform: uppercase; }
.rf-page { font-size: 10px; color: var(--muted); letter-spacing: 1px; }

.methodology {
  border-top: 1px solid var(--border);
  background: var(--panel2);
}
.methodology .section-title {
  font-size: 16px;
  margin-bottom: 20px;
}
.methodology-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.method-item {
  padding: 14px 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.method-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--cyan);
  font-weight: 500;
  margin-bottom: 6px;
}
.method-text {
  font-size: 12px;
  color: var(--sub);
  line-height: 1.65;
  font-weight: 300;
}

@media (max-width: 600px) {
  .methodology-grid { grid-template-columns: 1fr; }
}

@media print {
  body { background: #0B0E14; }
  .page { margin: 0; border-radius: 0; box-shadow: none; width: 100%; }
}
`;
