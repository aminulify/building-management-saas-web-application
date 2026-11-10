"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Counts from 0 to `value` (0.6 s) the first time it scrolls into view, then from the old number to the new one when the value changes. Shows the final value at once under reduced motion. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const last = useRef(0); // what is on screen now, so a change counts from there and never restarts at 0

  useEffect(() => {
    if (reduce) { last.current = value; setShown(value); return; }
    if (!inView) return;
    const controls = animate(last.current, value, { duration: 0.6, ease: "easeOut", onUpdate: (n) => { last.current = n; setShown(n); } });
    return () => controls.stop();
  }, [value, inView, reduce]);

  return <span ref={ref} className="tabular-nums">{format(shown)}</span>;
}
