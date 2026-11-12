import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PreviousView } from "@/modules/admin/previous-owners/PreviousView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.previousOwners" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminPreviousOwnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PreviousView />;
}
