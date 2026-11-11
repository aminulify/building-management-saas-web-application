import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HistoryView } from "@/modules/tenant/history/HistoryView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tenant.history" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function TenantHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HistoryView />;
}
