"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { Link } from "@/i18n/navigation";
import { authApi } from "@/lib/auth-client";
import { Tracker } from "../dashboard/RepairModal";
import { useTenantBase } from "../shell/TenantContext";

interface Detail { title: string; description: string; technicianName: string | null; unit: { unitNumber: string; property: { name: string } } }
interface Props { requestId: string | null; onClose: () => void }

/** "Track Status" of a repair request: Pending → In Progress → Completed, refreshed while the window is open. */
export function TrackModal({ requestId, onClose }: Props) {
  return (
    <Modal open={!!requestId} onClose={onClose} labelledBy="trk-title" maxWidth="max-w-[500px]">
      {requestId && <Body id={requestId} onClose={onClose} />}
    </Modal>
  );
}

function Body({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("tenant.notifications.track");
  const base = useTenantBase();
  const [d, setD] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    authApi<Detail>(`/maintenance/${id}`).then((r) => { if (live) setD(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);

  if (failed) return <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><h2 id="trk-title" className="font-semibold">{t("gone")}</h2><button type="button" onClick={onClose} className="btn btn-white h-10 px-5 text-sm">{t("close")}</button></div>;
  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-yellow-400 text-navy"><Wrench className="size-5" /></span>
        <div className="min-w-0"><h2 id="trk-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>{d ? <p className="truncate text-xs text-slate-600">{d.title}</p> : <div className="skeleton mt-1 h-3 w-40 rounded" />}</div>
      </header>
      {d && <p className="mt-4 line-clamp-3 text-sm text-slate-600">{d.description}</p>}
      <div className="mt-4 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md"><Tracker id={id} /></div>
      {d?.technicianName && <p className="mt-3 text-sm text-slate-700">{t("technician", { name: d.technicianName })}</p>}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Link href={`${base}/maintenance` as never} className="btn btn-white h-11 px-5 text-sm">{t("all")}</Link>
        <button type="button" onClick={onClose} className="btn btn-primary h-11 px-6 text-sm">{t("close")}</button>
      </div>
    </>
  );
}
