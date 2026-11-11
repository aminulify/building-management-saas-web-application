import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MaintenanceView } from "@/modules/owner/maintenance/MaintenanceView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner.maintenance" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OwnerMaintenancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MaintenanceView />;
}
