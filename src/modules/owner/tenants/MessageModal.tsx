"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { Avatar } from "../units/TenantPicker";
import type { DirectoryRow } from "./types";

interface Props { row: DirectoryRow | null; onClose: () => void }

/** Quick message to a tenant: opens (or reuses) the direct conversation and posts the message. */
export function MessageModal({ row, onClose }: Props) {
  const t = useTranslations("owner.tenants.message");
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!row?.tenant) return;
    const body = text.trim();
    if (!body) { setError(t("empty")); return; }
    setBusy(true);
    setError(null);
    try {
      const conv = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: row.tenant.id } });
      await authApi(`/conversations/${conv.id}/messages`, { method: "POST", body: { clientId: crypto.randomUUID(), body } });
      toast("success", t("sent", { name: row.tenant.fullName }));
      setText("");
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "FORBIDDEN") setError(t("errors.forbidden"));
      else if (e instanceof ApiError && e.code === "RATE_LIMITED") setError(t("errors.rateLimited"));
      else if (e instanceof ApiError && e.code === "NETWORK") setError(t("errors.network"));
      else setError(t("errors.generic"));
    }
  }

  return (
    <Modal open={row !== null} onClose={() => { setError(null); onClose(); }} labelledBy="message-tenant-title" busy={busy} maxWidth="max-w-[500px]">
      {row?.tenant && (
        <div>
          <header className="flex items-center gap-3 pr-10">
            <Avatar name={row.tenant.fullName} url={row.tenant.avatarUrl} size="size-12" />
            <div><h2 id="message-tenant-title" className="text-xl font-bold text-navy">{t("title")}</h2><p className="text-sm text-slate-600">{row.tenant.fullName} · {row.property.name}, {row.unit.unitNumber}</p></div>
          </header>
          <label htmlFor="msg-body" className="mt-5 mb-2 block text-xs font-bold uppercase tracking-wider text-label">{t("label")}</label>
          <div className="glass-input rounded-lg px-3 py-2.5">
            <textarea id="msg-body" data-autofocus rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder={t("placeholder")}
              className="w-full resize-none bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-300" />
          </div>
          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-11 sm:min-w-28">{t("cancel")}</button>
            <button type="button" onClick={send} disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-11 sm:min-w-36">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{busy ? t("sending") : t("send")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
