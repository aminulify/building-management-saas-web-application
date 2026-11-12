import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminMessages } from "@/modules/admin/messages/AdminMessages";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chat" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminMessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Suspense fallback={null}><AdminMessages /></Suspense>;
}
