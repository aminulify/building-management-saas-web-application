"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  /** id of the element that names the dialog (screen readers) */
  labelledBy: string;
  /** block closing (Esc / backdrop / ✕) while a request is running */
  busy?: boolean;
  maxWidth?: string;
  children: React.ReactNode;
}

/**
 * Accessible modal: dark blurred backdrop, near-top placement, inner scrolling on short screens,
 * focus moves in and is trapped, Esc closes, page scroll is locked, focus returns to the opener.
 */
export function Modal({ open, onClose, labelledBy, busy = false, maxWidth = "max-w-[560px]", children }: Props) {
  return (
    <AnimatePresence>
      {open && <Dialog onClose={onClose} labelledBy={labelledBy} busy={busy} maxWidth={maxWidth}>{children}</Dialog>}
    </AnimatePresence>
  );
}

function Dialog({ onClose, labelledBy, busy, maxWidth, children }: Omit<Props, "open">) {
  const t = useTranslations("common");
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute("disabled"));
    setTimeout(() => (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[1] ?? focusable()[0])?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) { onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusable();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; opener?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-start justify-center p-2 pt-3 sm:p-4 sm:pt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div aria-hidden className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <motion.div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className={clsx("relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl [scrollbar-width:thin] sm:max-h-[calc(100dvh-3rem)] sm:p-6", maxWidth)}
        initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : 12 }} transition={{ duration: 0.35 }}
      >
        <button type="button" onClick={onClose} disabled={busy} aria-label={t("close")} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="size-5" aria-hidden /></button>
        {children}
      </motion.div>
    </motion.div>
  );
}
