"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

/**
 * Page scroll lock shared by every open modal. One counter instead of "remember and restore": when one modal closes
 * while the next one opens (Edit → Are you sure?), the second must not remember the first one's lock as the normal state.
 */
let locks = 0;
let savedOverflow = "";
function lockScroll() {
  if (locks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
}
function unlockScroll() {
  if (--locks <= 0) { locks = 0; document.body.style.overflow = savedOverflow; }
}

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
  // Rendered straight into <body>: inside a glass card (backdrop-filter) a "fixed" box is positioned against the card, not the screen,
  // so a window opened from the bottom of a long table would sit far below what is visible.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && <Dialog onClose={onClose} labelledBy={labelledBy} busy={busy} maxWidth={maxWidth}>{children}</Dialog>}
    </AnimatePresence>,
    document.body,
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
    lockScroll();
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
    return () => { document.removeEventListener("keydown", onKey); unlockScroll(); opener?.focus?.(); };
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
