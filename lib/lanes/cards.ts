// Social card generator — shared lane lookup for /api/admin/cards/render.
// Reuses the exact same freshness/status rules as the rest of the app
// (isLaneFresh's 14-day window, computeStatus's green/yellow/red cutoffs) so
// a card can never show a status or "fresh" claim the live product wouldn't.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isLaneFresh } from "./db";
import { computeStatus, type LaneStatus } from "./scoring";

// ── Theme palettes for the social card generator (see
// app/api/admin/cards/render/route.tsx). Score numeral, "TALLY" wordmark, and
// status pill colors are NOT part of this palette — those are fixed accent/
// status colors that stay the same in both themes by design. ──

export type CardTheme = "dark" | "light";

export interface CardPalette {
  background: string;
  headline: string;
  muted: string;
  border: string;
}

export const CARD_PALETTES: Record<CardTheme, CardPalette> = {
  dark: {
    background: "#0A0A0A",
    headline: "#F5F5F5",
    muted: "#A3A3A3",
    border: "#262626",
  },
  light: {
    background: "#FFFFFF",
    headline: "#0A0A0A",
    muted: "#525252",
    border: "#E5E5E5",
  },
};

export interface CardLaneData {
  displayName: string;
  slug: string;
  opportunity: number;
  winnability: number;
  status: LaneStatus;
}

export type CardLaneResult =
  | { ok: true; data: CardLaneData }
  | { ok: false; error: string };

export async function loadCardLane(supabase: SupabaseClient, slug: string): Promise<CardLaneResult> {
  const { data: lane, error: laneErr } = await supabase
    .from("lanes")
    .select("id, slug, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (laneErr) throw new Error(`loadCardLane lane lookup failed: ${laneErr.message}`);
  if (!lane) return { ok: false, error: "Lane not found" };

  const { data: analysis, error: analysisErr } = await supabase
    .from("lane_analyses")
    .select("opportunity, winnability, created_at")
    .eq("lane_id", lane.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (analysisErr) throw new Error(`loadCardLane analysis lookup failed: ${analysisErr.message}`);
  if (!analysis || !isLaneFresh(analysis.created_at as string)) {
    return { ok: false, error: "Stale data — refresh this lane first" };
  }

  return {
    ok: true,
    data: {
      displayName: lane.display_name as string,
      slug: lane.slug as string,
      opportunity: analysis.opportunity as number,
      winnability: analysis.winnability as number,
      status: computeStatus(analysis.opportunity as number),
    },
  };
}
