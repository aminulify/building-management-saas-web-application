import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OtpForm } from "@/modules/auth/recovery/components/OtpForm";
import { RecoveryPage } from "@/modules/auth/recovery/components/RecoveryPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.recovery.otp" });
  return { title: t("metaTitle"), description: t("subtitle") };
}

export default async function VerifyCodePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RecoveryPage><OtpForm /></RecoveryPage>;
}
