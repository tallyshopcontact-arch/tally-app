import { createClient } from "@supabase/supabase-js";
import { extractContactInfo } from "./extract-contact";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

const MIN_SUBS = 200;

interface RawChannel {
  channelId: string;
  channelName: string;
  description: string;
  keywords: string;
  subscriberCount: number;
  genre: string;
}

interface EnrichedChannel extends RawChannel {
  latestVideoTitle: string | null;
  latestVideoUrl: string | null;
  latestVideoViews: number;
}

export interface SavedProspect {
  id: string;
  channel_name: string;
  channel_url: string;
  subscriber_count: number;
  latest_video_title: string | null;
  genre: string | null;
  contact_method: string;
}

function scorePriority(
  subs: number,
  contactMethod: string,
  videoViews: number
): number {
  let s = 0;
  if (subs >= 500 && subs <= 2000) s += 40;
  else if (subs > 2000 && subs <= 3500) s += 25;
  else if (subs < 500) s += 15;
  else s += 10;
  if (contactMethod === "email") s += 30;
  else if (contactMethod === "instagram") s += 20;
  else s += 5;
  if (videoViews >= 2000) s += 20;
  else if (videoViews >= 500) s += 10;
  return s;
}

// ── Shared channel processing ─────────────────────────────────────────────────
// Takes a channelId→genre map, fetches stats, enriches with latest video,
// scores, and saves new prospects to the DB.

