// Calendar-month bounds + labeling — shared by lib/reports/channelAnalyzer.ts
// (report builder's upload-playlist month scan) and lib/lanes/pipeline.ts's
// analyzeLaneForMonth (the /admin/scores batch scorer's month-scoped live
// analysis). Previously defined only inside channelAnalyzer.ts; extracted
// here so the scores pipeline doesn't duplicate it. No "@/..." aliases (see
// lib/lanes/types.ts) so this loads from both Next.js and plain `node
// scripts/*.ts`.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** [start, end] instants (UTC) spanning every millisecond of the given
 * calendar month — end is day 0 of next month, i.e. the last day of this
 * one, at 23:59:59.999. */
export function monthBounds(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}
