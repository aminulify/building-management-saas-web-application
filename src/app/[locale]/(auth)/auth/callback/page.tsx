import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { AuthCard } from "@/modules/auth/components/AuthCard";
import { AuthCallback } from "@/modules/auth/login/components/AuthCallback";

export const metadata: Metadata = { title: "…", robots: { index: false } };

export default async function CallbackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <AmbientBackground />
      <AuthCard className="max-w-md"><AuthCallback /></AuthCard>
    </main>
  );
}
