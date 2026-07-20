// Same construction as the diagnostic pages' status pill (dark bg matching hue,
// darker-hue border, bright-hue text) — reused here for green/yellow/red lane status.
export type LaneStatusColor = "green" | "yellow" | "red";

const STYLES: Record<LaneStatusColor, string> = {
  green: "text-[#4ade80] border-[#1a3a1a] bg-[#0a1a0a]",
  yellow: "text-[#fbbf24] border-[#3a2a0a] bg-[#1a140a]",
  red: "text-[#f87171] border-[#3a1a1a] bg-[#1a0a0a]",
};

const LABELS: Record<LaneStatusColor, string> = {
  green: "Strong opportunity",
  yellow: "Moderate opportunity",
  red: "Tough lane",
};

export default function StatusBadge({ status }: { status: LaneStatusColor }) {
  return (
    <span
      className={`text-[10px] font-semibold tracking-[0.15em] uppercase border px-2 py-0.5 ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
