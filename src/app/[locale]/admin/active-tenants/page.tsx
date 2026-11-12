import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantsView } from "@/modules/admin/tenants/TenantsView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.tenants" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminTenantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantsView />;
}
