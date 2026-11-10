import { route } from "@/lib/api/handler";
import { listActivePlans, priceTable } from "@/modules/billing/plans.service";

/** Public. Prices for every cycle are computed on the server. */
export const GET = route(async () => {
  const plans = await listActivePlans();
  return plans.map((p) => ({
    id: p.id, code: p.code, nameBn: p.nameBn, nameEn: p.nameEn, audience: p.audience,
    monthlyPrice: p.monthlyPrice.toFixed(2), quarterlyDiscount: Number(p.quarterlyDiscount), yearlyDiscount: Number(p.yearlyDiscount),
    propertyLimit: p.propertyLimit, unitLimit: p.unitLimit, listingLimit: p.listingLimit,
    features: p.features, prices: priceTable(p),
  }));
});
