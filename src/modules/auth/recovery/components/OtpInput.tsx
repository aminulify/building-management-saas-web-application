"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { OTP_LENGTH } from "../schema";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  boxLabel: (n: number) => string;
}

/** Six numeric boxes: single digit each, auto-advance, backspace goes back, arrow keys move, pasting 6 digits fills all. */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, label, boxLabel }: Props) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const latest = useRef(value); // fast typing/paste can fire several events before React re-renders
  latest.current = value;
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const commit = (next: string) => {
    latest.current = next;
    onChange(next);
    if (next.length === OTP_LENGTH) onComplete?.(next);
  };
  const focus = (i: number) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();

  const setAt = (i: number, ch: string) => {
    const arr = Array.from({ length: OTP_LENGTH }, (_, k) => latest.current[k] ?? "");
    arr[i] = ch;
    commit(arr.join("").slice(0, OTP_LENGTH));
  };

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2 sm:gap-3">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={boxLabel(i + 1)}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          data-invalid={invalid || undefined}
          className="glass-input size-11 rounded-lg text-center text-xl font-bold text-navy outline-none sm:size-14 sm:text-2xl"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const all = e.target.value.replace(/D/g, "");
            if (!all) return;
            if (all.length > 2) {
              // SMS autofill / IME / fast typing delivers several digits at once: spread them over the boxes
              const next = (latest.current.slice(0, i) + all).slice(0, OTP_LENGTH);
              commit(next);
              focus(Math.min(next.length, OTP_LENGTH - 1));
              return;
            }
            setAt(i, all.slice(-1));
            if (i < OTP_LENGTH - 1) focus(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (latest.current[i]) setAt(i, "");
              else if (i > 0) { setAt(i - 1, ""); focus(i - 1); }
            } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
            if (!pasted) return;
            e.preventDefault();
            commit(pasted);
            focus(Math.min(pasted.length, OTP_LENGTH - 1));
          }}
        />
      ))}
    </div>
  );
}
