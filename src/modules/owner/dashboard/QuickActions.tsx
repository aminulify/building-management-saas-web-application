"use client";

import { ChevronRight, MessageCircle, PlusSquare, Wrench, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/glass/GradientButton";
import { Link } from "@/i18n/navigation";

/** Add Property / Add Unit as in the design, plus the shortcuts owners use most. */
export function QuickActions() {
  const t = useTranslations("owner.quick");
  const shortcut = "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-white/70 hover:text-[#0A84F0]";
  return (
    <section className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md sm:p-5" aria-labelledby="qa-title">
      <h2 id="qa-title" className="text-lg font-bold text-navy">{t("title")}</h2>
      <div className="mt-4 space-y-3">
        <Link href={"/home-owner/properties" as never} className={`${buttonClass("glass", true)} h-11 justify-between border-[#0A84F0] text-[#0A84F0]`}>{t("addProperty")}<ChevronRight className="size-4" aria-hidden /></Link>
        <Link href={"/home-owner/units" as never} className={`${buttonClass("primary", true)} h-11 justify-between`}>{t("addUnit")}<ChevronRight className="size-4" aria-hidden /></Link>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-1 border-t border-slate-300/60 pt-3 text-sm">
        <li><Link href={"/home-owner/tenants" as never} className={shortcut}><UserPlus className="size-4" aria-hidden />{t("inviteTenant")}</Link></li>
        <li><Link href={"/home-owner/maintenance" as never} className={shortcut}><Wrench className="size-4" aria-hidden />{t("maintenance")}</Link></li>
        <li><Link href={"/home-owner/messages" as never} className={shortcut}><MessageCircle className="size-4" aria-hidden />{t("messages")}</Link></li>
        <li><Link href={"/home-owner/rent" as never} className={shortcut}><PlusSquare className="size-4" aria-hidden />{t("recordPayment")}</Link></li>
      </ul>
    </section>
  );
}
