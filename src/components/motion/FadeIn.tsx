"use client";

import { motion, useReducedMotion } from "framer-motion";

interface Props {
  children: React.ReactNode;
  delay?: number;
  /** pixels to rise from; 0 = opacity only */
  y?: number;
  className?: string;
  as?: "div" | "section" | "header" | "p" | "h1" | "h2";
}

/** Fade + gentle rise (0.4 s). Opacity-only under reduced motion. */
export function FadeIn({ children, delay = 0, y = 16, className, as = "div" }: Props) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}
