import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotForm } from "@/modules/auth/recovery/components/ForgotForm";
import { RecoveryPage } from "@/modules/auth/recovery/components/RecoveryPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.recovery.forgot" });
  return { title: t("metaTitle"), description: t("subtitle") };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RecoveryPage><ForgotForm /></RecoveryPage>;
}
