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

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  bg: "#0a0a0a",
  surface: "#111111",
  border: "#1e1e1e",
  white: "#ffffff",
  muted: "#94a3b8",
  dim: "#475569",
  green: "#4ade80",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    paddingTop: 40,
    paddingBottom: 48,
    paddingLeft: 44,
    paddingRight: 44,
    fontFamily: "Helvetica",
    color: C.white,
  },

  // header
  headerRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  wordmark: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.white, letterSpacing: 3 },
  headerSub: { fontSize: 9, color: C.muted, marginLeft: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 8, marginBottom: 20 },

  // channel banner
  bannerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  channelName: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.white },
  dateText: { fontSize: 9, color: C.muted, marginTop: 6 },
  genreText: { fontSize: 9, color: C.muted, marginTop: 3 },

  // section
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 20,
  },

  // stat boxes
  statRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
  },
  statNum: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 3 },
  statLabel: { fontSize: 7, color: C.muted, letterSpacing: 1 },

  // insight block
  insightBlock: {
    borderLeftWidth: 2,
    borderLeftColor: C.white,
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 4,
  },
  insightText: { fontSize: 11, color: C.white, lineHeight: 1.55 },

  // table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 6,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#161616",
  },
  rankCol: { width: 24, fontSize: 9, color: C.dim },
  titleCol: { flex: 1, fontSize: 9, color: C.white },
  viewsCol: { width: 70, fontSize: 9, color: C.muted, textAlign: "right" },
  tableHeaderText: { fontSize: 7, color: C.dim, letterSpacing: 1 },

  // bullet list
  bulletItem: { flexDirection: "row", marginBottom: 8 },
  bullet: { width: 14, fontSize: 9, color: C.green, marginTop: 1 },
  bulletText: { flex: 1, fontSize: 10, color: C.muted, lineHeight: 1.5 },

  // numbered list
  numItem: { flexDirection: "row", marginBottom: 10 },
  numLabel: { width: 20, fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white },
  numContent: { flex: 1 },
  numTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 2 },
  numBody: { fontSize: 9, color: C.muted, lineHeight: 1.5 },

  // gap block
  gapBlock: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  gapText: { fontSize: 10, color: C.white, lineHeight: 1.6 },

  // footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
  },
  footerLeft: { fontSize: 7, color: C.dim },
  footerRight: { fontSize: 7, color: C.dim },
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
  const { raw_data, top_insight, positioning_gap, title_pattern, recommendation } = snapshot;
  const { subscribers, avgViews, videoCount, top3, artistPerformance } = raw_data;

  const topVideoViews = top3[0]?.views ?? 0;

  // Derive what's-working bullets from top3 and title_pattern
  const workingBullets: string[] = [];
  if (top3.length > 0) {
    const topArtist = artistPerformance[0];
    if (topArtist) {
      workingBullets.push(
        `${topArtist.name} type beats average ${fmt(topArtist.avgViews)} views — your highest-performing artist association.`
      );
    }
    workingBullets.push(title_pattern || "Your top video titles share a clear structural pattern.");
    if (raw_data.uploadsPerMonth > 0) {
      workingBullets.push(`Upload frequency of ~${raw_data.uploadsPerMonth} video${raw_data.uploadsPerMonth === 1 ? "" : "s"}/month is building consistent channel momentum.`);
    }
  }

  // Derive 3 action items from recommendation
  const actionItems = [
    {
      title: "Focus on your highest-performing artist",
      body:
        artistPerformance.length > 0
          ? `Double your output of ${artistPerformance[0]?.name ?? "top-performing"} type beats — they average ${fmt(artistPerformance[0]?.avgViews ?? 0)} views vs your channel avg of ${fmt(avgViews)}.`
          : "Identify the artist association getting the most views and increase uploads in that niche.",
    },
    {
      title: "Optimize your titles",
      body:
        title_pattern ||
        `Your best titles average ${raw_data.avgTitleLength} characters. Aim for titles under 60 characters with the artist name and year prominently placed.`,
    },
    {
      title: "Implement the recommendation",
      body: recommendation || "Apply the data-driven recommendation above consistently for 30 days and track the results.",
    },
  ];

  return (
    <Document>
      {/* ─── PAGE 1 ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.wordmark}>TALLY</Text>
          <Text style={s.headerSub}>Channel Analysis Report</Text>
        </View>
        <View style={s.divider} />

        {/* Channel banner */}
        <View style={s.bannerRow}>
          <View>
            <Text style={s.channelName}>{channelName}</Text>
            <Text style={s.genreText}>{genre ?? "Type Beats"}</Text>
          </View>
          <Text style={s.dateText}>{monthYear()}</Text>
        </View>

        {/* Stat boxes */}
        <Text style={s.sectionLabel}>Channel Snapshot</Text>
        <View style={s.statRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{fmt(subscribers)}</Text>
            <Text style={s.statLabel}>SUBSCRIBERS</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{fmt(avgViews)}</Text>
            <Text style={s.statLabel}>AVG VIEWS / VIDEO</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{videoCount}</Text>
            <Text style={s.statLabel}>VIDEOS ANALYZED</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{fmt(topVideoViews)}</Text>
            <Text style={s.statLabel}>TOP VIDEO VIEWS</Text>
          </View>
        </View>

        {/* Key insight */}
        <Text style={s.sectionLabel}>What We Found</Text>
        <View style={s.insightBlock}>
          <Text style={s.insightText}>{top_insight}</Text>
        </View>

        {/* Top 3 videos */}
        {top3.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>Top 3 Videos</Text>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.rankCol]}>#</Text>
              <Text style={[s.tableHeaderText, s.titleCol]}>TITLE</Text>
              <Text style={[s.tableHeaderText, s.viewsCol]}>VIEWS</Text>
            </View>
            {top3.map((v, i) => (
              <View key={v.videoId} style={s.tableRow}>
                <Text style={s.rankCol}>{i + 1}</Text>
                <Text style={s.titleCol}>{truncate(v.title, 60)}</Text>
                <Text style={s.viewsCol}>{fmt(v.views)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Artist performance */}
        {artistPerformance.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>Artist Association Performance</Text>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { width: 140 }]}>ARTIST</Text>
              <Text style={[s.tableHeaderText, { width: 60 }]}>VIDEOS</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: "right" as const }]}>AVG VIEWS</Text>
            </View>
            {artistPerformance.slice(0, 5).map((a) => (
              <View key={a.name} style={s.tableRow}>
                <Text style={{ width: 140, fontSize: 9, color: C.white }}>{a.name} type beat</Text>
                <Text style={{ width: 60, fontSize: 9, color: C.muted }}>{a.videoCount}</Text>
                <Text style={{ flex: 1, fontSize: 9, color: C.muted, textAlign: "right" as const }}>{fmt(a.avgViews)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>Generated by TALLY — tallyagc.com</Text>
          <Text style={s.footerRight}>Confidential — prepared for {channelName}</Text>
        </View>
      </Page>

      {/* ─── PAGE 2 ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.wordmark}>TALLY</Text>
          <Text style={s.headerSub}>Recommendations</Text>
        </View>
        <View style={s.divider} />

        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white, marginBottom: 6 }}>
          {channelName} — Growth Recommendations
        </Text>

        {/* What's working */}
        {workingBullets.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>What&apos;s Working</Text>
            {workingBullets.map((b, i) => (
              <View key={i} style={s.bulletItem}>
                <Text style={s.bullet}>✓</Text>
                <Text style={s.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* The gap */}
        <Text style={s.sectionLabel}>The Gap</Text>
        <View style={s.gapBlock}>
          <Text style={s.gapText}>{positioning_gap}</Text>
        </View>

        {/* Action items */}
        <Text style={s.sectionLabel}>What To Do Next</Text>
        {actionItems.map((item, i) => (
          <View key={i} style={s.numItem}>
            <Text style={s.numLabel}>{i + 1}.</Text>
            <View style={s.numContent}>
              <Text style={s.numTitle}>{item.title}</Text>
              <Text style={s.numBody}>{item.body}</Text>
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>Generated by TALLY — tallyagc.com</Text>
          <Text style={s.footerRight}>Confidential — prepared for {channelName}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generatePdfBuffer(
  channelName: string,
  genre: string | null,
  snapshot: ChannelSnapshot
): Promise<Buffer> {
  const element = React.createElement(TallyReport, { channelName, genre, snapshot });
  // renderToBuffer is typed as returning Promise<Buffer> in v4
  return renderToBuffer(element as any);
}
