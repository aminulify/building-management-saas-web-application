import { setRequestLocale } from "next-intl/server";
import { GovShell } from "@/modules/gov/shell/GovShell";

export default async function GovLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GovShell>{children}</GovShell>;
}
