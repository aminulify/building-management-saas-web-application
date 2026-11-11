"use client";

import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { CountUp } from "@/components/motion/CountUp";

export type Tone = "green" | "sky" | "purple" | "gray" | "red" | "orange" | "amber";

/** Border colours of the design: green #16A34A, sky #0EA5E9, purple #9333EA, gray with a red dot. */
export const TONE: Record<Tone, { card: string; num: string; chip: string }> = {
  green: { card: "border-[#16A34A] bg-green-100/50", num: "text-[#16A34A]", chip: "border-green-300 bg-green-200/70 text-[#16A34A]" },
  sky: { card: "border-[#0EA5E9] bg-sky-100/50", num: "text-[#0EA5E9]", chip: "border-sky-300 bg-sky-200/70 text-[#0EA5E9]" },
  purple: { card: "border-[#9333EA] bg-purple-100/50", num: "text-[#9333EA]", chip: "border-purple-300 bg-purple-200/70 text-[#9333EA]" },
  red: { card: "border-[#EF4444] bg-red-100/50", num: "text-[#EF4444]", chip: "border-red-300 bg-red-200/70 text-[#EF4444]" },
  orange: { card: "border-[#F97316] bg-orange-100/50", num: "text-[#F97316]", chip: "border-orange-300 bg-orange-200/70 text-[#F97316]" },
  amber: { card: "border-[#F59E0B] bg-amber-100/50", num: "text-[#F59E0B]", chip: "border-amber-300 bg-amber-200/70 text-[#D97706]" },
  gray: { card: "border-slate-300 bg-slate-100/60", num: "text-navy", chip: "border-red-200 bg-red-100/80 text-red-600" },
};

export interface CardProps { tone: Tone; icon: LucideIcon; label: string; value: number; format: (n: number) => string; sub: string; index: number; dot?: boolean }

export function KpiCard({ tone, icon: Icon, label, value, format, sub, index, dot }: CardProps) {
  const reduce = useReducedMotion();
  const c = TONE[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.06 }}
      className={clsx("group rounded-2xl border-2 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5", c.card)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-slate-600">{label}</p>
          <p className={clsx("mt-2 text-3xl font-bold leading-none sm:text-[2rem]", c.num)}><CountUp value={value} format={format} /></p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            {dot && <span aria-hidden className="relative flex size-2"><span className="absolute inline-flex size-full rounded-full bg-red-400 opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>}
            {sub}
          </p>
        </div>
        <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105", c.chip)}><Icon className="size-5" /></span>
      </div>
    </motion.div>
  );
}
