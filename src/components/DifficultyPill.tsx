import type { Difficulty } from "@/lib/types";

const STYLES: Record<Difficulty, { dot: string; text: string; bg: string; emoji: string; label: string }> = {
  Easy: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    emoji: "🟢",
    label: "Easy",
  },
  Medium: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/30",
    emoji: "🟡",
    label: "Medium",
  },
  Hard: {
    dot: "bg-rose-600",
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-500/10 border-rose-500/30",
    emoji: "🔴",
    label: "Hard",
  },
};

export function DifficultyPill({ difficulty }: { difficulty?: Difficulty }) {
  if (!difficulty || !STYLES[difficulty]) return null;
  const s = STYLES[difficulty];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text}`}
    >
      <span aria-hidden>{s.emoji}</span>
      {s.label}
    </span>
  );
}
