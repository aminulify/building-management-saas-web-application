import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FindPeopleView } from "@/modules/admin/find-people/FindPeopleView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.findPeople" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminFindPeoplePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FindPeopleView />;
}
