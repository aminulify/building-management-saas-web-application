import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportView } from "@/modules/admin/report/ReportView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.report" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminReportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportView />;
}
