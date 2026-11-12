import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OwnersView } from "@/modules/admin/owners/OwnersView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.owners" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminOwnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OwnersView />;
}
