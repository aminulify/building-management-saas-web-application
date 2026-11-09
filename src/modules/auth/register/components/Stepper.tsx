"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

/** Step colours from the design: cyan, purple, pink, gold. */
const COLORS = [
  { text: "text-step-1", border: "border-step-1", bg: "bg-sky-50", ring: "shadow-[0_0_0_4px_rgba(0,174,239,0.15)]" },
  { text: "text-step-2", border: "border-step-2", bg: "bg-violet-50", ring: "shadow-[0_0_0_4px_rgba(123,47,247,0.15)]" },
  { text: "text-step-3", border: "border-step-3", bg: "bg-pink-50", ring: "shadow-[0_0_0_4px_rgba(236,0,140,0.15)]" },
  { text: "text-step-4", border: "border-step-4", bg: "bg-amber-50", ring: "shadow-[0_0_0_4px_rgba(245,179,1,0.2)]" },
] as const;

interface Props {
  current: 1 | 2 | 3 | 4;
  onJump: (step: 1 | 2 | 3 | 4) => void;
}

export function Stepper({ current, onJump }: Props) {
  const t = useTranslations("auth.register");
  const names = [t("steps.personal"), t("steps.address"), t("steps.security"), t("steps.documents")];

  return (
    <nav aria-label={t("stepperLabel")} className="mx-auto w-full max-w-2xl">
      <ol className="flex items-center">
        {COLORS.map((c, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const done = n < current;
          const active = n === current;
          return (
            <li key={n} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => done && onJump(n)}
                disabled={!done}
                aria-current={active ? "step" : undefined}
                aria-label={`${t("stepOf", { n, total: 4 })}: ${names[i]}${done ? ` (${t("completed")})` : ""}`}
                className={clsx(
                  "relative grid size-10 shrink-0 place-items-center rounded-xl border text-base font-bold transition-all duration-300 sm:size-[52px] sm:text-lg",
                  done && clsx("bg-white", c.border, c.text, "cursor-pointer hover:-translate-y-0.5"),
                  active && clsx(c.bg, c.border, c.text, c.ring),
                  !done && !active && "cursor-default border-slate-300 bg-slate-100 text-label",
                )}
              >
                {done ? (
                  <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35 }} className="grid place-items-center">
                    <Check className="size-5 sm:size-6" strokeWidth={2.5} aria-hidden />
                  </motion.span>
                ) : (
                  n
                )}
              </button>
              {n < 4 && (
                <span aria-hidden className="relative mx-1 h-px flex-1 bg-slate-300 sm:mx-2">
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-brand-gradient"
                    initial={false}
                    animate={{ width: done ? "100%" : "0%" }}
                    transition={{ duration: 0.45 }}
                    style={{ height: 2, top: -0.5 }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-label sm:hidden" aria-live="polite">
        {t("stepOf", { n: current, total: 4 })} · {names[current - 1]}
      </p>
    </nav>
  );
}
