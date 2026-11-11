"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { ApiError, api } from "@/lib/api-client";
import { useViewerMe } from "../../find-home/area";

/** "Contact Support": a billing question goes to the Super Admin inbox (contact inquiries). */
export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} labelledBy="sup-title" maxWidth="max-w-[520px]">{open && <Body onClose={onClose} />}</Modal>;
}

const field = "glass-input w-full rounded-lg px-3 text-sm text-navy outline-none placeholder:text-slate-400";

function Body({ onClose }: { onClose: () => void }) {
  const t = useTranslations("owner.subscription.support");
  const me = useViewerMe();
  const [name, setName] = useState(me.fullName);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(t("defaultSubject"));
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState("");
  const [done, setDone] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = t("errors.name");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t("errors.email");
    if (subject.trim().length < 3) next.subject = t("errors.subject");
    if (message.trim().length < 10) next.message = t("errors.message");
    setErrors(next); setForm("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api("/contact", { method: "POST", body: { name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim(), ...(me.phone && /^01[3-9]\d{8}$/.test(me.phone) ? { phone: me.phone } : {}) } });
      setDone(true);
    } catch (err) { setForm(err instanceof ApiError && err.status === 429 ? t("errors.rate") : t("errors.generic")); } finally { setBusy(false); }
  }

  if (done) return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center"><CheckCircle2 className="size-12 text-emerald-500" aria-hidden />
      <h2 id="sup-title" className="text-lg font-bold text-navy">{t("doneTitle")}</h2><p className="max-w-sm text-sm text-slate-600">{t("doneText")}</p>
      <button type="button" onClick={onClose} className="btn btn-primary h-11 px-8 text-sm">{t("close")}</button></div>
  );

  const row = (id: string, label: string, el: React.ReactNode, err?: string) => (
    <div><label htmlFor={id} className="mb-1.5 block text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</label>{el}{err && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err}</p>}</div>
  );
  return (
    <form onSubmit={send} noValidate className="space-y-3.5 pt-1">
      <header className="pr-10"><h2 id="sup-title" className="text-lg font-bold text-navy">{t("title")}</h2><p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p></header>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {row("sup-name", t("name"), <input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={`${field} h-11`} />, errors.name)}
        {row("sup-email", t("email"), <input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" className={`${field} h-11`} />, errors.email)}
      </div>
      {row("sup-subject", t("subject"), <input id="sup-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={`${field} h-11`} />, errors.subject)}
      {row("sup-message", t("message"), <textarea id="sup-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={3000} className={`${field} resize-none py-2.5`} placeholder={t("messagePlaceholder")} />, errors.message)}
      {form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{form}</p>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-11 px-5 text-sm">{t("cancel")}</button>
        <button type="submit" disabled={busy} className="btn btn-primary h-11 px-6 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{t("send")}</button>
      </div>
    </form>
  );
}
