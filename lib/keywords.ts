// NicheVideo is defined here (not in lib/youtube.ts) so client components
// can import pure functions without pulling in server-only env vars.
export interface NicheVideo {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  tags: string[];
  publishedAt: string;
  thumbnailUrl: string;
}

export interface Keyword {
  tag: string;
  count: number;
  badge: "hot" | "stable" | "rising";
}

export function extractKeywords(nicheVideos: NicheVideo[]): Keyword[] {
  const freq = new Map<string, number>();

  for (const video of nicheVideos) {
    const seen = new Set<string>();
    for (const raw of video.tags) {
      const tag = raw.toLowerCase().trim();
      if (tag.length < 3) continue;
      if (!seen.has(tag)) {
        seen.add(tag);
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  return sorted.map(([tag, count], i) => ({
    tag,
    count,
    badge: i < 5 ? "hot" : i < 13 ? "stable" : "rising",
  }));
}

export function getTopNicheVideos(
  nicheVideos: NicheVideo[]
): (NicheVideo & { videoUrl: string })[] {
  return [...nicheVideos]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 3)
    .map((v) => ({ ...v, videoUrl: `https://www.youtube.com/watch?v=${v.videoId}` }));
}
