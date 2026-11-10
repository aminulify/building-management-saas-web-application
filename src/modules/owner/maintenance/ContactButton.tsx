"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Phone, PhoneOff, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import type { Issue } from "./types";

/** A phone in the hand: tapping Contact dials. A computer with a mouse: it opens a small card instead. */
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse) and (max-width: 820px)").matches;

export function ContactButton({ issue }: { issue: Issue }) {
  const t = useTranslations("owner.maintenance.contact");
  const toast = useToast();
  const { tenant } = issue;
  const [open, setOpen] = useState(false);
  const [write, setWrite] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = "btn h-9 gap-1.5 border border-emerald-200 bg-emerald-50 px-3.5 text-[0.82rem] text-emerald-700 hover:bg-emerald-100";

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const conv = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: tenant.id } });
      await authApi(`/conversations/${conv.id}/messages`, { method: "POST", body: { clientId: crypto.randomUUID(), body } });
      toast("success", t("sent", { name: tenant.fullName }));
      setText(""); setWrite(false); setOpen(false);
    } catch (err) { toast("error", err instanceof ApiError && err.status === 429 ? t("rate") : err instanceof ApiError && err.status === 403 ? t("cannot") : t("error")); } finally { setBusy(false); }
  }

  // phone: a plain link that dials
  if (tenant.phone && isPhone()) return <a href={`tel:${tenant.phone}`} className={btn}><Phone className="size-4" aria-hidden />{t("button")}</a>;

  const initials = tenant.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={btn}><Phone className="size-4" aria-hidden />{t("button")}</button>
      {open && (
        <div role="dialog" aria-label={t("cardLabel", { name: tenant.fullName })} className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_20px_50px_-14px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{initials}</span>
            <div className="min-w-0"><p className="truncate font-bold text-navy">{tenant.fullName}</p><p className="truncate text-xs text-label">@{tenant.username} · {t("unit", { unit: issue.unit.unitNumber })}</p></div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            {tenant.phone ? <><Phone className="size-4 shrink-0 text-emerald-600" aria-hidden /><a href={`tel:${tenant.phone}`} dir="ltr" className="font-bold text-navy hover:underline">{tenant.phone}</a></> : <><PhoneOff className="size-4 shrink-0 text-slate-400" aria-hidden /><span className="text-slate-500">{t("noPhone")}</span></>}
          </div>
          {write ? (
            <form onSubmit={send} className="mt-3 space-y-2">
              <label htmlFor={`msg-${issue.id}`} className="sr-only">{t("messageLabel")}</label>
              <textarea id={`msg-${issue.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} autoFocus placeholder={t("placeholder", { title: issue.title })} className="glass-input w-full resize-none rounded-lg px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary h-9 flex-1 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{t("send")}</button>
                <button type="button" onClick={() => setWrite(false)} disabled={busy} className="btn btn-white h-9 px-3 text-sm">{t("back")}</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setWrite(true)} className="btn btn-primary mt-3 h-10 w-full text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
          )}
        </div>
      )}
    </div>
  );
}
