"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";

/** "Message Tenant": opens the conversation (landlord ↔ tenant with an active rental) and sends the first line. */
export function QuickMessage({ tenantId, tenantName, hint, onDone }: { tenantId: string; tenantName: string; hint: string; onDone: () => void }) {
  const t = useTranslations("owner.notifications.message");
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const conv = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: tenantId } });
      await authApi(`/conversations/${conv.id}/messages`, { method: "POST", body: { clientId: crypto.randomUUID(), body } });
      toast("success", t("sent", { name: tenantName }));
      onDone();
    } catch (err) { toast("error", err instanceof ApiError && err.status === 429 ? t("rate") : err instanceof ApiError && err.status === 403 ? t("cannot") : t("error")); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={send} className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3">
      <label htmlFor="nc-msg" className="sr-only">{t("label", { name: tenantName })}</label>
      <textarea id="nc-msg" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} autoFocus placeholder={hint} className="glass-input w-full resize-none rounded-lg px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary h-10 flex-1 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{t("send")}</button>
        <button type="button" onClick={onDone} disabled={busy} className="btn btn-white h-10 px-4 text-sm">{t("cancel")}</button>
      </div>
    </form>
  );
}
