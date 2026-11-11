import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PropertiesView } from "@/modules/admin/properties/PropertiesView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.properties" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminPropertiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PropertiesView />;
}
