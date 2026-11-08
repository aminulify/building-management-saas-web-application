import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { csvResponse } from "@/lib/csv";
import { monthParam } from "@/modules/rent/schema";
import { exportMonth } from "@/modules/rent/extras.service";
import { z } from "zod";

export const GET = route(async (req) => {
  const { month } = parseQuery(req, z.object({ month: monthParam }));
  return csvResponse(`rent-${month}.csv`, await exportMonth(await requireActor(req), month));
});
