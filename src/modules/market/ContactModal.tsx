"use client";

import { useState } from "react";
import { Loader2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { MessageOwner } from "../find-home/MessageOwner";
import type { HomeCardData } from "../find-home/types";

interface Props { home: HomeCardData | null; onClose: () => void }

/** "Contact Owner": reveal the owner's phone and e-mail (signed in, rate limited, audited) or send a first message. */
export function ContactModal({ home, onClose }: Props) {
  return <Modal open={!!home} onClose={onClose} labelledBy="mk-contact-title" maxWidth="max-w-[520px]">{home && <Body home={home} onClose={onClose} />}</Modal>;
}

function Body({ home: h, onClose }: { home: HomeCardData; onClose: () => void }) {
  const t = useTranslations("owner.marketplace.contact");
  const toast = useToast();
  const [contact, setContact] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const s = h.seller;

  async function reveal() {
    setBusy(true);
    try { setContact(await authApi<{ name: string; phone: string | null; email: string | null }>(`/listings/${h.id}/contact`)); }
    catch (e) { toast("error", e instanceof ApiError && e.status === 429 ? t("limit") : t("error")); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 pt-1">
      <header className="flex items-center gap-3 pr-10">
        {s?.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          ? <img src={s.avatarUrl} alt="" className="size-14 rounded-full object-cover ring-2 ring-white" />
          : <span aria-hidden className="grid size-14 place-items-center rounded-full bg-brand-gradient text-white"><UserRound className="size-6" /></span>}
        <div className="min-w-0">
          <h2 id="mk-contact-title" className="truncate text-lg font-bold text-navy">{s?.fullName ?? t("owner")}</h2>
          {s?.verified && <p className="flex items-center gap-1 text-xs font-extrabold uppercase text-emerald-600"><ShieldCheck className="size-3.5" aria-hidden />● {t("verifiedNid")}</p>}
          <p className="truncate text-xs text-label">{h.title}</p>
        </div>
      </header>

      {contact ? (
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          {contact.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-[#0A84F0]" aria-hidden /><a href={`tel:${contact.phone}`} dir="ltr" className="font-semibold text-navy hover:underline">{contact.phone}</a></p>}
          {contact.email && <p className="flex items-center gap-2"><Mail className="size-4 text-[#0A84F0]" aria-hidden /><a href={`mailto:${contact.email}`} className="break-all font-semibold text-navy hover:underline">{contact.email}</a></p>}
          {!contact.phone && !contact.email && <p className="text-slate-600">{t("none")}</p>}
        </div>
      ) : (
        <button type="button" onClick={reveal} disabled={busy} className="btn btn-primary h-11 w-full text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Phone className="size-4" aria-hidden />}{t("reveal")}</button>
      )}
      <p className="text-xs text-label">{t("privacy")}</p>
      <MessageOwner listingId={h.id} title={h.title} onSent={onClose} />
    </div>
  );
}
