"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

/** Light-blue glass circle with a blue icon; pops in softly (0.45 s, no scale under reduced-motion). */
export function Badge({ icon: Icon, size = "lg" }: { icon: LucideIcon; size?: "lg" | "sm" }) {
  const reduce = useReducedMotion();
  const box = size === "lg" ? "size-20" : "size-14";
  return (
    <motion.div
      aria-hidden
      className={`${box} grid shrink-0 place-items-center rounded-full border border-white/70 bg-sky-200/70 text-[#0A84F0] shadow-[0_8px_30px_-8px_rgba(72,189,250,0.6)] backdrop-blur-md`}
      initial={{ opacity: 0, scale: reduce ? 1 : 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Icon className={size === "lg" ? "size-9" : "size-7"} strokeWidth={1.8} />
    </motion.div>
  );
}
