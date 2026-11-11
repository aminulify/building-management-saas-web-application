import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ManageHomeView } from "@/modules/admin/manage-home/ManageHomeView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.manageHome" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminManageHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ManageHomeView />;
}
