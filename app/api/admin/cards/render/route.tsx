// Admin social card generator — renders branded PNGs of lane data for
// posting on X/Instagram. Stateless: reads the latest lane_analyses row per
// requested lane and renders straight from it, no writes, no history.
//
// Auth: same shared-secret pattern as /api/admin/financials (x-admin-password
// header). The admin page at /admin/cards never points an <img> straight at
// this URL — that would force the admin password into a plain query string,
// which browsers/hosts log. Instead it fetches with the header and turns the
// PNG into a blob: URL for both the preview <img> and the download link.
import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase";
import { loadCardLane, CARD_PALETTES, type CardLaneData, type CardPalette, type CardTheme } from "@/lib/lanes/cards";
import type { LaneStatus } from "@/lib/lanes/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// ── Sizes ────────────────────────────────────────────────────────────────

const SIZES = {
  landscape: { width: 1200, height: 675 },
  portrait: { width: 1080, height: 1350 },
} as const;
type SizeKey = keyof typeof SIZES;

// ── Fonts — @vercel/og (satori) has no default typeface; every glyph on the
// card must resolve to a font we hand it explicitly. Space Grotesk 500/700
// covers both the numerals and the rest of the card's text so no second
// family needs loading. Files are local (public/fonts) rather than fetched
// from Google Fonts at request time, so rendering never depends on outbound
// network access. Cached at module scope — read once per server instance. ──

type LoadedFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" };

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return new Uint8Array(buf).buffer;
}

let fontsPromise: Promise<LoadedFont[]> | null = null;
function loadFonts(): Promise<LoadedFont[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const dir = path.join(process.cwd(), "public", "fonts");
      const [medium, bold] = await Promise.all([
        readFile(path.join(dir, "SpaceGrotesk-Medium.woff")),
        readFile(path.join(dir, "SpaceGrotesk-Bold.woff")),
      ]);
      return [
        { name: "Space Grotesk", data: toArrayBuffer(medium), weight: 500, style: "normal" },
        { name: "Space Grotesk", data: toArrayBuffer(bold), weight: 700, style: "normal" },
      ];
    })();
  }
  return fontsPromise;
}

// ── Design tokens — mirrors ScoreMeter.tsx / StatusBadge.tsx exactly. Kept
// as plain hex here (rather than imported) because those components style
// via Tailwind classNames, which satori can't read — only inline style
// objects render. If the app's status colors/labels or meter tick geometry
// ever change, mirror the change here too. Theme (background/headline/muted/
// border) lives in lib/lanes/cards.ts instead, since ACCENT and the status
// colors below are fixed across both themes by design — only CARD_PALETTES
// varies per theme. ──

const ACCENT = "#e8833a";
const TICKS = 16;

const STATUS: Record<LaneStatus, { color: string; border: string; bg: string; label: string }> = {
  green: { color: "#4ade80", border: "#1a3a1a", bg: "#0a1a0a", label: "Strong opportunity" },
  yellow: { color: "#fbbf24", border: "#3a2a0a", bg: "#1a140a", label: "Moderate opportunity" },
  red: { color: "#f87171", border: "#3a1a1a", bg: "#1a0a0a", label: "Tough lane" },
};

// ── Building blocks ──────────────────────────────────────────────────────

function Watermark({ palette }: { palette: CardPalette }) {
  return (
    <div style={{ position: "absolute", right: 40, bottom: 32, display: "flex", alignItems: "baseline" }}>
      <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, letterSpacing: 3, color: ACCENT }}>
        TALLY
      </span>
      <span style={{ fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 15, color: palette.muted, marginLeft: 8 }}>
        — tallyagc.com
      </span>
    </div>
  );
}

/** Same tick geometry as ScoreMeter.tsx (16 ticks, height = 6 + i*1.6px),
 * scaled uniformly so versus's half-width columns still read as the same
 * meter, just smaller — never re-proportioned per size. Unfilled ticks use
 * the theme's border color — the same subtle, low-contrast role that color
 * plays everywhere else on the card. */
function Meter({ score, scale = 1, palette }: { score: number; scale?: number; palette: CardPalette }) {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * TICKS);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {Array.from({ length: TICKS }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: Math.max(2, Math.round(3 * scale)),
            height: Math.round((6 + i * 1.6) * scale),
            borderRadius: 2,
            backgroundColor: i < filled ? ACCENT : palette.border,
          }}
        />
      ))}
    </div>
  );
}

function ScoreNumeral({ score, scale = 1, palette }: { score: number; scale?: number; palette: CardPalette }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end" }}>
      <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: Math.round(150 * scale), color: ACCENT, lineHeight: 1 }}>
        {Math.round(score)}
      </span>
      <span
        style={{
          fontFamily: "Space Grotesk",
          fontWeight: 500,
          fontSize: Math.round(28 * scale),
          color: palette.muted,
          marginLeft: 6,
          marginBottom: Math.round(12 * scale),
        }}
      >
        /100
      </span>
    </div>
  );
}

