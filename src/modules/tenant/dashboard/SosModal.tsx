"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, MapPin, Phone, Siren, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { SOS_STEPS, sosAddress, sosFormSchema, sosStep, type SosFormValues } from "./logic";
import type { MyAlert, TenantDashboard } from "./types";

export type SosService = "POLICE" | "FIRE";
type Tenancy = NonNullable<TenantDashboard["tenancy"]>;
interface Props { service: SosService | null; tenancy: Tenancy | null; name: string; phone: string | null; onClose: () => void; onSent: () => void }

/** Police or Fire emergency form. Name, phone, service and address are filled in; the tenant adds a GPS pin and a few words. */
export function SosModal({ service, tenancy, name, phone, onClose, onSent }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={service !== null} onClose={onClose} labelledBy="sos-title" busy={busy} maxWidth="max-w-[540px]">
      {service && tenancy && <Form service={service} tenancy={tenancy} name={name} phone={phone} onClose={onClose} onSent={onSent} setBusy={setBusy} />}
    </Modal>
  );
}

/** Received by AmaderGhor → Seen by the government team → Forwarded → Solved; never says "police received it" before a forward exists. */
function Tracker({ alertId }: { alertId: string }) {
  const t = useTranslations("tenant.dashboard.sos");
  const [alert, setAlert] = useState<MyAlert | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => authApi<MyAlert[]>("/sos/mine").then((l) => { if (live) setAlert(l.find((a) => a.id === alertId) ?? null); }).catch(() => undefined);
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000);
    return () => { live = false; clearInterval(timer); };
  }, [alertId]);
  const step = alert ? sosStep(alert.stage) : 0;
  return (
    <ol className="space-y-3" role="status" aria-live="polite">
      {SOS_STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-3">
          <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-500", i <= step ? "bg-red-500 text-white" : "bg-slate-200 text-slate-500")}>{i <= step ? <Check className="size-4" aria-hidden /> : i + 1}</span>
          <span className={clsx("text-sm font-semibold", i <= step ? "text-navy" : "text-slate-400")}>{t(`stages.${s}`)}{s === "FORWARDED" && i <= step && alert?.forwardRef ? ` · ${alert.forwardRef}` : ""}</span>
        </li>
      ))}
    </ol>
  );
}

function Form({ service, tenancy, name, phone, onClose, onSent, setBusy }: { service: SosService; tenancy: Tenancy; name: string; phone: string | null; onClose: () => void; onSent: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.dashboard.sos");
  const v = useTranslations("validation");
  const toast = useToast();
  const address = sosAddress(tenancy.property.name, tenancy.unit.unitNumber, tenancy.property.addressLine);
  const { register, handleSubmit, formState: { errors } } = useForm<SosFormValues>({ resolver: zodResolver(sosFormSchema), mode: "onTouched", defaultValues: { contactPhone: phone ?? "", description: "" } });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  function locate() {
    if (!navigator.geolocation) { setGpsState("unsupported"); return; }
    setGpsState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }); setGpsState("idle"); },
      () => setGpsState("denied"), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      const r = await authApi<{ alert: { id: string }; deduped: boolean }>("/sos", {
        method: "POST",
        body: { type: service === "FIRE" ? "FIRE" : "SECURITY", service, contactPhone: f.contactPhone.trim(), reporterName: name, locationText: address, description: f.description.trim() || undefined, ...(gps ?? {}) },
      });
      toast("success", t(r.deduped ? "already" : "done"));
      setSent(r.alert.id); setSaving(false); onSent();
    } catch (e) {
      setSaving(false);
      setBanner(t(e instanceof ApiError && e.code === "RATE_LIMITED" ? "errors.rate" : e instanceof ApiError && e.code === "NETWORK" ? "errors.network" : "errors.generic"));
    }
  });

  const fire = service === "FIRE";
  if (sent) {
    return (
      <div>
        <h2 id="sos-title" className="pr-10 text-xl font-bold text-navy sm:text-2xl">{t("sentTitle")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("sentText")}</p>
        <div className="mt-5 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md"><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-label">{t("track")}</p><Tracker alertId={sent} /></div>
        <p className="mt-3 text-xs text-label">{t("call999")}</p>
        <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="btn btn-primary h-12 min-w-32">{t("close")}</button></div>
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl text-white", fire ? "bg-yellow-500" : "bg-red-500")}><Siren className="size-5" /></span>
        <div><h2 id="sos-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("name")} htmlFor="sos-name"><GlassInput id="sos-name" icon={User} value={name} readOnly /></GlassField>
          <GlassField label={t("phone")} htmlFor="sos-phone" error={msg(errors.contactPhone?.message)}><GlassInput id="sos-phone" icon={Phone} inputMode="tel" invalid={!!errors.contactPhone} disabled={saving} {...register("contactPhone")} /></GlassField>
        </div>
        <div className={clsx("rounded-xl border px-4 py-3 text-sm font-bold", fire ? "border-yellow-300 bg-yellow-50 text-yellow-900" : "border-red-300 bg-red-50 text-red-800")}>{t("service")}: {t(fire ? "fireService" : "policeService")}</div>
        <GlassField label={t("address")} htmlFor="sos-address"><GlassInput id="sos-address" icon={MapPin} value={address} readOnly /></GlassField>
        <div>
          <button type="button" onClick={locate} disabled={saving || gpsState === "locating"} className="btn btn-white h-11 gap-2 text-sm">
            {gpsState === "locating" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : gps ? <Check className="size-4 text-green-600" aria-hidden /> : <MapPin className="size-4" aria-hidden />}{gps ? t("gpsAttached") : t("gps")}
          </button>
          {gps && <p className="mt-1.5 text-xs font-medium text-green-700">{gps.lat}, {gps.lng}</p>}
          {gpsState === "denied" && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("gpsDenied")}</p>}
          {gpsState === "unsupported" && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("gpsUnsupported")}</p>}
        </div>
        <GlassField label={t("description")} htmlFor="sos-desc" error={msg(errors.description?.message)}>
          <textarea id="sos-desc" rows={3} maxLength={500} disabled={saving} placeholder={t("descriptionPlaceholder")} className="glass-input block w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-300" {...register("description")} />
        </GlassField>
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-danger h-12 sm:min-w-52">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Siren className="size-4" aria-hidden />}{saving ? t("sending") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
