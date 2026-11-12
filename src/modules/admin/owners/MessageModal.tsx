"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import { Avatar } from "./OwnersTable";
/** Anyone the Super Admin can message: the chat is opened with their id. */
export interface Recipient { id: string; fullName: string; avatarUrl: string | null }

/** Direct message: opens (or finds) the chat with the owner and sends the first words. The owner sees it in their Messages. */
export function MessageModal({ owner, onClose }: { owner: Recipient | null; onClose: () => void }) {
  const t = useTranslations("admin.owners.message");
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (owner) { setBody(""); setError(false); } }, [owner]);

  async function send() {
    if (!owner) return;
    const text = body.trim();
    if (!text) { setError(true); return; }
    setBusy(true);
    try {
      const conv = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: owner.id } });
      await authApi(`/conversations/${conv.id}/messages`, { method: "POST", body: { clientId: crypto.randomUUID(), body: text } });
      toast("success", t("sent", { name: owner.fullName }));
      onClose();
    } catch { toast("error", t("failed")); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!owner} onClose={() => !busy && onClose()} labelledBy="ow-message" busy={busy} maxWidth="max-w-[480px]">
      {owner && (
        <div>
          <div className="flex items-center gap-3 pr-8"><Avatar name={owner.fullName} url={owner.avatarUrl} size="size-12" /><div className="min-w-0"><h2 id="ow-message" className="truncate text-lg font-bold text-navy">{t("title", { name: owner.fullName })}</h2><p className="text-xs text-slate-500">{t("subtitle")}</p></div></div>
          <label htmlFor="ow-msg-body" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{t("label")}</label>
          <textarea id="ow-msg-body" rows={4} maxLength={2000} value={body} onChange={(e) => { setBody(e.target.value); setError(false); }} placeholder={t("placeholder")} className="glass-input mt-2 w-full resize-none rounded-lg p-3 text-sm text-navy outline-none" data-invalid={error || undefined} aria-invalid={error || undefined} />
          {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("required")}</p>}
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
            <button type="button" onClick={() => void send()} disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-36">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{busy ? t("sending") : t("send")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
