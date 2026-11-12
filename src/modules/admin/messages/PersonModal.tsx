"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, History, Loader2, Mail, MapPin, Phone, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { PersonAvatar } from "@/modules/messaging/ui/PersonAvatar";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";

type State = "ACTIVE" | "WARNING" | "SUSPENDED";
interface Profile {
  id: string; role: "OWNER" | "TENANT" | "GENERAL_USER" | "GOV_ADMIN"; fullName: string; username: string; ownerCode: string | null; tenantCode: string | null;
  email: string | null; phone: string | null; occupation: string | null; gender: string | null; dateOfBirth: string | null; nid: string | null; address: string;
  state: State; verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; createdAt: string; lastSeenAt: string | null; avatarUrl: string | null;
  log: { id: string; action: "ACTIVE" | "WARNING" | "SUSPENDED" | "ARCHIVED"; comment: string | null; adminUsername: string; createdAt: string }[];
  owner: { properties: number; units: number; listings: number; plan: { nameEn: string; nameBn: string; endsAt: string | null } | null } | null;
  tenancy: { unit: string; property: string; owner: string; rent: string; startDate: string; endDate: string | null } | null;
}

const STATE_STYLE: Record<State, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700" };
const VERIFY_STYLE = { VERIFIED: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", REJECTED: "bg-red-100 text-red-700", UNVERIFIED: "bg-slate-200 text-slate-600" } as const;
const LOG_STYLE = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700", ARCHIVED: "bg-slate-200 text-slate-600" } as const;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

interface Props { person: { id: string; fullName: string; avatarUrl: string | null } | null; onClose: () => void }

/** Super Admin → Message → the person's profile: every detail, plus Active / Warning / Suspended with a written reason. */
export function PersonModal({ person, onClose }: Props) {
  const t = useTranslations("admin.personProfile");
  const locale = useLocale();
  const toast = useToast();
  const [d, setD] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<State>("ACTIVE");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!person) { setD(null); return; }
    let live = true;
    setState("loading"); setProblem(null);
    authApi<Profile>(`/admin/people/${person.id}`).then((r) => { if (live) { setD(r); setStatus(r.state); setComment(""); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [person, tick]);

  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const none = t("none");
  const needsReason = status !== "ACTIVE";
  const unchanged = !!d && status === d.state && !comment.trim();

  async function save() {
    if (!d) return;
    if (needsReason && comment.trim().length < 3) { setProblem(t("status.needReason")); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/people/${d.id}/status`, { method: "PATCH", body: { status, ...(comment.trim() ? { comment: comment.trim() } : {}) } });
      toast("success", t(out.changed ? `toast.${status}` : "toast.same", { name: d.fullName }));
      setTick((n) => n + 1);
    } catch (e) { setProblem(e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed")); } finally { setBusy(false); }
  }

  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  return (
    <Modal open={!!person} onClose={() => !busy && onClose()} labelledBy="pm-title" busy={busy} maxWidth="max-w-[760px]">
      {person && (
        <div>
          <h2 id="pm-title" className="pr-10 text-xl font-bold text-navy">{t("title")}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
          )}
          {state === "ready" && d && (
            <div className="mt-4 space-y-4">
              <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
                <PersonAvatar name={d.fullName} url={d.avatarUrl} size="size-16" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold text-navy">{d.fullName}</h3>
                  <p className="text-xs font-semibold text-[#0A84F0]">{t(`role.${d.role}`)} · {d.ownerCode ?? d.tenantCode ?? `@${d.username}`}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${d.state}`)}</span>
                    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[d.verificationStatus])}><ShieldCheck className="size-3.5" aria-hidden />{t(`nid.${d.verificationStatus}`)}</span>
                  </div>
                </div>
              </div>

              <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
                <Fact label={t("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.phone)}</span></span></Fact>
                <Fact label={t("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.email ?? none}</span></Fact>
                <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.address || none}</span></Fact>
                <Fact label={t("occupation")}>{d.occupation ?? none}</Fact>
                <Fact label={t("nidNumber")}><span dir="ltr" className="font-mono">{d.nid ?? none}</span></Fact>
                <Fact label={t("dob")}>{d.dateOfBirth ? day(locale, d.dateOfBirth) : none}</Fact>
                <Fact label={t("gender")}>{d.gender ? (t.has(`genders.${d.gender.toUpperCase()}` as never) ? t(`genders.${d.gender.toUpperCase()}` as never) : d.gender) : none}</Fact>
                <Fact label={t("username")}><span dir="ltr">@{d.username}</span></Fact>
                <Fact label={t("joined")}>{day(locale, d.createdAt)}</Fact>
                <Fact label={t("lastSeen")}>{d.lastSeenAt ? when(d.lastSeenAt) : none}</Fact>
              </dl>

              {d.owner && (
                <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
                  <Fact label={t("owner.properties")}>{d.owner.properties}</Fact>
                  <Fact label={t("owner.units")}>{d.owner.units}</Fact>
                  <Fact label={t("owner.listings")}>{d.owner.listings}</Fact>
                  <Fact label={t("owner.plan")}>{d.owner.plan ? `${locale === "bn" ? d.owner.plan.nameBn : d.owner.plan.nameEn}${d.owner.plan.endsAt ? ` · ${t("owner.until", { date: day(locale, d.owner.plan.endsAt) })}` : ""}` : t("owner.noPlan")}</Fact>
                </dl>
              )}
              {d.tenancy && (
                <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
                  <Fact label={t("tenancy.home")}>{d.tenancy.property} · {d.tenancy.unit}</Fact>
                  <Fact label={t("tenancy.landlord")}>{d.tenancy.owner}</Fact>
                  <Fact label={t("tenancy.rent")}>{formatTaka(locale)(Number(d.tenancy.rent))}</Fact>
                  <Fact label={t("tenancy.since")}>{day(locale, d.tenancy.startDate)}</Fact>
                </dl>
              )}

              <form onSubmit={(e) => { e.preventDefault(); void save(); }} className={clsx(card, "space-y-3")}>
                <h3 className={h}>{t("status.title")}</h3>
                <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                  <div>
                    <label htmlFor="pm-status" className="sr-only">{t("status.label")}</label>
                    <select id="pm-status" value={status} onChange={(e) => { setStatus(e.target.value as State); setProblem(null); }} disabled={busy} className="glass-input h-11 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none">
                      {(["ACTIVE", "WARNING", "SUSPENDED"] as const).map((s) => <option key={s} value={s}>{t(`state.${s}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pm-comment" className="sr-only">{t("status.comment")}</label>
                    <textarea id="pm-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} disabled={busy} placeholder={needsReason ? t("status.reasonPlaceholder") : t("status.notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
                  </div>
                </div>
                <p className="text-xs text-slate-500">{t(`status.hint.${status}`)}</p>
                {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{problem}</p>}
                <div className="flex justify-end">
                  <button type="submit" disabled={busy || unchanged} aria-busy={busy || undefined} className="btn btn-primary h-11 px-5 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? t("status.saving") : t("status.save")}</button>
                </div>
              </form>

              <section aria-label={t("log.title")} className={card}>
                <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("log.title")}</h3>
                {d.log.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("log.none")}</p> : (
                  <ol className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                    {d.log.map((l) => (
                      <li key={l.id} className="rounded-lg bg-white/70 p-2.5 text-sm">
                        <p className="flex flex-wrap items-center gap-2 text-xs"><span className={clsx("rounded-full px-2 py-0.5 font-bold", LOG_STYLE[l.action])}>{t(`log.action.${l.action}`)}</span><span className="font-semibold text-navy">{l.adminUsername}</span><span className="text-slate-500">· {when(l.createdAt)}</span></p>
                        {l.comment && <p className="mt-1 break-words text-slate-700">{l.comment}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
          <div className="mt-5 flex justify-end border-t border-slate-200/70 pt-4"><button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-11 sm:min-w-28">{t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}