function StatusPill({ status, scale = 1 }: { status: LaneStatus; scale?: number }) {
  const s = STATUS[status];
  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${s.border}`,
        backgroundColor: s.bg,
        padding: `${Math.round(6 * scale)}px ${Math.round(14 * scale)}px`,
        fontFamily: "Space Grotesk",
        fontWeight: 700,
        fontSize: Math.round(14 * scale),
        letterSpacing: 2,
        textTransform: "uppercase",
        color: s.color,
      }}
    >
      {s.label}
    </div>
  );
}

function StatLine({ winnability, scale = 1, palette }: { winnability: number; scale?: number; palette: CardPalette }) {
  return (
    <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 500, fontSize: Math.round(20 * scale), color: palette.muted }}>
      {Math.round(winnability)}% of top 20 videos come from small channels
    </div>
  );
}

function Eyebrow({ children, scale = 1 }: { children: string; scale?: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Space Grotesk",
        fontWeight: 700,
        fontSize: Math.round(18 * scale),
        letterSpacing: 5,
        textTransform: "uppercase",
        color: ACCENT,
      }}
    >
      {children}
    </div>
  );
}

function LaneBody({ data, scale = 1, palette }: { data: CardLaneData; scale?: number; palette: CardPalette }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(18 * scale) }}>
      <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: Math.round(46 * scale), color: palette.headline }}>
        {data.displayName}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: Math.round(24 * scale) }}>
        <ScoreNumeral score={data.opportunity} scale={scale} palette={palette} />
        <Meter score={data.opportunity} scale={scale} palette={palette} />
      </div>
      <StatusPill status={data.status} scale={scale} />
      <StatLine winnability={data.winnability} scale={scale} palette={palette} />
    </div>
  );
}

// ── Card frames ──────────────────────────────────────────────────────────

function CardFrame({
  width,
  height,
  palette,
  children,
}: {
  width: number;
  height: number;
  palette: CardPalette;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: palette.background,
        position: "relative",
      }}
    >
      {children}
      <Watermark palette={palette} />
    </div>
  );
}

function SingleCardBody({ data, eyebrow, palette }: { data: CardLaneData; eyebrow?: string; palette: CardPalette }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <LaneBody data={data} scale={1} palette={palette} />
    </div>
  );
}

function VersusCardBody({ left, right, palette }: { left: CardLaneData; right: CardLaneData; palette: CardPalette }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", padding: "0 48px" }}>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <LaneBody data={left} scale={0.62} palette={palette} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 36px" }}>
        <div style={{ display: "flex", width: 2, height: 140, backgroundColor: palette.border }} />
        <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 26, color: ACCENT, margin: "18px 0" }}>
          VS
        </div>
        <div style={{ display: "flex", width: 2, height: 140, backgroundColor: palette.border }} />
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <LaneBody data={right} scale={0.62} palette={palette} />
      </div>
    </div>
  );
}

function ErrorCardBody({ message, palette }: { message: string; palette: CardPalette }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 80 }}>
      <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: "#f87171" }}>
        Card unavailable
      </div>
      <div style={{ display: "flex", fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 22, color: palette.muted, textAlign: "center" }}>
        {message}
      </div>
    </div>
  );
}

// ── Route ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const template = url.searchParams.get("template") ?? "single";
  const sizeKey: SizeKey = url.searchParams.get("size") === "portrait" ? "portrait" : "landscape";
  const { width, height } = SIZES[sizeKey];
  const theme: CardTheme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  const palette = CARD_PALETTES[theme];
  const fonts = await loadFonts();

  const renderPng = (node: React.ReactElement) =>
    new ImageResponse(
      <CardFrame width={width} height={height} palette={palette}>{node}</CardFrame>,
      { width, height, fonts }
    );

  if (template !== "single" && template !== "weekly" && template !== "versus") {
    return renderPng(<ErrorCardBody message={`Unknown template "${template}"`} palette={palette} />);
  }

  const supabase = createServerClient();

  if (template === "versus") {
    const slug1 = url.searchParams.get("laneSlug1");
    const slug2 = url.searchParams.get("laneSlug2");
    if (!slug1 || !slug2) {
      return renderPng(<ErrorCardBody message="Missing laneSlug1 or laneSlug2" palette={palette} />);
    }
    const [r1, r2] = await Promise.all([loadCardLane(supabase, slug1), loadCardLane(supabase, slug2)]);
    if (!r1.ok) return renderPng(<ErrorCardBody message={`${slug1} — ${r1.error}`} palette={palette} />);
    if (!r2.ok) return renderPng(<ErrorCardBody message={`${slug2} — ${r2.error}`} palette={palette} />);
    return renderPng(<VersusCardBody left={r1.data} right={r2.data} palette={palette} />);
  }

  const slug = url.searchParams.get("laneSlug");
  if (!slug) {
    return renderPng(<ErrorCardBody message="Missing laneSlug" palette={palette} />);
  }
  const result = await loadCardLane(supabase, slug);
  if (!result.ok) {
    return renderPng(<ErrorCardBody message={result.error} palette={palette} />);
  }
  return renderPng(
    <SingleCardBody data={result.data} eyebrow={template === "weekly" ? "Lane of the Week" : undefined} palette={palette} />
  );
}
