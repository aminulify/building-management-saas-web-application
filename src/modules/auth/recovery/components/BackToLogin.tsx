import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function BackToLogin() {
  const t = useTranslations("auth.recovery");
  return (
    <Link href="/login" className="group inline-flex items-center gap-2 text-sm font-bold text-[#00AEEF] transition-opacity hover:opacity-80">
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
      {t("backToLogin")}
    </Link>
  );
}
