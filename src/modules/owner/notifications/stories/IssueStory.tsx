"use client";

import { useState } from "react";
import { Loader2, MessageSquare, Phone, Wrench } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import { PICK_OPTIONS } from "../../maintenance/logic";
import type { PickStatus } from "../../maintenance/types";
import type { IssueDetail } from "../types";
import { Person, Row, StoryFrame } from "./Shell";
import { useDetail } from "./use-detail";

const SEVERITY: Record<IssueDetail["priority"], string> = { CRITICAL: "bg-red-100 text-red-700", HIGH: "bg-orange-100 text-orange-700", MEDIUM: "bg-sky-100 text-sky-700", LOW: "bg-yellow-100 text-yellow-700" };

/** A repair request: what is wrong, how bad, photos, where, and the buttons to call the tenant or move the request forward. */
export function IssueStory({ requestId }: { requestId: string }) {
  const t = useTranslations("owner.notifications.story");
  const mt = useTranslations("owner.maintenance");
  const locale = useLocale();
  const toast = useToast();
  const d = useDetail<IssueDetail>(`/maintenance/${requestId}`);
  const [busy, setBusy] = useState<PickStatus | null>(null);
  const r = d.data;
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const live = r && ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"].includes(r.status);
  const shown: PickStatus | null = r ? (r.status === "APPROVED" ? "PENDING" : (r.status as PickStatus)) : null;

  async function move(to: PickStatus) {
    if (!r || to === shown) return;
    setBusy(to);
    try {
      await authApi(`/maintenance/${r.id}/status`, { method: "POST", body: { status: to } });
      d.setData({ ...r, status: to });
      toast("success", mt("toast.status", { status: mt(`status.${to}`) }));
    } catch { toast("error", mt("toast.error")); } finally { setBusy(null); }
  }

  return (
    <StoryFrame state={d.state} retry={d.retry}>
      {r && (
        <div className="space-y-4">
          <header className="pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("rounded-md px-2 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wide", SEVERITY[r.priority])}>{t("severity", { level: mt(`priority.${r.priority}`) })}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{mt(`status.${r.status}`)}</span>
            </div>
            <h2 id="nc-story-title" className="mt-1.5 flex items-center gap-2 text-xl font-bold text-navy"><Wrench className="size-5 text-sky-500" aria-hidden />{r.title}</h2>
            <p className="text-xs text-label">{date(r.createdAt)}</p>
          </header>
          <p className="rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">{r.description}</p>
          {r.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2" aria-label={t("photos")}>
              {r.images.map((i) => i.url
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                ? <a key={i.id} href={i.url} target="_blank" rel="noopener noreferrer" className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100"><img src={i.url} alt={t("photoAlt")} loading="lazy" className="size-full object-cover" /></a> : null)}
            </div>
          )}
          <Person name={r.tenant.fullName} sub={`@${r.tenant.username} · ${t("unitIn", { unit: r.unit.unitNumber, property: r.unit.property.name })}`} />
          <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50/80 px-4">
            <Row label={t("property")}>{r.unit.property.name}</Row>
            <Row label={t("unit")}>{r.unit.unitNumber}</Row>
            <Row label={t("phone")}>{r.tenant.phone ? <a href={`tel:${r.tenant.phone}`} dir="ltr" className="hover:underline">{r.tenant.phone}</a> : t("noPhone")}</Row>
          </dl>
          {r.comments.length > 0 && (
            <div><p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-label"><MessageSquare className="size-3.5" aria-hidden />{t("comments")}</p>
              <ul className="space-y-1.5">{r.comments.slice(-3).map((c) => <li key={c.id} className="rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">{c.body}</li>)}</ul></div>
          )}
          {live && shown && (
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-label">{t("updateStatus")}</p>
              <div role="group" aria-label={t("updateStatus")} className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
                {PICK_OPTIONS.map((o) => (
                  <button key={o} type="button" aria-pressed={o === shown} disabled={busy !== null} onClick={() => void move(o)} className={clsx("inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all duration-300", o === shown ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:bg-white/70")}>
                    {busy === o && <Loader2 className="size-3.5 animate-spin" aria-hidden />}{mt(`status.${o}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {r.tenant.phone ? <a href={`tel:${r.tenant.phone}`} className="btn btn-primary h-11 w-full text-sm"><Phone className="size-4" aria-hidden />{t("call")}</a> : <p className="text-center text-sm text-slate-500">{t("noPhone")}</p>}
        </div>
      )}
    </StoryFrame>
  );
}
