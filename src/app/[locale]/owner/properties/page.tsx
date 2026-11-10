import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PropertiesView } from "@/modules/owner/properties/PropertiesView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner.properties" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OwnerPropertiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PropertiesView />;
}
