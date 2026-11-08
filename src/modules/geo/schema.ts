import { z } from "zod";

const uuid = z.string().uuid();

export const districtsQuery = z.object({ division: uuid });
export const upazilasQuery = z.object({ district: uuid });
export const zonesQuery = z.object({
  q: z.string().trim().max(60).optional(),
  upazila: uuid.optional(),
});
