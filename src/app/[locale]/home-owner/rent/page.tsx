import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RentView } from "@/modules/owner/rent/RentView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner.rent" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OwnerRentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RentView />;
}
