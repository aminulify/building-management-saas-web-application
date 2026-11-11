import { setRequestLocale } from "next-intl/server";
import { AdminShell } from "@/modules/admin/shell/AdminShell";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminShell>{children}</AdminShell>;
}
