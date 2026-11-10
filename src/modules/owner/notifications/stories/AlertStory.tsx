"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MapPin, Phone, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import type { AlertDetail } from "../types";
import { Person, StoryFrame } from "./Shell";
import { useDetail } from "./use-detail";

const STATUS_TONE: Record<AlertDetail["status"], string> = { NEED_ACTION: "bg-red-100 text-red-700", PROCESSING: "bg-pink-100 text-pink-700", SOLVED: "bg-green-100 text-green-700", FALSE_ALARM: "bg-slate-100 text-slate-600" };

/** Incident log of an emergency, and the "Accept & Close Issue ✓" button once it is solved (only for the person who raised it). */
export function AlertStory({ alertId, onAccepted }: { alertId: string; onAccepted: () => void }) {
  const t = useTranslations("owner.notifications.story");
  const types = useTranslations("owner.notifications.sosTypes");
  const locale = useLocale();
  const toast = useToast();
  const d = useDetail<AlertDetail>(`/sos/${alertId}`);
  const [busy, setBusy] = useState(false);
  const a = d.data;
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));

  async function accept() {
    if (!a) return;
    setBusy(true);
    try {
      const r = await authApi<{ accepted: boolean; acceptedAt: string }>(`/sos/${a.id}/accept`, { method: "POST" });
      d.setData({ ...a, acceptedAt: r.acceptedAt, canAccept: false, log: [...a.log, { action: "NOTE", toStatus: null, note: null, at: r.acceptedAt, byReporter: true }] });
      toast("success", t("accepted"));
      onAccepted();
    } catch { toast("error", t("acceptError")); } finally { setBusy(false); }
  }

  const step = (l: AlertDetail["log"][number]) => (l.toStatus === "NEED_ACTION" ? "" : l.action === "NOTE" ? t("log.accepted") : l.action === "FORWARD" ? t("log.forwarded") : l.action === "ACK" ? t("log.seen") : l.toStatus ? t(`log.to.${l.toStatus}`) : "");

  return (
    <StoryFrame state={d.state} retry={d.retry}>
      {a && (
        <div className="space-y-4">
          <header className="pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_TONE[a.status])}>{t(`alertStatus.${a.status}`)}</span>
              {a.priority === "CRITICAL" && <span className="rounded-md bg-red-100 px-2 py-0.5 text-[0.68rem] font-extrabold uppercase text-red-700">{t("severity", { level: t("critical") })}</span>}
            </div>
            <h2 id="nc-story-title" className="mt-1.5 flex items-center gap-2 text-xl font-bold text-navy"><ShieldCheck className="size-5 text-pink-500" aria-hidden />{types(a.type as never)}</h2>
            <p className="flex items-center gap-1.5 text-xs text-label"><MapPin className="size-3.5" aria-hidden />{[a.property, a.unit ? t("unitOnly", { unit: a.unit }) : null].filter(Boolean).join(" · ") || t("noPlace")}</p>
          </header>
          {a.description && <p className="rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">{a.description}</p>}
          {!a.isReporter && <Person name={a.reporter.name} sub={t("reportedBy")} />}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("incidentLog")}</p>
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
              <li className="relative"><span aria-hidden className="absolute -left-[1.62rem] top-1 size-2.5 rounded-full bg-red-500 ring-4 ring-white" /><p className="text-sm font-semibold text-navy">{t("log.raised")}</p><time dateTime={a.createdAt} className="text-xs text-label">{date(a.createdAt)}</time></li>
              {a.log.map((l, i) => step(l) && (
                <li key={i} className="relative"><span aria-hidden className={clsx("absolute -left-[1.62rem] top-1 size-2.5 rounded-full ring-4 ring-white", l.toStatus === "SOLVED" || l.action === "NOTE" ? "bg-green-500" : "bg-pink-500")} />
                  <p className="text-sm font-semibold text-navy">{step(l)}</p>{l.note && l.action !== "NOTE" && <p className="mt-0.5 rounded-lg bg-yellow-50 px-2.5 py-1.5 text-sm text-yellow-900">{l.note}</p>}<time dateTime={l.at} className="text-xs text-label">{date(l.at)}</time></li>
              ))}
            </ol>
          </div>
          {!a.isReporter && a.reporter.phone && <a href={`tel:${a.reporter.phone}`} className="btn btn-white h-11 w-full text-sm"><Phone className="size-4 text-green-600" aria-hidden />{t("call")}</a>}
          {a.canAccept && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50/80 p-3.5">
              <p className="mb-2.5 text-sm text-yellow-900">{t("acceptHint")}</p>
              <button type="button" onClick={accept} disabled={busy} className="btn btn-primary h-11 w-full text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}{t("accept")}</button>
            </div>
          )}
          {a.acceptedAt && <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-sm font-semibold text-green-700"><CheckCircle2 className="size-4" aria-hidden />{t("closed", { when: date(a.acceptedAt) })}</p>}
        </div>
      )}
    </StoryFrame>
  );
}
