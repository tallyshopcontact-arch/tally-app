import { createClient } from "@supabase/supabase-js";
import { extractContactInfo } from "./extract-contact";

const YT = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY!;

const MIN_SUBS = 200;
const MAX_SUBS = 5000;

interface RawChannel {
  channelId: string;
  channelName: string;
  description: string;
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

function scorePriority(subs: number, contactMethod: string, videoViews: number): number {
  let s = 0;
  if (subs >= 500 && subs <= 2000) s += 40;
  else if (subs > 2000 && subs <= 3500) s += 25;
  else if (subs < 500) s += 15;
  else s += 10;
  if (contactMethod === "email") s += 30;
  else if (contactMethod === "instagram") s += 20;
  if (videoViews >= 2000) s += 20;
  else if (videoViews >= 500) s += 10;
  return s;
}

export async function findProducers(
  genres: string[],
  maxResults = 50
): Promise<SavedProspect[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  // Collect channel IDs from video searches (60-day window)
  const channelGenreMap = new Map<string, string>();
  const publishedAfter = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString();

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
          if (cid && !channelGenreMap.has(cid)) {
            channelGenreMap.set(cid, genre);
          }
        }
      } catch {
        // continue if one genre search fails
      }
    })
  );

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
  if (newIds.length === 0) return [];

  // Fetch channel stats in batches of 50
  const rawChannels: RawChannel[] = [];
  for (let i = 0; i < newIds.length; i += 50) {
    const chunk = newIds.slice(i, i + 50);
    try {
      const res = await fetch(
        `${YT}/channels?part=snippet,statistics&id=${chunk.join(",")}&key=${KEY}`
      );
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (data.items ?? []) as any[]) {
        const subs = parseInt(item.statistics?.subscriberCount ?? "0");
        if (subs < MIN_SUBS || subs > MAX_SUBS) continue;
        rawChannels.push({
          channelId: item.id as string,
          channelName: (item.snippet?.title ?? "") as string,
          description: (item.snippet?.description ?? "") as string,
          subscriberCount: subs,
          genre: channelGenreMap.get(item.id as string) ?? genres[0],
        });
      }
    } catch {
      // continue on chunk failure
    }
  }

  if (rawChannels.length === 0) return [];

  // Cap at 25 channels before video fetching to limit API quota
  const capped = rawChannels.slice(0, 25);

  // Get latest video per channel via uploads playlist (1 quota unit vs 100 for search)
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
        if (!item) {
          return {
            ...ch,
            latestVideoTitle: null,
            latestVideoUrl: null,
            latestVideoViews: 0,
          };
        }

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
      const { email, instagram, contactMethod } = extractContactInfo(
        ch.description
      );
      return {
        ch,
        email,
        instagram,
        contactMethod,
        score: scorePriority(ch.subscriberCount, contactMethod, ch.latestVideoViews),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // Insert into prospects and collect saved rows
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
    }
  }

  return saved;
}
