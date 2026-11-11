import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantProfileView } from "@/modules/tenant/profile/TenantProfileView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tenant.profile" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function TenantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantProfileView />;
}
