"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AlertTriangle, Flame, Loader2, LocateFixed, MapPin, MessageSquare, Navigation, Phone, Shield, User, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { useOwner } from "../shell/OwnerContext";
import { alertFormSchema, type AlertFormValues } from "./alert-schema";
import type { Service } from "./EmergencyStrip";
import type { District } from "./types";

const THEME = {
  POLICE: { icon: Shield, badge: "bg-red-100 text-red-600 border-red-300", strip: "bg-red-50 text-red-700 border-red-200", button: "linear-gradient(135deg,#ef4444 0%,#be123c 100%)", glow: "rgba(239,68,68,0.5)" },
  FIRE: { icon: Flame, badge: "bg-amber-100 text-amber-600 border-amber-300", strip: "bg-amber-50 text-amber-700 border-amber-200", button: "linear-gradient(135deg,#f59e0b 0%,#ea580c 100%)", glow: "rgba(245,158,11,0.5)" },
} as const;

type Gps = { lat: number; lng: number } | null;
type GpsState = "idle" | "loading" | "ok" | "denied" | "unsupported";

interface Props { service: Service | null; onClose: () => void; onSent: () => void }

export function EmergencyModal({ service, onClose, onSent }: Props) {
  return (
    <AnimatePresence>
      {service && <Dialog key={service} service={service} onClose={onClose} onSent={onSent} />}
    </AnimatePresence>
  );
}

