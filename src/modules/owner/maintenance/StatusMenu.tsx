"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { PICK_OPTIONS, canPick } from "./logic";
import type { IssueStatus, PickStatus } from "./types";

export const STATUS_TONE: Record<IssueStatus, string> = {
  PENDING: "border-slate-200 bg-slate-100 text-slate-600",
  APPROVED: "border-sky-200 bg-sky-50 text-sky-700",
  IN_PROGRESS: "border-purple-200 bg-purple-50 text-purple-700",
  COMPLETED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-500",
};

interface Props { status: IssueStatus; busy: boolean; onPick: (s: PickStatus) => void }

/** The status pill. For live requests it opens a small menu (Pending / In Progress / Completed); arrow keys and Esc work. */
export function StatusMenu({ status, busy, onPick }: Props) {
  const t = useTranslations("owner.maintenance.status");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const pill = clsx("inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors", STATUS_TONE[status]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); (root.current?.querySelector("button") as HTMLElement | null)?.focus(); } };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!canPick(status)) return <span className={pill}>{t(status)}</span>;
  const shown: PickStatus = status === "APPROVED" ? "PENDING" : (status as PickStatus);

  return (
    <div ref={root} className="relative">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("change", { status: t(status) })} disabled={busy}
        onClick={() => { setOpen((v) => !v); setActive(PICK_OPTIONS.indexOf(shown)); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); setActive(PICK_OPTIONS.indexOf(shown)); } }}
        className={clsx(pill, "cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48BDFA] disabled:opacity-70")}
      >
        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}{t(status)}<ChevronDown className={clsx("size-3.5 transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul
          role="menu" aria-label={t("menu")} tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % PICK_OPTIONS.length); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + PICK_OPTIONS.length) % PICK_OPTIONS.length); }
            if (e.key === "Enter") { e.preventDefault(); const o = PICK_OPTIONS[active]!; setOpen(false); if (o !== shown) onPick(o); }
          }}
          ref={(el) => el?.focus()}
          className="absolute left-0 top-full z-30 mt-1.5 w-44 origin-top-left rounded-xl border border-white/70 bg-white/95 p-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] outline-none backdrop-blur-xl"
        >
          {PICK_OPTIONS.map((o, i) => (
            <li key={o} role="none">
              <button
                type="button" role="menuitemradio" aria-checked={o === shown} tabIndex={-1} onMouseEnter={() => setActive(i)}
                onClick={() => { setOpen(false); if (o !== shown) onPick(o); }}
                className={clsx("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-navy transition-colors", i === active && "bg-slate-100")}
              >
                <span className={clsx("inline-flex items-center gap-2")}><i aria-hidden className={clsx("size-2 rounded-full", o === "PENDING" ? "bg-slate-400" : o === "IN_PROGRESS" ? "bg-purple-500" : "bg-green-500")} />{t(o)}</span>
                {o === shown && <Check className="size-4 text-[#0A84F0]" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
