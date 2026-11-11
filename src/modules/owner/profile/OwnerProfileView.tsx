"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuthQuery } from "@/lib/use-auth-query";
import { useOwner } from "../shell/OwnerContext";
import { AgreementsModal } from "./AgreementsModal";
import { AvatarModal } from "./AvatarModal";
import { AddressCard, DocumentsCard, PersonalCard, PortfolioCard } from "./Cards";
import { DocumentModal } from "./DocumentModal";
import { EditProfileModal } from "./EditProfileModal";
import { ProfileHero } from "./ProfileHero";
import { PropertyModal } from "./PropertyModal";
import type { DocKind, OverviewProperty, OwnerOverview } from "./types";

export function OwnerProfileView() {
  const t = useTranslations("owner.profile");
  const { updateMe } = useOwner();
  const q = useAuthQuery<OwnerOverview>("/me/owner-overview");
  const [avatar, setAvatar] = useState(false);
  const [edit, setEdit] = useState(false);
  const [doc, setDoc] = useState<DocKind | null>(null);
  const [agreements, setAgreements] = useState(false);
  const [property, setProperty] = useState<OverviewProperty | null>(null);
  const data = q.data;

  // the "add this to reach 100%" hint opens the right place
  const fix = (key: string) => {
    if (key === "avatar") setAvatar(true);
    else if (key === "nidFront") setDoc("NID_FRONT");
    else if (key === "nidBack") setDoc("NID_BACK");
    else setEdit(true);
  };

  return (
    <div className="relative space-y-4">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-96 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />
      <h1 className="sr-only">{t("title")}</h1>

      {q.state === "loading" && !data && (
        <div aria-busy="true" className="space-y-4"><span className="sr-only">{t("loading")}</span><div className="skeleton h-52 w-full rounded-2xl" /><div className="grid gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]"><div className="space-y-4"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-56 rounded-2xl" /></div><div className="space-y-4"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-44 rounded-2xl" /></div></div></div>
      )}
      {q.state === "error" && !data && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {data && (
        <>
          <ProfileHero data={data} onAvatar={() => setAvatar(true)} onEdit={() => setEdit(true)} onMissing={fix} />
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
            <div className="space-y-4"><PersonalCard data={data} /><AddressCard data={data} /></div>
            <div className="space-y-4"><PortfolioCard data={data} onOpen={setProperty} /><DocumentsCard data={data} onNid={setDoc} onAgreement={() => setAgreements(true)} /></div>
          </div>
        </>
      )}

      <AvatarModal open={avatar} current={data?.user.avatarUrl ?? null} onClose={() => setAvatar(false)} onSaved={(url) => { updateMe({ avatarUrl: url }); q.reload(); }} />
      <EditProfileModal data={data} open={edit} onClose={() => setEdit(false)} onSaved={(name) => { updateMe({ fullName: name }); q.reload(); }} />
      <DocumentModal kind={doc} state={doc === "NID_FRONT" ? data?.documents.nidFront ?? null : data?.documents.nidBack ?? null} onClose={() => setDoc(null)} onSaved={q.reload} />
      <AgreementsModal open={agreements} onClose={() => setAgreements(false)} onChanged={q.reload} />
      <PropertyModal property={property} onClose={() => setProperty(null)} />
    </div>
  );
}
