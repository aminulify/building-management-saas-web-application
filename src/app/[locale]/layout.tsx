import type { Metadata } from "next";
import { Anek_Bangla, Playfair_Display, Poppins } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { HashAuthRedirect } from "@/modules/auth/components/HashAuthRedirect";
import "@/styles/globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], style: ["italic"], weight: ["500", "600", "700"], variable: "--font-playfair", display: "swap" });
const anek = Anek_Bangla({ subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-anek", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AmaderGhor", template: "%s · AmaderGhor" },
  icons: { icon: "/images/logo-icon.png" },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} data-locale={locale} className={`${poppins.variable} ${playfair.variable} ${anek.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <MotionProvider>{children}</MotionProvider>
          <HashAuthRedirect />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
