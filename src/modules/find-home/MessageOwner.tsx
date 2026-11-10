"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useToast } from "@/components/feedback/Toast";

/** "Message Owner": the first message of a listing conversation (the chat module shows the replies). */
export function MessageOwner({ listingId, title, onSent }: { listingId: string; title: string; onSent: () => void }) {
  const t = useTranslations("owner.findHome.message");
  const toast = useToast();
  const [text, setText] = useState(t("starter", { title }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (body.length < 2) { setError(t("tooShort")); return; }
    setBusy(true); setError("");
    try { await authApi(`/listings/${listingId}/inquiries`, { method: "POST", body: { message: body } }); toast("success", t("sent")); onSent(); }
    catch (err) { setError(err instanceof ApiError && err.status === 429 ? t("rate") : t("error")); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={send} className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-4" noValidate>
      <label htmlFor="msg-body" className="text-sm font-bold text-navy">{t("label")}</label>
      <textarea id="msg-body" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} data-autofocus className="glass-input w-full resize-none rounded-lg px-3 py-2 text-sm text-navy outline-none" />
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary h-10 w-full text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{t("send")}</button>
    </form>
  );
}
