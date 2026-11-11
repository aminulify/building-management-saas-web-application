import { setRequestLocale } from "next-intl/server";
import { TenantShell } from "@/modules/tenant/shell/TenantShell";

/** Every page of a Tenant-Free account lives under /tenant-free. */
export default async function TenantFreeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TenantShell area="/tenant-free">{children}</TenantShell>;
}
