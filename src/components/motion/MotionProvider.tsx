"use client";

import { MotionConfig } from "framer-motion";

/** One switch for the whole app: with `prefers-reduced-motion` Framer Motion skips transform/layout animation. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
