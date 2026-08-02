// Report Builder — HTML report generation endpoint. Takes the analysis
// object the client already fetched from /analyze (no new YouTube calls here)
// plus a human-written experiment line, and renders it into the
// tally_report_dark.html design (Nunito + Outfit, dark panel layout) as one
// self-contained HTML string the client can preview in an iframe and download.
import { NextRequest, NextResponse } from "next/server";
import type {
  ChannelAnalysis,
  DetectedNiche,
  NicheScore,
  RecentUpload,
} from "@/lib/reports/channelAnalyzer";
import { monthLabel } from "@/lib/reports/channelAnalyzer";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { analysis?: ChannelAnalysis; experiment?: string; month?: number; year?: number }
    | null;
  if (!body?.analysis) {
    return NextResponse.json({ error: "Missing analysis" }, { status: 400 });
  }
  const month = body.month ?? body.analysis.reportMonth;
  const year = body.year ?? body.analysis.reportYear;
  if (!month || !year) {
    return NextResponse.json({ error: "Missing month/year" }, { status: 400 });
  }

  try {
    const html = buildReportHtml(body.analysis, (body.experiment ?? "").trim(), month, year);
    return NextResponse.json({ html });
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

const STATUS_LABEL: Record<string, string> = {
  green: "a strong opportunity",
  yellow: "a moderate opportunity",
  red: "a tough lane right now",
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  green: { label: "Open", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  yellow: { label: "Hold", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  red: { label: "Exit", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
};
const UNTRACKED_BADGE = { label: "Untracked", color: "#475569", bg: "rgba(71,85,105,0.14)" };

// ── Report builder ───────────────────────────────────────────────────────

function buildReportHtml(analysis: ChannelAnalysis, experiment: string, month: number, year: number): string {
  const monthYear = monthLabel(month, year);

  const uploads = analysis.recentUploads;
  const nicheByVideoId = new Map<string, DetectedNiche>();
  for (const n of analysis.detectedNiches) for (const v of n.videos) nicheByVideoId.set(v.videoId, n);
  const nicheScoreByLaneId = new Map(analysis.nicheScores.map((s) => [s.laneId, s]));

  const bestNiche = analysis.detectedNiches[0] ?? null;
  const genreLabel = bestNiche?.genreHint ?? "Uncategorized";

  return `<!DOCTYPE html>
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
  ${buildSection1(analysis, uploads, nicheByVideoId, nicheScoreByLaneId, monthYear)}
  ${buildSection2(analysis)}
  ${buildSection3(analysis)}
  ${buildSection4(analysis)}
  ${buildSection5(experiment, monthYear)}
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

function videoNicheCommentary(
  video: RecentUpload | null,
  nicheByVideoId: Map<string, DetectedNiche>,
  nicheScoreByLaneId: Map<string, NicheScore>
): string {
  if (!video) return "";
  const niche = nicheByVideoId.get(video.videoId);
  if (!niche) return "This upload didn&#39;t match a niche TALLY currently tracks.";
  if (!niche.laneId) {
    return `This upload landed in your <strong>${escapeHtml(niche.artistName)}</strong> niche — TALLY doesn&#39;t have lane data for it yet (untracked niche).`;
  }
  const score = nicheScoreByLaneId.get(niche.laneId);
  if (!score) return `This upload landed in your <strong>${escapeHtml(niche.artistName)}</strong> niche.`;
  return `This upload landed in your <strong>${escapeHtml(niche.artistName)}</strong> niche — currently ${STATUS_LABEL[score.status]} at <strong>${score.opportunity}/100</strong> (saturation ${score.saturation}/100).`;
}

function buildSection1(
  analysis: ChannelAnalysis,
  uploads: RecentUpload[],
  nicheByVideoId: Map<string, DetectedNiche>,
  nicheScoreByLaneId: Map<string, NicheScore>,
  monthYear: string
): string {
  if (!uploads.length) {
    return `
  <div class="kpi-section">
    <div class="section-eyebrow">01 · Performance</div>
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

  const bestNicheForBest = nicheByVideoId.get(best.videoId);
  const bestDeltaLabel = bestNicheForBest ? `${escapeHtml(bestNicheForBest.artistName)} niche` : "Best upload";

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
  const titleRewriteHtml = buildTitleRewriteHighlight(analysis);

  return `
  <div class="kpi-section">
    <div class="section-eyebrow">01 · Performance</div>
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
  </div>

  ${titleRewriteHtml}`;
}

function buildBenchmarkNarrative(
  analysis: ChannelAnalysis,
  nicheScoreByLaneId: Map<string, NicheScore>
): string {
  const bestNiche = analysis.detectedNiches[0];
  if (!bestNiche) return "Not enough upload data yet to establish a niche benchmark.";

  const score = bestNiche.laneId ? nicheScoreByLaneId.get(bestNiche.laneId) : undefined;
  const median = score?.rawMetrics?.demandMedianViewsPerDay;

  if (typeof median === "number" && median > 0) {
    const pct = Math.round((bestNiche.avgViewsPerDay / median) * 100);
    return `Your <strong>${escapeHtml(bestNiche.artistName)}</strong> uploads average <strong>${bestNiche.avgViewsPerDay.toLocaleString()} views/day</strong>. The stored winner median for this niche is <strong>${Math.round(median).toLocaleString()} views/day</strong> — you&#39;re running at <strong>${pct}%</strong> of that benchmark.`;
  }

  return `Your best niche right now is <strong>${escapeHtml(bestNiche.artistName)}</strong>, averaging ${bestNiche.avgViewsPerDay.toLocaleString()} views/day. No stored winner benchmark is available for this niche yet.`;
}

function buildTitleRewriteHighlight(analysis: ChannelAnalysis): string {
  const rewrite = analysis.titleRewrite;
  if (!rewrite) return "";
  return `
  <div class="section" style="padding-top:0;border-top:none;">
    <div class="narrative-box" style="border-left-color:var(--accent);">
      <div class="narrative-eyebrow" style="color:var(--accent);">Title Rewrite</div>
      <div class="narrative-text">
        Your upload titled <strong>${escapeHtml(rewrite.originalTitle)}</strong> — optimized for your best niche: <strong>${escapeHtml(rewrite.bestNicheName)}</strong>.<br/>
        Try: <strong>${escapeHtml(rewrite.rewrittenTitle)}</strong>
      </div>
    </div>
  </div>`;
}

function buildSection2(analysis: ChannelAnalysis): string {
  const rows = analysis.detectedNiches.slice(0, 8);
  if (!rows.length) {
    return `
  <div class="section">
    <div class="section-eyebrow">02 · Market Intel</div>
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

      const badge = STATUS_BADGE[score.status];
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

      const label = STATUS_LABEL[score.status];
      const sentenceCased = label.charAt(0).toUpperCase() + label.slice(1);
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
          <td><span class="status-badge" style="background:${badge.bg};color:${badge.color}">● ${badge.label}</span></td>
          <td>${analysisText}</td>
        </tr>`;
    })
    .join("");

  return `
  <div class="section">
    <div class="section-eyebrow">02 · Market Intel</div>
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

function buildSection3(analysis: ChannelAnalysis): string {
  const body =
    analysis.risingWindowsAvailable && analysis.risingWindows.length
      ? analysis.risingWindows
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
          .join("")
      : `
      <div class="rising-item" style="justify-content:center;text-align:center;">
        <div class="rising-body" style="flex:none;">
          <div class="rising-desc" style="font-size:13px;">Coming soon — momentum data is building.</div>
        </div>
      </div>`;

  return `
  <div class="section">
    <div class="section-eyebrow">03 · Rising Windows</div>
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
    note: `⚡ Opportunity score ${score.opportunity}/100 — ${STATUS_LABEL[score.status]}.`,
  };
}

function planCardForNiche(label: string, niche: DetectedNiche): NichePlanCard {
  return {
    label,
    niche: niche.artistName,
    titleFormat: `${niche.artistName} Type Beat "{Name}"`,
    tags: "no tag data yet — untracked niche",
    note: `⚡ Averaging ${niche.avgViewsPerDay.toLocaleString()} views/day across ${niche.uploadCount} upload${niche.uploadCount === 1 ? "" : "s"} — not yet lane-tracked by TALLY.`,
  };
}

function buildSection4(analysis: ChannelAnalysis): string {
  const rankedScores = [...analysis.nicheScores].sort((a, b) => b.opportunity - a.opportunity);
  const usedLaneIds = new Set<string>();
  const cards: NichePlanCard[] = [];

  const top2 = rankedScores.slice(0, 2);
  top2.forEach((s, i) => {
    usedLaneIds.add(s.laneId);
    cards.push(planCardForScore(`Priority ${i + 1}`, s));
  });

  if (cards.length < 2) {
    for (const n of analysis.detectedNiches) {
      if (cards.length >= 2) break;
      if (n.laneId && usedLaneIds.has(n.laneId)) continue;
      cards.push(planCardForNiche(`Priority ${cards.length + 1}`, n));
    }
  }

  if (analysis.risingWindowsAvailable && analysis.risingWindows.length) {
    const w = analysis.risingWindows[0];
    cards.push({
      label: "Priority 3 · Rising Window Test",
      niche: w.artist,
      titleFormat: `[FREE] ${w.artist} Type Beat "{Name}"`,
      tags: "test upload — no tag history yet",
      note: `⚡ Momentum +${Math.round(w.momentumPct)}% — get in before this floods.`,
    });
  } else {
    cards.push({
      label: "Priority 3 · Rising Window Test",
      niche: "Momentum data building",
      titleFormat: "",
      tags: "",
      note: "⚡ Rising-window data isn&#39;t available yet — hold this slot for whichever niche spikes first once momentum tracking is live.",
    });
  }

  const cardsHtml = cards
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
      </div>`
    )
    .join("");

  return `
  <div class="section">
    <div class="section-eyebrow">04 · Action Plan</div>
    <div class="section-title">Your Next 30 Days</div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:18px;font-weight:300">
      Top ${top2.length || cards.length} niche${cards.length === 1 ? "" : "s"} by opportunity, plus one rising-window test.
    </p>
    <div class="week-grid">${cardsHtml}</div>
  </div>`;
}

function buildSection5(experiment: string, monthYear: string): string {
  const hasExperiment = experiment.length > 0;
  return `
  <div class="section">
    <div class="section-eyebrow">05 · This Month&#39;s Experiment</div>
    <div class="section-title">One Bet to Track</div>
    <div class="experiment-box">
      <div class="exp-icon">🧪</div>
      <div class="exp-body">
        <div class="exp-label">Experiment · ${monthYear}</div>
        <div class="exp-title">${hasExperiment ? "This Month&#39;s Bet" : "Experiment: TBD"}</div>
        <div class="exp-text">${hasExperiment ? escapeHtml(experiment) : "Experiment: TBD — add manually before sending."}</div>
        <div class="exp-footer">Next month&#39;s report opens with your scorecard: did the plan work?</div>
      </div>
    </div>
  </div>`;
}

function buildMethodologySection(analysis: ChannelAnalysis): string {
  const risingWindowsText = analysis.risingWindowsAvailable
    ? "Spotify monthly listener growth over the past 30 days, cross-referenced against current upload competition on YouTube. Streaming momentum precedes YouTube search volume by 2–4 weeks."
    : "Momentum data is still building for this channel.";

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
        <div class="method-text">Your uploads are measured against the median views-per-day of small channels (under 10K subscribers) in the same niche over the same 30-day window.</div>
      </div>

      <div class="method-item">
        <div class="method-label">Title Rewrite</div>
        <div class="method-text">Generated from the winning title structure used by top-performing videos in your best niche this month — [FREE] prefix rate, co-mention patterns, and quoted name usage pulled from real winner data.</div>
      </div>

      <div class="method-item">
        <div class="method-label">30-Day Plan</div>
        <div class="method-text">Upload schedule and niche recommendations are ranked by opportunity score. Title formats and tags are extracted directly from top-performing videos in each recommended niche — not generic advice.</div>
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
