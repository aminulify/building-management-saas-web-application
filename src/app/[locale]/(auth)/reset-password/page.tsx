import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RecoveryPage } from "@/modules/auth/recovery/components/RecoveryPage";
import { ResetForm } from "@/modules/auth/recovery/components/ResetForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.recovery.reset" });
  return { title: t("metaTitle"), description: t("subtitle") };
}

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RecoveryPage><ResetForm /></RecoveryPage>;
}
