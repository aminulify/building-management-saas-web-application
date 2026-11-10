export type Cycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

/** Quarterly is sold as 4 months at the quarterly discount (product decision); the same number sets how long the subscription runs. */
export const CYCLE_MONTHS: Record<Cycle, number> = { MONTHLY: 1, QUARTERLY: 4, YEARLY: 12 };

export interface PriceInput {
  /** Monthly price in paisa (BDT × 100) to avoid float errors. */
  monthlyPricePaisa: number;
  quarterlyDiscount: number; // percent, e.g. 10
  yearlyDiscount: number; // percent, e.g. 20
}

export interface PriceQuote {
  cycle: Cycle;
  months: number;
  discountPercent: number;
  grossPaisa: number;
  totalPaisa: number;
  savingsPaisa: number;
}

/** total = monthlyPrice × months × (1 − discount/100). Server is the only source of truth. */
export function computePrice(input: PriceInput, cycle: Cycle): PriceQuote {
  const months = CYCLE_MONTHS[cycle];
  const discountPercent =
    cycle === "QUARTERLY" ? input.quarterlyDiscount : cycle === "YEARLY" ? input.yearlyDiscount : 0;
  const grossPaisa = input.monthlyPricePaisa * months;
  // discount expressed in basis points to keep the math integer-only
  const totalPaisa = Math.round((grossPaisa * (10000 - Math.round(discountPercent * 100))) / 10000);
  return { cycle, months, discountPercent, grossPaisa, totalPaisa, savingsPaisa: grossPaisa - totalPaisa };
}

export const toPaisa = (taka: number | string): number => Math.round(Number(taka) * 100);
export const fromPaisa = (paisa: number): string => (paisa / 100).toFixed(2);
