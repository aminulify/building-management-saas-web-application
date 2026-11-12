"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";

interface Props { /** which texts to use: the owner wording (default) or the Super Admin wording */ scope?: "owner" | "admin"; open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void>; onDone: () => void }

/** "Are you sure you want to logout?": Cancel closes it; Yes ends the session, shows a toast and goes to the public homepage. */
export function LogoutModal({ scope = "owner", open, busy, onCancel, onConfirm, onDone }: Props) {
  const t = useTranslations(scope === "admin" ? "admin.logout" : "owner.logout");
  const toast = useToast();
  const [done, setDone] = useState(false);

  async function yes() {
    await onConfirm();
    setDone(true);
    toast("success", t("done"));
    setTimeout(onDone, 900); // long enough to read the toast before the page changes
  }

  return (
    <Modal open={open} onClose={onCancel} labelledBy="logout-title" busy={busy || done} maxWidth="max-w-[420px]">
      <div className="text-center">
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><LogOut className="size-6" /></span>
        <h2 id="logout-title" className="mt-3 text-2xl font-bold text-navy">{t("title")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("text")}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button type="button" data-autofocus onClick={onCancel} disabled={busy || done} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="button" onClick={() => void yes()} disabled={busy || done} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-40">
            {busy || done ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}{busy || done ? t("loggingOut") : t("confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
