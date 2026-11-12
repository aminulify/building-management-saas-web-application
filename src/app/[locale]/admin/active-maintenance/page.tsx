import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MaintenanceView } from "@/modules/admin/maintenance/MaintenanceView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.maintenance" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminMaintenancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MaintenanceView />;
}
