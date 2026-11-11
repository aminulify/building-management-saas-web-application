"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { useTenant, useTenantBase } from "../shell/TenantContext";
import { AgreementModal } from "./AgreementModal";
import { HelpDeskCard, LeaseCard, PaymentCard } from "./Cards";
import { IncidentModal } from "./IncidentModal";
import { PayModal } from "./PayModal";
import { RepairModal } from "./RepairModal";
import { SosModal, type SosService } from "./SosModal";
import { ActivityCard, EmergencyStrip, QuickActions } from "./Widgets";
import { firstName } from "./logic";
import type { ActivityPage, TenantDashboard } from "./types";

const STEP = 10;

export function TenantDashboardView() {
  const t = useTranslations("tenant.dashboard");
  const { me } = useTenant();
  const base = useTenantBase();
  const router = useRouter();
  const toast = useToast();
  const dash = useAuthQuery<TenantDashboard>("/dashboard/tenant");
  const [limit, setLimit] = useState(5);
  const act = useAuthQuery<ActivityPage>(`/dashboard/tenant/activity?limit=${limit}`);
  const [pay, setPay] = useState(false);
  const [repair, setRepair] = useState(false);
  const [agreement, setAgreement] = useState(false);
  const [incident, setIncident] = useState(false);
  const [sos, setSos] = useState<SosService | null>(null);
  const [chatting, setChatting] = useState(false);

  // statuses change on the owner's side (payment verified, repair started): look again every 30 s and when the tab comes back
  const busy = useRef(false); // a request that is still running is never restarted (it would be thrown away)
  busy.current = dash.fetching || act.fetching;
  const { reload: reloadDash } = dash;
  const { reload: reloadAct } = act;
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !busy.current) { reloadDash(); reloadAct(); } };
    const id = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, [reloadDash, reloadAct]);

  const data = dash.data;
  const tenancy = data?.tenancy ?? null;
  const refreshAll = () => { dash.reload(); act.reload(); };

  async function chat() {
    if (!tenancy?.owner) return;
    setChatting(true);
    try {
      const c = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: tenancy.owner.id } });
      router.push(`${base}/messages?c=${c.id}` as never);
    } catch (e) {
      toast("error", t(e instanceof ApiError && e.code === "FORBIDDEN" ? "help.chatForbidden" : "help.chatError"));
      setChatting(false);
    }
  }

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-96 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header">
        <h1 className="text-2xl font-bold text-navy sm:text-[1.65rem]">{t("welcome", { name: firstName(me.fullName) })} <span aria-hidden>👋</span></h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      {dash.state === "loading" && !data && (
        <div aria-busy="true" className="space-y-5"><span className="sr-only">{t("loading")}</span>
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}</div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div></div>
      )}
      {dash.state === "error" && !data && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={dash.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {data && !tenancy && (
        <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
          <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><Home className="size-8" /></span>
          <h2 className="text-lg font-bold text-navy">{t("noLease.title")}</h2>
          <p className="max-w-md text-sm text-slate-600">{t("noLease.text")}</p>
          <Link href={`${base}/find-home` as never} className="btn btn-primary mt-1 h-11 px-6">{t("noLease.cta")}</Link>
        </FadeIn>
      )}

      {data && tenancy && data.nextPayment && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <LeaseCard tenancy={tenancy} />
            <PaymentCard next={data.nextPayment} onSend={() => setPay(true)} />
            {tenancy.owner ? <HelpDeskCard owner={tenancy.owner} onChat={() => void chat()} chatting={chatting} /> : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <QuickActions onRepair={() => setRepair(true)} onAgreement={() => setAgreement(true)} onIncident={() => setIncident(true)} />
            <ActivityCard page={act.data} state={act.state} fetching={act.fetching} onMore={() => setLimit((l) => l + STEP)} onRetry={act.reload} />
          </div>
          <EmergencyStrip busy={false} onPolice={() => setSos("POLICE")} onFire={() => setSos("FIRE")} />
        </>
      )}

      <PayModal open={pay} next={data?.nextPayment ?? null} ownerName={tenancy?.owner?.fullName ?? ""} onClose={() => setPay(false)} onSent={refreshAll} />
      <RepairModal open={repair} onClose={() => setRepair(false)} onSent={refreshAll} />
      <AgreementModal open={agreement} tenancy={tenancy} tenantName={me.fullName} onClose={() => setAgreement(false)} />
      <IncidentModal open={incident} propertyId={tenancy?.property.id ?? null} onClose={() => setIncident(false)} onSent={refreshAll} />
      <SosModal service={sos} tenancy={tenancy} name={me.fullName} phone={me.phone} onClose={() => setSos(null)} onSent={refreshAll} />
    </div>
  );
}
