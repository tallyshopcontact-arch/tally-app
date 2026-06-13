/* eslint-disable @typescript-eslint/no-explicit-any */
// @react-pdf/renderer uses its own React renderer — suppress normal React types

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { ChannelSnapshot } from "./channel-snapshot";
import type { DeepChannelAnalysis } from "./channel-analysis";
import { computeTallyScoreFromAnalysis } from "./channel-analysis";

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  bg: "#0a0a0a",
  surface: "#111111",
  surface2: "#161616",
  border: "#1e1e1e",
  border2: "#2a2a2a",
  white: "#ffffff",
  muted: "#94a3b8",
  dim: "#475569",
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f87171",
};

function scoreColor(score: number): string {
  return score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    paddingTop: 36,
    paddingBottom: 52,
    paddingLeft: 44,
    paddingRight: 44,
    fontFamily: "Helvetica",
    color: C.white,
  },

  // header
  headerRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  wordmark: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white, letterSpacing: 3 },
  headerSub: { fontSize: 8, color: C.muted, marginLeft: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 6, marginBottom: 18 },
  thickDivider: { borderBottomWidth: 1, borderBottomColor: C.border2, marginTop: 12, marginBottom: 12 },

  // section label
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.dim,
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 16,
  },

  // channel name
  channelName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 2 },
  channelMeta: { fontSize: 8, color: C.muted },

  // stat boxes
  statRow: { flexDirection: "row", marginBottom: 4 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 11,
    backgroundColor: C.surface,
    marginRight: 6,
  },
  statBoxLast: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 11,
    backgroundColor: C.surface,
  },
  statNum: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 2 },
  statLabel: { fontSize: 6, color: C.muted, letterSpacing: 1 },

  // TALLY score block
  scoreBlock: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  scoreLeft: { width: 80, alignItems: "center" as any, justifyContent: "center" as any },
  scoreRight: { flex: 1, paddingLeft: 16 },
  scoreNum: { fontSize: 44, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  scoreOutOf: { fontSize: 8, color: C.muted, marginTop: 2 },
  scoreBreakdownRow: { flexDirection: "row", marginBottom: 4, alignItems: "center" as any },
  scoreBarBg: { flex: 1, backgroundColor: C.surface2, height: 4, marginLeft: 8, marginRight: 6 },
  scoreBarFill: { height: 4 },
  scoreCatLabel: { fontSize: 7, color: C.muted, width: 110 },
  scoreCatValue: { fontSize: 7, color: C.white, width: 26, textAlign: "right" as any },

  // key pattern block
  patternBlock: {
    borderLeftWidth: 2,
    borderLeftColor: C.white,
    paddingLeft: 12,
    paddingVertical: 8,
    marginTop: 4,
    backgroundColor: C.surface,
    paddingRight: 12,
  },
  patternText: { fontSize: 10, color: C.white, lineHeight: 1.6 },

  // table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 5,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#141414",
  },
  tableText: { fontSize: 8, color: C.muted },
  tableTextWhite: { fontSize: 8, color: C.white },
  tableHeaderText: { fontSize: 6, color: C.dim, letterSpacing: 1 },

  // keyword bar row
  kwRow: { flexDirection: "row", alignItems: "center" as any, marginBottom: 5 },
  kwLabel: { fontSize: 8, color: C.white, width: 130 },
  kwBarBg: { flex: 1, backgroundColor: C.surface2, height: 3, marginRight: 8 },
  kwBarFill: { height: 3, backgroundColor: C.border2 },
  kwCount: { fontSize: 7, color: C.muted, width: 24, textAlign: "right" as any },

  // missing keyword tag
  missingRow: { flexDirection: "row", flexWrap: "wrap" as any, marginTop: 4 },
  missingTag: {
    borderWidth: 1,
    borderColor: C.amber,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginRight: 5,
    marginBottom: 5,
  },
  missingTagText: { fontSize: 7, color: C.amber },
  missingTagLabel: { fontSize: 6, color: C.dim, marginRight: 5, marginBottom: 5, marginTop: 4 },

  // two-col layout
  twoCol: { flexDirection: "row" },
  colLeft: { flex: 1, marginRight: 12 },
  colRight: { flex: 1 },

  // insight card
  insightCard: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  insightTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 3 },
  insightBody: { fontSize: 8, color: C.muted, lineHeight: 1.5 },

  // recommendation box
  recBox: {
    borderWidth: 1,
    borderColor: C.border2,
    backgroundColor: C.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  recTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dim, letterSpacing: 1, marginBottom: 10 },
  recRow: { flexDirection: "row", marginBottom: 6, alignItems: "flex-start" as any },
  recRowLabel: { fontSize: 8, color: C.dim, width: 120 },
  recRowValue: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white },

  // justification bullets
  justRow: { flexDirection: "row", marginBottom: 5 },
  justBullet: { fontSize: 8, color: C.green, width: 12 },
  justText: { flex: 1, fontSize: 8, color: C.muted, lineHeight: 1.5 },

  // title formula block
  formulaBox: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  formulaText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 6 },
  formulaExample: { fontSize: 7, color: C.muted, marginBottom: 3, lineHeight: 1.4 },

  // description template
  descBox: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  descText: { fontSize: 7, color: C.muted, lineHeight: 1.6 },

  // footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 7,
  },
  footerLeft: { fontSize: 6, color: C.dim },
  footerCenter: { fontSize: 6, color: C.dim },
  footerRight: { fontSize: 6, color: C.dim },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

