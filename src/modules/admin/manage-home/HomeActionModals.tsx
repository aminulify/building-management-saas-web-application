"use client";

import { useState } from "react";
import { Archive, Check, Loader2, Pencil, Tag, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { HomeDetails } from "./HomeViewModal";
import { MODERATION_STATES, type ModerationState } from "./state";
import type { HomeRow } from "./types";

const DOT: Record<ModerationState, string> = { ACTIVE: "text-emerald-600", PENDING: "text-amber-500", REPORTED: "text-red-600", REJECTED: "text-slate-500" };

interface EditProps { row: HomeRow | null; onClose: () => void; onSave: (state: ModerationState, sold?: boolean) => Promise<void>; /** buy / sell listings: also edit For Sale / Sold */ withSale?: boolean }

/**
 * "Edit Moderation Status": every detail of "View Details" on top, the editable status choices (Active, Pending, Reported,
 * Rejected) in the button section at the bottom. Saving applies it at once.
 */
export function StateModal({ row, onClose, onSave, withSale }: EditProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!row} onClose={onClose} labelledBy="hs-title" busy={busy} maxWidth="max-w-[850px]">
      {row && <StateBody row={row} onClose={onClose} onSave={onSave} withSale={withSale} busy={busy} setBusy={setBusy} />}
    </Modal>
  );
}

function StateBody({ row, onClose, onSave, withSale, busy, setBusy }: EditProps & { row: HomeRow; busy: boolean; setBusy: (b: boolean) => void }) {
  const t = useTranslations("admin.manageHome.editModal");
  const [choice, setChoice] = useState<ModerationState>(row.state);
  const [sale, setSale] = useState<"FOR_SALE" | "SOLD">(row.sold ? "SOLD" : "FOR_SALE");
  // a sold listing is moderated only after it is put back For Sale; "Sold" needs an approved, live listing
  const moderationLocked = !!withSale && row.sold && sale === "SOLD";
  const canSell = !!withSale && choice === "ACTIVE" && (row.status === "PUBLISHED" || row.sold);
  const saleChanged = !!withSale && (sale === "SOLD") !== row.sold;
  async function save() {
    if (choice === row.state && !saleChanged) { onClose(); return; }
    setBusy(true);
    try { await onSave(choice, saleChanged ? sale === "SOLD" : undefined); } finally { setBusy(false); }
  }
  return (
    <HomeDetails
      row={row} headingId="hs-title" heading={t("title")}
      footer={(
        <div className="mt-6 border-t border-slate-200/80 pt-5">
          <fieldset disabled={busy || moderationLocked}>
            <legend className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-label"><Pencil className="size-3.5" aria-hidden />{t("legend")}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MODERATION_STATES.map((s) => (
                <label key={s} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0", choice === s ? "border-[#0A84F0] bg-sky-50/80" : "border-slate-200 bg-white/70")}>
                  <input type="radio" name="hs-state" value={s} checked={choice === s} onChange={() => { setChoice(s); if (s !== "ACTIVE") setSale("FOR_SALE"); }} className="mt-1 size-4 accent-[#0A84F0]" />
                  <span className="min-w-0"><span className="flex items-center gap-1.5 font-semibold text-navy"><span aria-hidden className={clsx("text-lg leading-none", DOT[s])}>●</span>{t(`choices.${s}`)}</span><span className="mt-0.5 block text-xs text-slate-500">{t(`hints.${s}`)}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {moderationLocked && <p className="mt-2 text-xs font-medium text-amber-700">{t("soldLocked")}</p>}
          {withSale && (
            <fieldset className="mt-4" disabled={busy}>
              <legend className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-label"><Tag className="size-3.5" aria-hidden />{t("saleLegend")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["FOR_SALE", "SOLD"] as const).map((v) => {
                  const off = v === "SOLD" && !canSell && !row.sold;
                  return (
                    <label key={v} className={clsx("flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300", off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0", sale === v ? "border-[#0A84F0] bg-sky-50/80" : "border-slate-200 bg-white/70")}>
                      <input type="radio" name="hs-sale" value={v} checked={sale === v} disabled={off} onChange={() => { setSale(v); if (v === "FOR_SALE" && row.sold) setChoice("ACTIVE"); }} className="mt-1 size-4 accent-[#0A84F0]" />
                      <span className="min-w-0"><span className="flex items-center gap-1.5 font-semibold text-navy"><span aria-hidden className={clsx("text-lg leading-none", v === "SOLD" ? "text-slate-500" : "text-emerald-600")}>●</span>{t(`saleChoices.${v}`)}</span><span className="mt-0.5 block text-xs text-slate-500">{t(`saleHints.${v}`)}</span></span>
                    </label>
                  );
                })}
              </div>
              {!canSell && !row.sold && <p className="mt-2 text-xs text-slate-500">{t("saleNeedsLive")}</p>}
            </fieldset>
          )}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button type="button" onClick={() => void save()} disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-40">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button>
          </div>
        </div>
      )}
    />
  );
}

interface DeleteProps { row: HomeRow | null; onClose: () => void; onConfirm: () => Promise<void> }

/** "Are you sure?": every detail of "View Details" on top; the button section has Cancel and Delete & Archive (the listing moves to Previous Properties). */
export function DeleteModal({ row, onClose, onConfirm }: DeleteProps) {
  const t = useTranslations("admin.manageHome.deleteModal");
  const [busy, setBusy] = useState(false);
  async function yes() { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }
  return (
    <Modal open={!!row} onClose={onClose} labelledBy="hd-title" busy={busy} maxWidth="max-w-[850px]">
      {row && (
        <HomeDetails
          row={row} headingId="hd-title" heading={t("title")}
          footer={(
            <div className="mt-6 border-t border-red-200/80 pt-5">
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 p-4">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><Trash2 className="size-5" /></span>
                <div><p className="font-semibold text-red-800">{t("text")}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-red-700"><Archive className="size-3.5 shrink-0" aria-hidden />{t("note")}</p></div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
                <button type="button" onClick={() => void yes()} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-52">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("working") : t("yes")}</button>
              </div>
            </div>
          )}
        />
      )}
    </Modal>
  );
}
