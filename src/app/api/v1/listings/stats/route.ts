import { route } from "@/lib/api/handler";
import { marketplaceStats } from "@/modules/admin/analytics.service";

/** Marketplace dashboard counters: totals, rent/sale, apartments/flats/land, featured, recent, popular zones. */
export const GET = route(async () => marketplaceStats());
