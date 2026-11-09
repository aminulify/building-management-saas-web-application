import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { GuestOnly } from "@/modules/auth/components/GuestOnly";
import { RegisterWizard } from "@/modules/auth/register/components/RegisterWizard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("metaTitle"), description: t("subtitle") };
}

function WizardSkeleton() {
  return (
    <div className="glass-card mx-auto w-full max-w-5xl space-y-5 p-6 sm:p-12" aria-busy="true">
      <div className="skeleton h-10 w-48" />
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-12 w-full" />
      <div className="skeleton mx-auto h-14 w-3/4" />
      <div className="grid gap-5 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>
    </div>
  );
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <AmbientBackground />
      <GuestOnly>
        {/* useSearchParams (preselected account type) needs a Suspense boundary */}
        <Suspense fallback={<WizardSkeleton />}>
          <RegisterWizard />
        </Suspense>
      </GuestOnly>
    </main>
  );
}