function monthYear(): string {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

function genTimestamp(): string {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildDescriptionTemplate(
  genre: string,
  artistCombination: string,
  descDepth: DeepChannelAnalysis["descriptionDepth"]
): string {
  const lines: string[] = [
    `"[Beat Name]" is a hard-hitting ${genre} type beat inspired by ${artistCombination || "[Artist]"}.`,
    ``,
    `🎵 Free for non-profit use with credit. Commercial licenses available.`,
  ];
  if (!descDepth.hasDownloadLink) lines.push(`📥 Download / Purchase: [YOUR LINK HERE]`);
  if (!descDepth.hasBPM) lines.push(`🎚 BPM: [XXX] | Key: [X]`);
  lines.push(``);
  lines.push(`Tags: ${genre} type beat 2026, ${artistCombination} type beat, free type beat, instrumental`);
  if (!descDepth.hasHashtags) lines.push(`#typebeat #${genre.replace(/\s/g, "")} #freebeat`);
  if (!descDepth.hasLicensingCTA) lines.push(`\nFor exclusive or non-exclusive licenses, contact: [EMAIL]`);
  lines.push(`\n© All rights reserved. Unauthorized monetization prohibited.`);
  return lines.join("\n");
}

// ── Page 1 — Channel Diagnostic ───────────────────────────────────────────────

function Page1({
  channelName,
  genre,
  snapshot,
  deep,
}: {
  channelName: string;
  genre: string | null;
  snapshot: ChannelSnapshot;
  deep: DeepChannelAnalysis | null;
}) {
  const raw = snapshot.raw_data;
  const tallyScore = deep
    ? computeTallyScoreFromAnalysis(deep)
    : { total: 0, breakdown: [], tip: "" };

  const subscribers = raw.subscribers;
  const avgViews = raw.avgViews;
  const videoCount = raw.videoCount;
  const topViews = raw.top3[0]?.views ?? 0;
  const keyPattern = snapshot.top_insight;

  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.wordmark}>TALLY</Text>
        <Text style={s.headerSub}>Channel Diagnostic Report</Text>
      </View>
      <View style={s.divider} />

      {/* Channel name */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <View>
          <Text style={s.channelName}>{channelName}</Text>
          <Text style={s.channelMeta}>{genre ?? "Type Beats"} · {monthYear()}</Text>
        </View>
        <Text style={{ fontSize: 7, color: C.dim, marginTop: 4 }}>Generated {genTimestamp()}</Text>
      </View>

      {/* Section 1 — Snapshot stats */}
      <Text style={s.sectionLabel}>CHANNEL SNAPSHOT</Text>
      <View style={s.statRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{fmt(subscribers)}</Text>
          <Text style={s.statLabel}>SUBSCRIBERS</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>{fmt(avgViews)}</Text>
          <Text style={s.statLabel}>AVG VIEWS / VIDEO (30D)</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>{videoCount}</Text>
          <Text style={s.statLabel}>VIDEOS POSTED (30D)</Text>
        </View>
        <View style={s.statBoxLast}>
          <Text style={s.statNum}>{fmt(topViews)}</Text>
          <Text style={s.statLabel}>TOP VIDEO VIEWS (30D)</Text>
        </View>
      </View>

      {/* Section 2 — TALLY Score */}
      <Text style={s.sectionLabel}>YOUR TALLY SCORE</Text>
      <View style={s.scoreBlock}>
        <View style={s.scoreLeft}>
          <Text style={[s.scoreNum, { color: scoreColor(tallyScore.total) }]}>
            {tallyScore.total}
          </Text>
          <Text style={s.scoreOutOf}>out of 100</Text>
        </View>
        <View style={s.scoreRight}>
          {tallyScore.breakdown.map((cat) => {
            const pct = cat.max > 0 ? cat.score / cat.max : 0;
            return (
              <View key={cat.category} style={s.scoreBreakdownRow}>
                <Text style={s.scoreCatLabel}>{cat.category}</Text>
                <View style={s.scoreBarBg}>
                  <View
                    style={[
                      s.scoreBarFill,
                      {
                        width: `${Math.round(pct * 100)}%`,
                        backgroundColor: scoreColor(Math.round(pct * 100)),
                      },
                    ]}
                  />
                </View>
                <Text style={s.scoreCatValue}>{cat.score}/{cat.max}</Text>
              </View>
            );
          })}
          {tallyScore.tip ? (
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              {tallyScore.tip}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Section 3 — Key Pattern */}
      <Text style={s.sectionLabel}>THE KEY PATTERN</Text>
      <View style={s.patternBlock}>
        <Text style={s.patternText}>{keyPattern}</Text>
        {deep && deep.winnersVsLosers.keyGap !== keyPattern ? (
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            {deep.winnersVsLosers.keyGap}
          </Text>
        ) : null}
      </View>

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerLeft}>Confidential — prepared for {channelName}</Text>
        <Text style={s.footerCenter}>tallyagc.com</Text>
        <Text style={s.footerRight}>Page 1</Text>
      </View>
    </Page>
  );
}

// ── Page 2 — Niche Intelligence ────────────────────────────────────────────────

function Page2({
  channelName,
  snapshot,
  deep,
}: {
  channelName: string;
  snapshot: ChannelSnapshot;
  deep: DeepChannelAnalysis | null;
}) {
  // Derive keyword data from niche videos if deep analysis available
  const allNicheKeywords = deep
    ? (() => {
        const freq = new Map<string, number>();
        for (const v of deep.nicheVideos) {
          const seen = new Set<string>();
          for (const t of v.tags) {
            const kw = t.toLowerCase().trim();
            if (kw.length >= 3 && !seen.has(kw)) {
              seen.add(kw);
              freq.set(kw, (freq.get(kw) ?? 0) + 1);
            }
          }
        }
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      })()
    : [];

  const maxKwFreq = allNicheKeywords[0]?.[1] ?? 1;
  const missingKws = deep ? deep.missingKeywords.slice(0, 5) : [];
  const timing = deep ? deep.timingIntelligence : null;
  const artists = deep ? deep.artistAssociations.slice(0, 5) : snapshot.raw_data.artistPerformance.slice(0, 5);

  // Trending artists from niche (those in deep analysis not produced by this channel)
  const trendingNotMade = deep
    ? deep.artistAssociations.filter((a) => a.isTrending).slice(0, 3)
    : [];
  const trendingMade = deep
    ? deep.artistAssociations.filter((a) => a.isTrending && a.videoCount > 0).slice(0, 3)
    : [];

  return (
    <Page size="A4" style={s.page}>
      <View style={s.headerRow}>
        <Text style={s.wordmark}>TALLY</Text>
        <Text style={s.headerSub}>What&apos;s Working in Your Niche Right Now</Text>
      </View>
      <View style={s.divider} />

      <View style={s.twoCol}>
        {/* Left column */}
        <View style={s.colLeft}>
          {/* Top 10 trending keywords */}
          <Text style={s.sectionLabel}>TOP 10 TRENDING KEYWORDS THIS MONTH</Text>
          {allNicheKeywords.length > 0 ? (
            allNicheKeywords.map(([kw, count]) => (
              <View key={kw} style={s.kwRow}>
                <Text style={s.kwLabel}>{kw}</Text>
                <View style={s.kwBarBg}>
                  <View
                    style={[
                      s.kwBarFill,
                      { width: `${Math.round((count / maxKwFreq) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={s.kwCount}>{count}</Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 8, color: C.muted }}>Keyword data not available.</Text>
          )}

          {/* Missing keywords */}
          {missingKws.length > 0 && (
            <View>
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>MISSING OPPORTUNITIES</Text>
              <Text style={{ fontSize: 7, color: C.dim, marginBottom: 6 }}>
                Used by niche top performers — not in your last 30 days
              </Text>
              <View style={s.missingRow}>
                {missingKws.map((k) => (
                  <View key={k.keyword} style={s.missingTag}>
                    <Text style={s.missingTagText}>{k.keyword}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Right column */}
        <View style={s.colRight}>
          {/* Timing intelligence */}
          <Text style={s.sectionLabel}>TIMING INTELLIGENCE</Text>
          {timing ? (
            <View>
              <View style={s.insightCard}>
                <Text style={s.insightTitle}>Best day in your niche</Text>
                <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.green, marginBottom: 2 }}>
                  {timing.bestDayInNiche}
                </Text>
                <Text style={s.insightBody}>{timing.bestDayMultiplier}x niche avg views</Text>
              </View>
              <View style={s.insightCard}>
                <Text style={s.insightTitle}>Your most common upload day</Text>
                <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 2 }}>
                  {timing.producerMostCommonDay}
                </Text>
                <Text style={s.insightBody}>
                  {timing.producerAvgViewsOnMostCommonDay.toLocaleString()} avg views on that day
                </Text>
              </View>
              <View style={[s.insightCard, { borderColor: timing.producerMostCommonDay === timing.bestDayInNiche ? C.green : C.amber }]}>
                <Text style={s.insightTitle}>The gap</Text>
                <Text style={s.insightBody}>{timing.gap}</Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 8, color: C.muted }}>Timing data not available.</Text>
          )}

          {/* Artist intelligence */}
          <Text style={[s.sectionLabel, { marginTop: 14 }]}>ARTIST INTELLIGENCE</Text>
          {artists.length > 0 ? (
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderText, { flex: 1 }]}>ARTIST</Text>
                <Text style={[s.tableHeaderText, { width: 40 }]}>VIDEOS</Text>
                <Text style={[s.tableHeaderText, { width: 55, textAlign: "right" as any }]}>AVG VIEWS</Text>
                <Text style={[s.tableHeaderText, { width: 45, textAlign: "right" as any }]}>TRENDING</Text>
              </View>
              {"videoCount" in (artists[0] ?? {})
                ? (artists as NonNullable<typeof deep>["artistAssociations"]).map((a) => (
                    <View key={a.name} style={s.tableRow}>
                      <Text style={[s.tableTextWhite, { flex: 1 }]}>{a.name}</Text>
                      <Text style={[s.tableText, { width: 40 }]}>{a.videoCount}</Text>
                      <Text style={[s.tableText, { width: 55, textAlign: "right" as any }]}>{fmt(a.avgViews)}</Text>
                      <Text style={[s.tableText, { width: 45, textAlign: "right" as any, color: "isTrending" in a && a.isTrending ? C.green : C.dim }]}>
                        {"isTrending" in a && a.isTrending ? "Yes" : "—"}
                      </Text>
                    </View>
                  ))
                : (artists as typeof snapshot.raw_data.artistPerformance).map((a) => (
                    <View key={a.name} style={s.tableRow}>
                      <Text style={[s.tableTextWhite, { flex: 1 }]}>{a.name}</Text>
                      <Text style={[s.tableText, { width: 40 }]}>{a.videoCount}</Text>
                      <Text style={[s.tableText, { width: 55, textAlign: "right" as any }]}>{fmt(a.avgViews)}</Text>
                      <Text style={[s.tableText, { width: 45, textAlign: "right" as any, color: C.dim }]}>—</Text>
                    </View>
                  ))}
            </View>
          ) : (
            <Text style={{ fontSize: 8, color: C.muted }}>No artist data available yet.</Text>
          )}

          {trendingNotMade.length > 0 && trendingMade.length === 0 && (
            <Text style={{ fontSize: 7, color: C.amber, marginTop: 6, lineHeight: 1.5 }}>
              Trending artists you haven&apos;t made beats for: {trendingNotMade.map((a) => a.name).join(", ")}
            </Text>
          )}
        </View>
      </View>

      <View style={s.footer} fixed>
        <Text style={s.footerLeft}>Confidential — prepared for {channelName}</Text>
        <Text style={s.footerCenter}>tallyagc.com</Text>
        <Text style={s.footerRight}>Page 2</Text>
      </View>
    </Page>
  );
}

// ── Page 3 — Your Next Upload, Optimized ──────────────────────────────────────

function Page3({
  channelName,
  genre,
  snapshot,
  deep,
}: {
  channelName: string;
  genre: string | null;
  snapshot: ChannelSnapshot;
  deep: DeepChannelAnalysis | null;
}) {
  const rec = deep?.nextUpload ?? null;
  const titleFormula = deep?.titleFormula ?? null;
  const descDepth = deep?.descriptionDepth ?? null;
  const descTemplate = deep
    ? buildDescriptionTemplate(
        deep.nextUpload.genre || genre || "hip hop",
        deep.nextUpload.artistCombination,
        deep.descriptionDepth
      )
    : null;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.headerRow}>
        <Text style={s.wordmark}>TALLY</Text>
        <Text style={s.headerSub}>Your Next Upload, Optimized</Text>
      </View>
      <View style={s.divider} />

      {/* Section 1 — Recommendation Box */}
      <Text style={s.sectionLabel}>THE RECOMMENDATION</Text>
      <Text style={{ fontSize: 8, color: C.dim, marginBottom: 8 }}>
        Based on your channel data and current niche trends, here&apos;s exactly what to make next:
      </Text>

      {rec ? (
        <View style={s.recBox}>
          <Text style={s.recTitle}>NEXT UPLOAD BLUEPRINT</Text>
          <View style={s.recRow}>
            <Text style={s.recRowLabel}>Style / Vibe</Text>
            <Text style={s.recRowValue}>{rec.genre}</Text>
          </View>
          <View style={s.recRow}>
            <Text style={s.recRowLabel}>BPM Range</Text>
            <Text style={s.recRowValue}>{rec.bpmRange}</Text>
          </View>
          <View style={s.recRow}>
            <Text style={s.recRowLabel}>Artist Combination</Text>
            <Text style={s.recRowValue}>{rec.artistCombination}</Text>
          </View>
          <View style={s.recRow}>
            <Text style={s.recRowLabel}>Recommended Title</Text>
            <Text style={s.recRowValue}>{rec.recommendedTitle}</Text>
          </View>
          <View style={[s.recRow, { marginBottom: 0 }]}>
            <Text style={s.recRowLabel}>Best Upload Time</Text>
            <Text style={s.recRowValue}>{rec.uploadDay} · {rec.uploadTime}</Text>
          </View>
        </View>
      ) : (
        <View style={s.recBox}>
          <Text style={{ fontSize: 8, color: C.muted }}>
            {snapshot.recommendation || "Run a full channel analysis to get a specific next-upload recommendation."}
          </Text>
        </View>
      )}

      {/* Justification */}
      {rec && rec.justification.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          {rec.justification.map((j, i) => (
            <View key={i} style={s.justRow}>
              <Text style={s.justBullet}>→</Text>
              <Text style={s.justText}>{j}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.twoCol}>
        {/* Left: Title Formula */}
        <View style={s.colLeft}>
          <Text style={s.sectionLabel}>TITLE FORMULA</Text>
          <View style={s.formulaBox}>
            {titleFormula ? (
              <View>
                <Text style={{ fontSize: 7, color: C.dim, marginBottom: 4 }}>
                  Used by top {Math.round(titleFormula.producerScore > 0 ? titleFormula.producerScore : 70)}% of niche top videos
                </Text>
                <Text style={s.formulaText}>{titleFormula.formula}</Text>
                <View style={s.thickDivider} />
                <Text style={{ fontSize: 7, color: C.dim, marginBottom: 4 }}>Examples from niche</Text>
                {titleFormula.topNicheExamples.slice(0, 3).map((ex, i) => (
                  <Text key={i} style={s.formulaExample}>· {truncate(ex, 60)}</Text>
                ))}
                <View style={s.thickDivider} />
                <View style={s.scoreBreakdownRow}>
                  <Text style={{ fontSize: 7, color: C.muted }}>Your title score</Text>
                  <View style={[s.scoreBarBg, { marginLeft: 8 }]}>
                    <View
                      style={[
                        s.scoreBarFill,
                        {
                          width: `${titleFormula.producerScore}%`,
                          backgroundColor: scoreColor(titleFormula.producerScore),
                        },
                      ]}
                    />
                  </View>
                  <Text style={{ fontSize: 7, color: scoreColor(titleFormula.producerScore), width: 30, textAlign: "right" as any }}>
                    {titleFormula.producerScore}/100
                  </Text>
                </View>
                {titleFormula.missingElements.length > 0 && (
                  <Text style={{ fontSize: 7, color: C.amber, marginTop: 5, lineHeight: 1.5 }}>
                    Missing: {titleFormula.missingElements.join(", ")}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={{ fontSize: 8, color: C.muted }}>
                {snapshot.title_pattern || "Run a full analysis to get title formula data."}
              </Text>
            )}
          </View>
        </View>

        {/* Right: Description Template */}
        <View style={s.colRight}>
          <Text style={s.sectionLabel}>DESCRIPTION TEMPLATE</Text>
          <View style={s.descBox}>
            {descDepth && (
              <View style={{ flexDirection: "row", marginBottom: 6 }}>
                <Text style={{ fontSize: 7, color: C.muted }}>Your avg: {descDepth.producerAvgWordCount} words · </Text>
                <Text style={{ fontSize: 7, color: C.muted }}>Top performers: {descDepth.nicheTopPerformerAvgWordCount} words · </Text>
                <Text style={{ fontSize: 7, color: scoreColor(descDepth.score) }}>Score: {descDepth.score}/100</Text>
              </View>
            )}
            {descTemplate ? (
              <Text style={s.descText}>{descTemplate}</Text>
            ) : (
              <Text style={s.descText}>
                {`"[Beat Name]" is a [genre] type beat produced for artists in the style of [Artist].\n\n🎵 Free for non-profit use with credit.\n📥 License: [YOUR LINK HERE]\n\n#typebeat #[genre] #freebeat\n\n© All rights reserved.`}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={[s.footer, { borderTopColor: C.border }]} fixed>
        <Text style={s.footerLeft}>Confidential — prepared for {channelName}</Text>
        <Text style={s.footerCenter}>
          This analysis is generated automatically by TALLY for every upload — tallyagc.com
        </Text>
        <Text style={s.footerRight}>Page 3</Text>
      </View>
    </Page>
  );
}

// ── PDF Document ──────────────────────────────────────────────────────────────

function TallyReport({
  channelName,
  genre,
  snapshot,
}: {
  channelName: string;
  genre: string | null;
  snapshot: ChannelSnapshot;
}) {
  const deep = snapshot.deep_analysis ?? null;

  return (
    <Document>
      <Page1 channelName={channelName} genre={genre} snapshot={snapshot} deep={deep} />
      <Page2 channelName={channelName} snapshot={snapshot} deep={deep} />
      <Page3 channelName={channelName} genre={genre} snapshot={snapshot} deep={deep} />
    </Document>
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function pdfFilename(channelName: string): string {
  const slug = channelName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" }).replace(" ", "-");
  return `TALLY-Report-${slug}-${month}.pdf`;
}

export async function generatePdfBuffer(
  channelName: string,
  genre: string | null,
  snapshot: ChannelSnapshot
): Promise<Buffer> {
  const element = React.createElement(TallyReport, { channelName, genre, snapshot });
  return renderToBuffer(element as any);
}
