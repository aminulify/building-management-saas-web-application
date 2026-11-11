import { redirect } from "@/i18n/navigation";

/** Subscription belongs to Tenant-Free accounts only (/tenant-free/subscription). A verified tenant who opens the old address lands on their dashboard. */
export default async function TenantSubscriptionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/tenant/dashboard", locale });
}
