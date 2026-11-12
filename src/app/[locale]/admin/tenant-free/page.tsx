import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantFreeView } from "@/modules/admin/tenant-free/TenantFreeView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.tenantFree" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminTenantFreePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantFreeView />;
}
