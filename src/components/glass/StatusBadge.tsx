import { clsx } from "clsx";

type Tone = "success" | "warning" | "danger" | "vip";

/** Status & tint badges from docs/design-system.md §3. */
const TONES: Record<Tone, string> = {
  success: "bg-[rgba(220,252,231,0.8)] text-[#15803D] border-[#86EFAC]",
  warning: "bg-[rgba(254,243,199,0.8)] text-[#B45309] border-[#FDE68A]",
  danger: "bg-[rgba(254,226,226,0.8)] text-[#B91C1C] border-[#FCA5A5]",
  vip: "bg-[rgba(243,232,255,0.8)] text-[#6B21A8] border-[#D8B4FE]",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}
