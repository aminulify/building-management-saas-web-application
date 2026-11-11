"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuthQuery } from "@/lib/use-auth-query";
import { AvatarModal } from "../../owner/profile/AvatarModal";
import { DocumentModal } from "../../owner/profile/DocumentModal";
import type { DocKind } from "../../owner/profile/types";
import { useTenant } from "../shell/TenantContext";
import { AddressCard, CurrentUnitCard, DocumentsCard, PersonalCard } from "./Cards";
import { EditProfileModal } from "./EditProfileModal";
import { ProfileHero } from "./ProfileHero";
import type { TenantOverview } from "./types";

/** The profile page of a Tenant-Free account and of a verified tenant (same page, same data). */
export function TenantProfileView() {
  const t = useTranslations("tenant.profile");
  const { updateMe } = useTenant();
  const q = useAuthQuery<TenantOverview>("/me/tenant-overview");
  const [avatar, setAvatar] = useState(false);
  const [edit, setEdit] = useState(false);
  const [doc, setDoc] = useState<DocKind | null>(null);
  const data = q.data;
  const docState = (k: DocKind) => (!data ? null : k === "NID_FRONT" ? data.documents.nidFront : k === "NID_BACK" ? data.documents.nidBack : data.documents.agreement?.source === "OWN" ? data.documents.agreement : null);

  return (
    <div className="relative space-y-4">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-96 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      {q.state === "loading" && !data && (
        <div aria-busy="true" className="space-y-4"><span className="sr-only">{t("loading")}</span><div className="skeleton h-44 w-full rounded-2xl" /><div className="grid gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]"><div className="space-y-4"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-56 rounded-2xl" /></div><div className="skeleton h-64 rounded-2xl" /></div></div>
      )}
      {q.state === "error" && !data && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {data && (
        <>
          <ProfileHero data={data} onAvatar={() => setAvatar(true)} onEdit={() => setEdit(true)} />
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
            <div className="space-y-4"><PersonalCard data={data} /><AddressCard data={data} /></div>
            <div className="space-y-4"><CurrentUnitCard data={data} /><DocumentsCard data={data} onNid={setDoc} onAgreement={() => setDoc("AGREEMENT")} /></div>
          </div>
        </>
      )}

      <AvatarModal open={avatar} current={data?.user.avatarUrl ?? null} onClose={() => setAvatar(false)} onSaved={(url) => { updateMe({ avatarUrl: url }); q.reload(); }} />
      <EditProfileModal data={data} open={edit} onClose={() => setEdit(false)} onSaved={(name) => { updateMe({ fullName: name }); q.reload(); }} />
      <DocumentModal kind={doc} state={doc ? docState(doc) : null} onClose={() => setDoc(null)} onSaved={q.reload} />
    </div>
  );
}
