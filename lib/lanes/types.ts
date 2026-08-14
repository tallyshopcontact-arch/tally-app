// Lane Check pivot — row shapes for the tables in supabase/lane-check-migration.sql.
// No "@/..." aliased imports in this module: it's loaded both by Next.js (bundler
// resolves aliases) and directly by plain `node scripts/*.ts` (which doesn't).

export interface Lane {
  id: string;
  slug: string;
  display_name: string;
  aliases: string[];
  genre_hint: string | null;
  request_count: number;
  last_analyzed_at: string | null;
  created_at: string;
}

export interface LaneAnalysis {
  id: string;
  lane_id: string;
  demand: number;
  saturation: number;
  winnability: number;
  opportunity: number;
  momentum: number | null;
  raw_metrics: Record<string, unknown>;
  patterns: Record<string, unknown>;
  winner_videos: unknown[];
  top_videos: unknown[];
  created_at: string;
}

/** A specific calendar month's analysis for a lane — /admin/scores's
 * dedicated cache (supabase/scores-month-cache-migration.sql), deliberately
 * a SEPARATE table from lane_analyses: lane_analyses is "the current
 * rolling-window state of this lane" that report builder/expansion picks
 * read as the latest general answer, while a row here is a fixed historical
 * month's snapshot — letting one write to the other would let an old
 * month's data become "the latest state" for callers expecting current
 * data. See lib/reports/nicheCache.ts's month-scoped branch. */
export interface LaneMonthAnalysis {
  id: string;
  lane_id: string;
  month: number;
  year: number;
  /** True when this month was confirmed to have zero matching videos —
   * demand/saturation/etc. are meaningless zeroes in that case, cached only
   * so a repeated non-force check doesn't re-spend quota rediscovering it. */
  no_data: boolean;
  demand: number;
  saturation: number;
  winnability: number;
  opportunity: number;
  raw_metrics: Record<string, unknown>;
  patterns: Record<string, unknown>;
  winner_videos: unknown[];
  top_videos: unknown[];
  created_at: string;
}

export type LaneJobStatus = "queued" | "running" | "done" | "failed";

export interface LaneJob {
  id: string;
  lane_id: string;
  status: LaneJobStatus;
  priority: number;
  requested_by: string | null;
  notify_email: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface LaneCheck {
  id: string;
  user_id: string | null;
  email: string | null;
  lane_ids: string[];
  genre: string | null;
  channel_id: string | null;
  beat_name: string | null;
  created_at: string;
}

export interface LaneCheckLead {
  id: string;
  email: string;
  lane_check_id: string;
  verified: boolean;
  verify_token: string | null;
  created_at: string;
}

export interface ChannelCacheEntry {
  channel_id: string;
  title: string | null;
  subscriber_count: number | null;
  /** Channel creation date (YouTube's snippet.publishedAt). Nullable because
   * rows cached before this field was added won't have it until the channel
   * is looked up again — see supabase/insights-migration.sql. */
  channel_published_at: string | null;
  updated_at: string;
}
