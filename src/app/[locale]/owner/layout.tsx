import { setRequestLocale } from "next-intl/server";
import { OwnerShell } from "@/modules/owner/shell/OwnerShell";

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OwnerShell>{children}</OwnerShell>;
}