function Dialog({ service, onClose, onSent }: { service: Service; onClose: () => void; onSent: () => void }) {
  const t = useTranslations("owner.emergency");
  const v = useTranslations("validation");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const { me } = useOwner();
  const theme = THEME[service];
  const Icon = theme.icon;
  const districts = useAuthQuery<District[]>("/geo/districts");

  const panel = useRef<HTMLDivElement>(null);
  const [gps, setGps] = useState<Gps>(null);
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const { register, handleSubmit, setValue, setFocus, formState: { errors } } = useForm<AlertFormValues>({
    resolver: zodResolver(alertFormSchema), mode: "onTouched",
    defaultValues: { message: "", contact: /^01[3-9]\d{8}$/.test(me.phone ?? "") ? (me.phone ?? "") : "", name: me.fullName, thana: "", location: "", district: "", hasGps: false },
  });
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  // focus the first field, trap Tab inside, Esc closes, page scroll locked, focus returns to the button that opened it
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => setFocus("message"), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) { onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; opener?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  function captureGps() {
    if (!("geolocation" in navigator)) { setGpsState("unsupported"); return; }
    setGpsState("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }); setValue("hasGps", true, { shouldValidate: true }); setGpsState("ok"); },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }
  function clearGps() { setGps(null); setGpsState("idle"); setValue("hasGps", false, { shouldValidate: true }); }

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    setSubmitting(true);
    try {
      const district = districts.data?.find((d) => d.id === f.district);
      const res = await authApi<{ deduped: boolean }>("/sos", {
        method: "POST",
        body: {
          type: service === "FIRE" ? "FIRE" : "SECURITY",
          service,
          description: f.message.trim(),
          contactPhone: f.contact.trim(),
          reporterName: f.name.trim(),
          thana: f.thana.trim(),
          ...(f.location.trim() ? { locationText: f.location.trim() } : {}),
          ...(district ? { district: district.nameEn } : {}),
          ...(gps ? gps : {}),
        },
      });
      toast("success", res.deduped ? t("duplicate") : t("sent"));
      onSent();
      onClose();
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiError && e.code === "RATE_LIMITED") setBanner(t("errors.limit"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else if (e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "ACCOUNT_SUSPENDED")) setBanner(t("errors.forbidden"));
      else if (e instanceof ApiError && e.code === "VALIDATION_ERROR") setBanner(t("errors.invalid"));
      else setBanner(t("errors.generic"));
    }
  });

  const titleId = `alert-dialog-${service}`;
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-start justify-center p-2 pt-3 sm:p-4 sm:pt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div aria-hidden className="fixed inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => !submitting && onClose()} />
      <motion.div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[600px] overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl [scrollbar-width:thin] sm:max-h-[calc(100dvh-2.5rem)] sm:p-5"
        initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduce ? 0 : 12 }} transition={{ duration: 0.35 }}
      >
        <button type="button" onClick={onClose} disabled={submitting} aria-label={t("close")} className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="size-5" aria-hidden /></button>

        <header className="text-center">
          <span aria-hidden className={clsx("mx-auto grid size-12 place-items-center rounded-full border-2", theme.badge)}><Icon className="size-6" /></span>
          <h2 id={titleId} className="mt-2 text-2xl font-bold text-navy">{t("modalTitle")}</h2>
        </header>

        <p className={clsx("mt-3 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold", theme.strip)}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden />{t("reportingTo", { service: t(service === "POLICE" ? "policeName" : "fireName") })}
        </p>

        <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-3" aria-busy={submitting || undefined}>
          <GlassField label={t("fields.message")} htmlFor="alert-message" error={msg(errors.message?.message)}>
            <div className="glass-input flex items-start gap-3 rounded-lg px-3 py-2.5" data-invalid={errors.message ? true : undefined}>
              <MessageSquare className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
              <textarea id="alert-message" rows={3} maxLength={500} placeholder={t("placeholders.message")} disabled={submitting} aria-invalid={!!errors.message || undefined}
                className="min-w-0 flex-1 resize-none bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-300" {...register("message")} />
            </div>
          </GlassField>

          <div className="grid gap-3 sm:grid-cols-2">
            <GlassField label={t("fields.contact")} htmlFor="alert-contact" error={msg(errors.contact?.message)}>
              <GlassInput id="alert-contact" icon={Phone} type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" invalid={!!errors.contact} disabled={submitting} {...register("contact")} />
            </GlassField>
            <GlassField label={t("fields.name")} htmlFor="alert-name" error={msg(errors.name?.message)}>
              <GlassInput id="alert-name" icon={User} autoComplete="name" placeholder={t("placeholders.name")} invalid={!!errors.name} disabled={submitting} {...register("name")} />
            </GlassField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
          <GlassField label={t("fields.thana")} htmlFor="alert-thana" error={msg(errors.thana?.message)}>
            <GlassInput id="alert-thana" icon={MapPin} placeholder={t("placeholders.thana")} invalid={!!errors.thana} disabled={submitting} {...register("thana")} />
          </GlassField>
          <GlassField label={t("fields.district")} htmlFor="alert-district" error={msg(errors.district?.message)}>
            <GlassSelect id="alert-district" icon={MapPin} invalid={!!errors.district} loading={districts.state === "loading"} disabled={submitting || districts.state !== "ready"} {...register("district")}>
              <option value="">{districts.state === "error" ? t("districtError") : t("placeholders.district")}</option>
              {districts.data?.map((d) => <option key={d.id} value={d.id}>{locale === "bn" ? d.nameBn : d.nameEn}</option>)}
            </GlassSelect>
            {districts.state === "error" && <button type="button" onClick={districts.reload} className="mt-1.5 text-xs font-semibold text-[#0A84F0] underline underline-offset-2">{t("retry")}</button>}
          </GlassField>
        </div>

          <GlassField label={t("fields.location")} htmlFor="alert-location" error={msg(errors.location?.message)} labelRight={
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
              {gps ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  <LocateFixed className="size-3.5" aria-hidden />{t("gpsOk", { lat: gps.lat, lng: gps.lng })}
                  <button type="button" onClick={clearGps} className="underline underline-offset-2">{t("gpsClear")}</button>
                </span>
              ) : (
                <button type="button" onClick={captureGps} disabled={gpsState === "loading" || submitting} className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60">
                  {gpsState === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LocateFixed className="size-3.5" aria-hidden />}{gpsState === "loading" ? t("gpsLoading") : t("gpsUse")}
                </button>
              )}
              {(gpsState === "denied" || gpsState === "unsupported") && <span role="alert" className="text-red-600">{gpsState === "denied" ? t("gpsDenied") : t("gpsUnsupported")}</span>}
            </div>
          }>
            <GlassInput id="alert-location" icon={Navigation} autoComplete="street-address" placeholder={t("placeholders.location")} invalid={!!errors.location} disabled={submitting} {...register("location")} />
            
          </GlassField>

          {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}

          <div className="sticky -bottom-4 -mx-4 flex flex-col-reverse gap-3 bg-white/95 px-4 pb-1 pt-2 sm:-bottom-5 sm:-mx-5 sm:flex-row sm:justify-between sm:px-5">
            <button type="button" onClick={onClose} disabled={submitting} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button
              type="submit" disabled={submitting} aria-busy={submitting || undefined}
              className="btn h-12 text-white hover:-translate-y-px sm:min-w-44" style={{ background: theme.button, boxShadow: `0 10px 26px -10px ${theme.glow}` }}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}{submitting ? t("sending") : t("send")}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
