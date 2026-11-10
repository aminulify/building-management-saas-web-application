"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Counts from 0 to `value` (0.6 s) the first time it scrolls into view. Shows the final value at once under reduced motion. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    if (!inView) return;
    const controls = animate(0, value, { duration: 0.6, ease: "easeOut", onUpdate: (n) => setShown(n) });
    return () => controls.stop();
  }, [value, inView, reduce]);

  return <span ref={ref} className="tabular-nums">{format(shown)}</span>;
}
