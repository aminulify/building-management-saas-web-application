import { useTranslations } from "next-intl";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { GlassCard } from "@/components/glass/GlassCard";
import { buttonClass } from "@/components/glass/GradientButton";
import { Logo } from "@/components/layout/Logo";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errorPages.notFound");
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <AmbientBackground />
      <GlassCard className="w-full max-w-lg p-8 text-center sm:p-12">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="gradient-heading text-7xl" aria-hidden>404</p>
        <h1 className="mt-4 text-2xl font-bold leading-snug text-navy sm:text-3xl">{t.rich("title", { hl })}</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">{t("text")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className={buttonClass("primary")}>{t("signup")}</Link>
          <Link href="/" className={buttonClass("glass")}>{t("home")}</Link>
        </div>
      </GlassCard>
    </main>
  );
}
