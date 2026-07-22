// Segmented hardware-meter score readout — the ONE signature visual motif for
// the Lane Check pivot (see LANE-CHECK-BRIEF.md "Visual refresh"). Amber accent
// reserved for this + primary CTAs + momentum arrows only; status stays green/
// yellow/red elsewhere.
const TICKS = 16;
const ACCENT = "#e8833a";
const UNFILLED = "#2a2a2a";

export default function ScoreMeter({
  score,
  size = "lg",
}: {
  score: number;
  size?: "lg" | "sm";
}) {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * TICKS);

  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <span
        className={`font-[family-name:var(--font-display)] font-bold leading-none ${
          size === "lg" ? "text-5xl sm:text-6xl" : "text-2xl"
        }`}
        style={{ color: ACCENT }}
      >
        {Math.round(score)}
        <span className="text-[#475569] text-lg sm:text-xl font-medium">/100</span>
      </span>
      {/* Tick geometry is identical regardless of size — only the numeral scales —
          so filled/unfilled contrast reads the same on every card. */}
      <div className="flex items-end gap-[2px] pb-1" aria-hidden="true">
        {Array.from({ length: TICKS }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-sm"
            style={{
              height: `${6 + i * 1.6}px`,
              backgroundColor: i < filled ? ACCENT : UNFILLED,
            }}
          />
        ))}
      </div>
    </div>
  );
}
