"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Hash, Loader2, Send, Wallet } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatTaka } from "../../owner/dashboard/format";
import { monthLabel } from "./Cards";
import { PAY_METHODS, payFormSchema, showPhone, type PayFormValues } from "./logic";
import type { TenantDashboard } from "./types";

type Next = NonNullable<TenantDashboard["nextPayment"]>;
interface Props { next: Next | null; ownerName: string; open: boolean; onClose: () => void; onSent: () => void }

/** "Send Paid Request": month and amount are filled in; the tenant sees where to send the money and enters the TrxID. */
export function PayModal({ next, ownerName, open, onClose, onSent }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="pay-title" busy={busy} maxWidth="max-w-[500px]">
      {open && next && <Form next={next} ownerName={ownerName} onClose={onClose} onSent={onSent} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ next, ownerName, onClose, onSent, setBusy }: { next: Next; ownerName: string; onClose: () => void; onSent: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.dashboard.payModal");
  const v = useTranslations("validation");
  const locale = useLocale();
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<PayFormValues>({ resolver: zodResolver(payFormSchema), mode: "onTouched", defaultValues: { method: "BKASH", reference: "" } });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  async function copy() {
    if (!next.payTo) return;
    try { await navigator.clipboard.writeText(next.payTo); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the number is on screen */ }
  }

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      await authApi(`/tenant/rent/${next.recordId}/pay`, { method: "POST", body: { method: f.method, reference: f.reference.trim() } });
      toast("success", t("done"));
      onSent(); onClose();
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "CONFLICT") setError("reference", { message: "trxUsed" });
      else if (e instanceof ApiError && e.code === "INVALID_STATE") setBanner(t(e.reason === "already_pending" ? "errors.alreadyPending" : "errors.alreadyPaid"));
      else if (e instanceof ApiError && e.code === "RATE_LIMITED") setBanner(t("errors.rate"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-xl font-bold text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]">৳</span>
        <div><h2 id="pay-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle", { name: ownerName })}</p></div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md">
        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("month")}</dt><dd className="font-bold text-navy">{monthLabel(locale, next.month)}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("amount")}</dt><dd className="font-extrabold text-[#7B2FF7]">{formatTaka(locale)(Number(next.amount))}</dd></div>
      </dl>

      <div className="mt-4 rounded-xl border border-pink-200 bg-pink-50/80 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-pink-700">{t("sendTo")}</p>
        {next.payTo ? (
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-xl font-extrabold tracking-wide text-navy">{showPhone(next.payTo)}</p>
            <button type="button" onClick={() => void copy()} className="btn btn-white h-9 gap-1.5 px-3 text-xs">{copied ? <Check className="size-3.5 text-green-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? t("copied") : t("copy")}</button>
          </div>
        ) : <p className="mt-1 text-sm text-red-700">{t("noNumber")}</p>}
        <p className="mt-1 text-xs text-slate-600">{t("sendHint", { name: ownerName })}</p>
      </div>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-4" aria-busy={saving || undefined}>
        <GlassField label={t("method")} htmlFor="pay-method" error={msg(errors.method?.message)}>
          <GlassSelect id="pay-method" icon={Wallet} disabled={saving} {...register("method")}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</GlassSelect>
        </GlassField>
        <GlassField label={t("trx")} htmlFor="pay-trx" error={msg(errors.reference?.message)} hint={t("trxHint")}>
          <GlassInput id="pay-trx" icon={Hash} autoComplete="off" autoCapitalize="characters" placeholder="9H7A5K2LM" invalid={!!errors.reference} disabled={saving} data-autofocus {...register("reference")} />
        </GlassField>
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving || !next.payTo} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-48">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{saving ? t("sending") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
