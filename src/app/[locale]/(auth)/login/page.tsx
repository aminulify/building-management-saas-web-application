import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { AuthCard } from "@/modules/auth/components/AuthCard";
import { GuestOnly } from "@/modules/auth/components/GuestOnly";
import { LoginForm } from "@/modules/auth/login/components/LoginForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle"), description: t("subtitle") };
}

function FormSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-9 w-4/5" />
      <div className="skeleton h-5 w-full" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton h-12 w-full" />
    </div>
  );
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:py-12">
      <AmbientBackground />
      <GuestOnly>
        <AuthCard className="max-w-xl">
          {/* useSearchParams (?next=) needs a Suspense boundary */}
          <Suspense fallback={<FormSkeleton />}>
            <LoginForm />
          </Suspense>
        </AuthCard>
      </GuestOnly>
    </main>
  );
}
