import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OwnerProfileView } from "@/modules/owner/profile/OwnerProfileView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner.profile" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OwnerProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OwnerProfileView />;
}
