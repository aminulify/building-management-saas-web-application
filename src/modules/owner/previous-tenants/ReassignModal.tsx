"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Boxes, Building2, Calendar, Loader2, Repeat2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { dayAfter, todayInput } from "../tenants/schema";
import type { OwnerProperty, UnitsPage } from "../units/types";
import type { PastDetail } from "./types";

interface Props { detail: PastDetail | null; onClose: () => void; onDone: () => void }

/** "Re-assign to vacant unit": moves the same person into another vacant unit as a new, active tenancy. */
export function ReassignModal({ detail, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={detail !== null} onClose={onClose} labelledBy="reassign-title" busy={busy} maxWidth="max-w-[520px]">
      {detail && <Form d={detail} onClose={onClose} onDone={onDone} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ d, onClose, onDone, setBusy }: { d: PastDetail; onClose: () => void; onDone: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.previousTenants.reassign");
  const toast = useToast();
  const props = useAuthQuery<{ items: OwnerProperty[] }>("/properties?limit=50");
  const properties = useMemo(() => [...(props.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [props.data]);
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState("");
  const [members, setMembers] = useState(String(d.members));
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const units = useAuthQuery<UnitsPage>(propertyId ? `/units?propertyId=${propertyId}&status=VACANT&pageSize=50` : null);
  const vacant = useMemo(() => (units.data?.items ?? []).filter((u) => u.availability === "AVAILABLE"), [units.data]);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);
  useEffect(() => { setUnitId(""); }, [propertyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null); setFieldError(null);
    const m = Number(members);
    if (!propertyId || !unitId) { setFieldError(t("errors.pick")); return; }
    if (!end || end <= start) { setFieldError(t("errors.dates")); return; }
    if (!Number.isInteger(m) || m < 1 || m > 30) { setFieldError(t("errors.members")); return; }
    setSaving(true);
    try {
      await authApi(`/units/${unitId}/tenant`, { method: "POST", body: { tenantId: d.tenant!.id, startDate: start, endDate: end, members: m } });
      toast("success", t("done", { name: d.tenant?.fullName ?? "", unit: vacant.find((u) => u.id === unitId)?.unitNumber ?? "" }));
      onDone(); onClose();
    } catch (err) {
      setSaving(false);
      if (!(err instanceof ApiError)) setBanner(t("errors.generic"));
      else if (err.code === "INVALID_STATE" && err.reason === "tenant_has_active_tenancy") setBanner(t("errors.busy"));
      else if (err.code === "INVALID_STATE") { setBanner(t("errors.taken")); units.reload(); }
      else if (err.code === "NETWORK") setBanner(t("errors.network"));
      else if (err.code === "FORBIDDEN" || err.status === 402 || err.status === 403) setBanner(t("errors.forbidden"));
      else setBanner(t("errors.generic"));
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Repeat2 className="size-5" /></span>
        <div><h2 id="reassign-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("for", { name: d.tenant?.fullName ?? "" })}</p></div>
      </header>
      <form noValidate onSubmit={(e) => void submit(e)} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("property")} htmlFor="r-property">
            <GlassSelect id="r-property" icon={Building2} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} loading={props.state === "loading"} disabled={saving || props.state !== "ready"}>
              <option value="">{props.state === "loading" ? t("loading") : props.state === "error" ? t("propertiesError") : properties.length === 0 ? t("noProperties") : t("pickProperty")}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </GlassSelect>
          </GlassField>
          <GlassField label={t("unit")} htmlFor="r-unit">
            <GlassSelect id="r-unit" icon={Boxes} value={unitId} onChange={(e) => setUnitId(e.target.value)} loading={!!propertyId && units.state === "loading"} disabled={saving || !propertyId || units.state !== "ready" || vacant.length === 0}>
              <option value="">{!propertyId ? t("propertyFirst") : units.state === "loading" ? t("loading") : units.state === "ready" && vacant.length === 0 ? t("noVacant") : t("pickUnit")}</option>
              {vacant.map((u) => <option key={u.id} value={u.id}>{t("unitOption", { no: u.unitNumber })}</option>)}
            </GlassSelect>
          </GlassField>
        </div>
        {propertyId && units.state === "ready" && vacant.length === 0 && <p className="-mt-2 text-xs text-amber-700">{t("noVacantHelp")} <Link href={"/owner/units" as never} className="font-bold underline underline-offset-2">{t("goUnits")}</Link></p>}
        {(props.state === "error" || units.state === "error") && <p role="alert" className="-mt-2 text-xs font-medium text-red-600">{t("loadError")} <button type="button" onClick={() => { props.reload(); units.reload(); }} className="font-bold underline underline-offset-2">{t("retry")}</button></p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("start")} htmlFor="r-start">
            <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3"><Calendar className="size-5 shrink-0 text-slate-400" aria-hidden /><input id="r-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" /></div>
          </GlassField>
          <GlassField label={t("end")} htmlFor="r-end">
            <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3"><ArrowRight className="size-5 shrink-0 text-slate-400" aria-hidden /><input id="r-end" type="date" min={start ? dayAfter(start) : undefined} value={end} onChange={(e) => setEnd(e.target.value)} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" /></div>
          </GlassField>
        </div>
        <GlassField label={t("members")} htmlFor="r-members">
          <GlassInput id="r-members" icon={Users} inputMode="numeric" value={members} onChange={(e) => setMembers(e.target.value)} disabled={saving} />
        </GlassField>
        <p className="-mt-1 text-xs text-label">{t("note")}</p>

        {fieldError && <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5 shrink-0" aria-hidden />{fieldError}</p>}
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Repeat2 className="size-4" aria-hidden />}{saving ? t("saving") : t("confirm")}</button>
        </div>
      </form>
    </>
  );
}
