import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaidBoostView } from "@/modules/admin/paid-boost/PaidBoostView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.paidBoost" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminPaidBoostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PaidBoostView />;
}
