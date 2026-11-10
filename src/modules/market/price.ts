/**
 * The price badge on a card: "৳ 1.25 Crore", "৳ 85 Lakh", "৳ 35,000/mo" (Bangla digits and words in the Bangla UI).
 * Sale prices from one lakh up are shortened the way Bangladeshis say them; smaller amounts stay whole.
 */
const CRORE = 10_000_000;
const LAKH = 100_000;

export interface PriceParts { text: string; suffix: string }

export function priceBadge(locale: string, price: number, mode: "RENT" | "SALE"): PriceParts {
  const bn = locale === "bn";
  const fmt = (n: number, digits = 2) => new Intl.NumberFormat(bn ? "bn-BD" : "en-US", { maximumFractionDigits: digits }).format(n);
  if (mode === "RENT") return { text: `৳ ${fmt(price, 0)}`, suffix: bn ? "/মাস" : "/mo" };
  if (price >= CRORE) return { text: `৳ ${fmt(Math.round((price / CRORE) * 100) / 100)}`, suffix: bn ? " কোটি" : " Crore" };
  if (price >= LAKH) return { text: `৳ ${fmt(Math.round((price / LAKH) * 100) / 100)}`, suffix: bn ? " লাখ" : " Lakh" };
  return { text: `৳ ${fmt(price, 0)}`, suffix: "" };
}
