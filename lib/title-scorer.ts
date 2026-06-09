export interface TitleScoreBreakdown {
  keyword_strength: number;
  title_length: number;
  artist_pairing: number;
  beat_name: number;
  year_present: number;
}

export interface TitleScoreResult {
  score: number;
  breakdown: TitleScoreBreakdown;
  tip: string | null;
}

export function scoreTitle(
  title: string,
  nicheKeywords: string[],
  artists: string[]
): TitleScoreResult {
  const t = title.toLowerCase();

  const matchedKw = nicheKeywords.filter(k => k && t.includes(k.toLowerCase()));
  const keyword_strength = matchedKw.length >= 2 ? 25 : matchedKw.length === 1 ? 15 : 0;

  const wc = title.trim().split(/\s+/).filter(Boolean).length;
  const title_length = wc >= 9 && wc <= 12 ? 25 : wc >= 7 && wc <= 14 ? 15 : wc >= 5 ? 8 : 0;

  const artist_pairing = artists.some(a => a?.trim() && t.includes(a.trim().toLowerCase())) ? 20 : 0;

  const beat_name = /[“”][^“”]+[“”]|"[^"]+"|'[^']+'/.test(title) ? 20 : 0;

  const year_present = /\b20\d{2}\b/.test(title) ? 10 : 0;

  const score = Math.min(100, keyword_strength + title_length + artist_pairing + beat_name + year_present);

  let tip: string | null = null;
  if (score < 60) {
    if (beat_name === 0) tip = 'Add your beat name in quotes (e.g. "Phantom") to boost this score';
    else if (artist_pairing === 0) tip = "Add an artist reference (e.g. 'Travis Scott Type Beat')";
    else if (keyword_strength === 0) tip = "Include a niche keyword from your heat map";
  }

  return {
    score,
    breakdown: { keyword_strength, title_length, artist_pairing, beat_name, year_present },
    tip,
  };
}
