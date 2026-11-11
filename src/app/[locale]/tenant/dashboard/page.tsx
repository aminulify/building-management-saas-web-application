import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantDashboardView } from "@/modules/tenant/dashboard/TenantDashboardView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tenant.dashboard" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function TenantDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantDashboardView />;
}
