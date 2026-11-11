import { setRequestLocale } from "next-intl/server";
import { TenantShell } from "@/modules/tenant/shell/TenantShell";

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantShell area="/tenant">{children}</TenantShell>;
}
