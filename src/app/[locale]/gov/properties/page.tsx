import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GovPropertiesView } from "@/modules/gov/properties/GovPropertiesView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gov.properties" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function GovPropertiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GovPropertiesView />;
}
