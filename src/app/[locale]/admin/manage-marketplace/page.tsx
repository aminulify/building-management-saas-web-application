import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ManageMarketplaceView } from "@/modules/admin/manage-marketplace/ManageMarketplaceView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.manageMarket" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminManageMarketplacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ManageMarketplaceView />;
}
