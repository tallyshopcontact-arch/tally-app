// Replaces the old two-gallery layout ("Winning at your size" + "Top videos in
// this lane") with one section: the single highest-performing video from each
// of 3 subscriber brackets, so a producer sees exactly what's winning at their
// own size, one size up, and at the top — no digging through a scrollable list.
export interface GalleryVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelId?: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  publishedAt: string;
}

interface Bracket {
  key: string;
  label: string;
  emptyLabel: string;
  test: (subs: number) => boolean;
}

const BRACKETS: Bracket[] = [
  { key: "small", label: "Smallest channel winning in this lane", emptyLabel: "smallest-channel", test: (s) => s < 1000 },
  { key: "mid", label: "Mid-sized channel winning in this lane", emptyLabel: "mid-sized-channel", test: (s) => s >= 1000 && s < 10000 },
  { key: "established", label: "Established channel in this lane", emptyLabel: "established-channel", test: (s) => s >= 10000 },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Views-per-day, not lifetime viewCount — so "winning" means winning right
// now, not just having had more time to accumulate views.
function viewsPerDay(v: GalleryVideo): number {
  const days = Math.max((Date.now() - new Date(v.publishedAt).getTime()) / 86_400_000, 1);
  return v.viewCount / days;
}

function topInBracket(videos: GalleryVideo[], test: (subs: number) => boolean): GalleryVideo | null {
  const matches = videos.filter((v) => test(v.subscriberCount));
  if (!matches.length) return null;
  return [...matches].sort((a, b) => viewsPerDay(b) - viewsPerDay(a))[0];
}

export default function TopVideosThisLane({ videos }: { videos: GalleryVideo[] }) {
  if (!videos.length) return null;

  const smallestSubsFound = Math.min(...videos.map((v) => v.subscriberCount));

  return (
    <div className="mb-8">
      <p className="text-xs text-[#94a3b8] font-medium tracking-widest uppercase mb-3">
        What winning uploads look like at every size
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {BRACKETS.map((bracket) => {
          const video = topInBracket(videos, bracket.test);
          return (
            <div key={bracket.key}>
              {video ? (
                <a
                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    loading="lazy"
                    className="w-full h-[110px] object-cover bg-[#111] border border-[#1a1a1a] group-hover:border-[#3a3a3a] transition-colors"
                  />
                  <p className="text-[10px] font-semibold uppercase tracking-widest mt-2 mb-1" style={{ color: "#e8833a" }}>
                    {bracket.label}
                  </p>
                  <p className="text-xs text-white leading-snug line-clamp-2">{video.title}</p>
                  <p className="text-[10px] text-[#64748b] mt-1">
                    {video.channelTitle} · {formatCount(video.subscriberCount)} subs · {formatCount(video.viewCount)} views
                  </p>
                </a>
              ) : (
                <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-4 h-full min-h-[170px] flex flex-col">
                  <p className="text-[10px] text-[#475569] font-semibold uppercase tracking-widest mb-2">
                    {bracket.label}
                  </p>
                  <p className="text-xs text-[#64748b] leading-relaxed">
                    No {bracket.emptyLabel.replace("-", " ")} winners found this month — smallest winner had{" "}
                    {formatCount(smallestSubsFound)} subs.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
