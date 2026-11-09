import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { AccountView } from "@/modules/auth/account/AccountView";
import { AuthCard } from "@/modules/auth/components/AuthCard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:py-12">
      <AmbientBackground />
      <AuthCard className="max-w-xl"><AccountView /></AuthCard>
    </main>
  );
}