async function _processChannels(
  channelGenreMap: Map<string, string>,
  maxSubs: number,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<SavedProspect[]> {
  if (channelGenreMap.size === 0) return [];

  // Skip channels already in prospects table
  const { data: existing } = await supabase
    .from("prospects")
    .select("channel_id");
  const existingIds = new Set(
    (existing ?? []).map((r: { channel_id: string }) => r.channel_id)
  );
  const newIds = [...channelGenreMap.keys()].filter(
    (id) => !existingIds.has(id)
  );
  console.log(
    `[finder] ${newIds.length} new channels after skipping ${existingIds.size} existing`
  );
  if (newIds.length === 0) return [];

  // Batch-fetch channel stats + brandingSettings
  const rawChannels: RawChannel[] = [];
  for (let i = 0; i < newIds.length; i += 50) {
    const chunk = newIds.slice(i, i + 50);
    try {
      const res = await fetch(
        `${YT}/channels?part=snippet,statistics,brandingSettings&id=${chunk.join(",")}&key=${KEY}`
      );
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (data.items ?? []) as any[]) {
        const subs = parseInt(item.statistics?.subscriberCount ?? "0");
        if (subs < MIN_SUBS || subs > maxSubs) continue;
        rawChannels.push({
          channelId: item.id as string,
          channelName: (item.snippet?.title ?? "") as string,
          description: (item.snippet?.description ?? "") as string,
          keywords: (item.brandingSettings?.channel?.keywords ?? "") as string,
          subscriberCount: subs,
          genre: channelGenreMap.get(item.id as string) ?? "",
        });
      }
    } catch (err) {
      console.error(`[finder] channels batch fetch failed:`, err);
    }
  }

  console.log(
    `[finder] ${rawChannels.length} channels in ${MIN_SUBS}–${maxSubs} sub range`
  );
  if (rawChannels.length === 0) return [];

  // Cap at 25 before video fetching to limit quota
  const capped = rawChannels.slice(0, 25);

  // Get latest video via uploads playlist (1 quota unit each)
  const enriched: EnrichedChannel[] = await Promise.all(
    capped.map(async (ch): Promise<EnrichedChannel> => {
      try {
        const uploadsId = `UU${ch.channelId.slice(2)}`;
        const pRes = await fetch(
          `${YT}/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=1&key=${KEY}`
        );
        const pData = await pRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = (pData.items ?? [])[0] as any;
        if (!item)
          return {
            ...ch,
            latestVideoTitle: null,
            latestVideoUrl: null,
            latestVideoViews: 0,
          };

        const videoId: string = item.snippet?.resourceId?.videoId ?? "";
        const videoTitle: string = item.snippet?.title ?? "";
        let views = 0;
        if (videoId) {
          const vRes = await fetch(
            `${YT}/videos?part=statistics&id=${videoId}&key=${KEY}`
          );
          const vData = await vRes.json();
          views = parseInt(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (vData.items?.[0] as any)?.statistics?.viewCount ?? "0"
          );
        }
        return {
          ...ch,
          latestVideoTitle: videoTitle || null,
          latestVideoUrl: videoId
            ? `https://youtube.com/watch?v=${videoId}`
            : null,
          latestVideoViews: views,
        };
      } catch {
        return {
          ...ch,
          latestVideoTitle: null,
          latestVideoUrl: null,
          latestVideoViews: 0,
        };
      }
    })
  );

  // Score, sort, take top N
  const scored = enriched
    .map((ch) => {
      const searchText = [ch.description, ch.keywords]
        .filter(Boolean)
        .join(" ");
      console.log(
        `[finder] "${ch.channelName}" desc=${ch.description.length}chars keywords="${ch.keywords.slice(0, 60)}"`
      );
      const { email, instagram, contactMethod } = extractContactInfo(
        searchText,
        ch.channelName
      );
      const score = scorePriority(
        ch.subscriberCount,
        contactMethod,
        ch.latestVideoViews
      );
      console.log(
        `[finder] "${ch.channelName}" contact=${contactMethod} score=${score}`
      );
      return { ch, email, instagram, contactMethod, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // Insert and collect saved rows
  const saved: SavedProspect[] = [];
  for (const { ch, email, instagram, contactMethod } of scored) {
    const { data, error } = await supabase
      .from("prospects")
      .insert({
        channel_id: ch.channelId,
        channel_name: ch.channelName,
        channel_url: `https://youtube.com/channel/${ch.channelId}`,
        subscriber_count: ch.subscriberCount,
        latest_video_title: ch.latestVideoTitle,
        latest_video_url: ch.latestVideoUrl,
        latest_video_views: ch.latestVideoViews,
        genre: ch.genre,
        email,
        instagram_handle: instagram,
        contact_method: contactMethod,
        status: "pending",
      })
      .select(
        "id, channel_name, channel_url, subscriber_count, latest_video_title, genre, contact_method"
      )
      .single();

    if (!error && data) {
      saved.push(data as SavedProspect);
    } else if (error) {
      console.error(
        `[finder] insert failed for "${ch.channelName}":`,
        error.message
      );
    }
  }

  console.log(`[finder] saved ${saved.length} new prospects`);
  return saved;
}

// ── Genre search ──────────────────────────────────────────────────────────────

export async function findProducers(
  genres: string[],
  maxResults = 50
): Promise<SavedProspect[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const channelGenreMap = new Map<string, string>();
  const publishedAfter = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString();

  console.log(`[finder] genre search: ${genres.join(", ")}`);

  await Promise.all(
    genres.map(async (genre) => {
      try {
        const q = encodeURIComponent(`${genre} type beat`);
        const res = await fetch(
          `${YT}/search?part=snippet&type=video&q=${q}&order=date` +
            `&publishedAfter=${publishedAfter}&maxResults=50&key=${KEY}`
        );
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of (data.items ?? []) as any[]) {
          const cid: string | undefined = item.snippet?.channelId;
          if (cid && !channelGenreMap.has(cid))
            channelGenreMap.set(cid, genre);
        }
        console.log(
          `[finder] genre "${genre}" → ${channelGenreMap.size} unique channels so far`
        );
      } catch (err) {
        console.error(`[finder] search failed for genre "${genre}":`, err);
      }
    })
  );

  console.log(
    `[finder] genre search total: ${channelGenreMap.size} unique channel IDs`
  );
  return _processChannels(channelGenreMap, 5000, maxResults, supabase);
}

// ── Artist search ─────────────────────────────────────────────────────────────

export async function findProducersByArtist(
  artists: string[],
  maxResults = 50
): Promise<SavedProspect[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const channelGenreMap = new Map<string, string>();
  const publishedAfter = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  console.log(`[finder] artist search: ${artists.join(", ")}`);

  // Three queries per artist to maximise channel coverage
  const queries = artists.flatMap((artist) => [
    { q: `${artist} type beat`, genre: `${artist} type beat` },
    { q: `${artist} type beat 2026`, genre: `${artist} type beat` },
    { q: `${artist} instrumental`, genre: `${artist} type beat` },
  ]);

  await Promise.all(
    queries.map(async ({ q, genre }) => {
      try {
        const res = await fetch(
          `${YT}/search?part=snippet&type=video&q=${encodeURIComponent(q)}&order=date` +
            `&publishedAfter=${publishedAfter}&maxResults=50&key=${KEY}`
        );
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of (data.items ?? []) as any[]) {
          const cid: string | undefined = item.snippet?.channelId;
          if (cid && !channelGenreMap.has(cid))
            channelGenreMap.set(cid, genre);
        }
      } catch (err) {
        console.error(`[finder] artist search failed for "${q}":`, err);
      }
    })
  );

  console.log(
    `[finder] artist search total: ${channelGenreMap.size} unique channel IDs`
  );
  // Tighter sub range for artist search (200–2000) — more targeted
  return _processChannels(channelGenreMap, 2000, maxResults, supabase);
}
