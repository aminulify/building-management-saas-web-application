import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BoostPaymentView } from "@/modules/market/boost/BoostPaymentView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owner.marketplace.boost" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function BoostPaymentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <BoostPaymentView listingId={id} />;
}
