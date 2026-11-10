import { z } from "zod";
import { coords, uuid } from "@/lib/api/common";
import { bdPhoneSchema } from "@/modules/users/schema";

export const sosCreateSchema = z
  .object({
    type: z.enum(["FIRE", "THEFT", "SECURITY", "LEAKAGE", "MEDICAL", "OTHER"]),
    description: z.string().trim().max(500).optional(),
    /** which service the reporter asked for (owner dashboard buttons); informs the Gov hub, it is not a forward */
    service: z.enum(["POLICE", "FIRE"]).optional(),
    contactPhone: bdPhoneSchema.optional(),
    reporterName: z.string().trim().min(2).max(100).optional(),
    thana: z.string().trim().max(100).optional(),
    locationText: z.string().trim().max(300).optional(),
    district: z.string().trim().max(60).optional(),
    lat: coords.lat.optional(),
    lng: coords.lng.optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "lat_lng_together", path: ["lat"] });

export const alertListQuery = z.object({
  status: z.enum(["NEED_ACTION", "PROCESSING", "SOLVED", "FALSE_ALARM", "UNSOLVED"]).default("UNSOLVED"),
  /** polling backstop: only alerts created or updated after this time */
  since: z.coerce.date().optional(),
});

export const alertActionSchema = z.object({
  officerId: uuid.optional(),
  target: z.enum(["POLICE_999", "FIRE", "AMBULANCE"]).optional(),
  reference: z.string().trim().min(3).max(60).optional(),
  status: z.enum(["PROCESSING", "SOLVED", "FALSE_ALARM"]).optional(),
  note: z.string().trim().min(2).max(1000).optional(),
});

export const ALERT_ACTIONS = ["ack", "assign", "forward", "status", "notes"] as const;
export type AlertActionName = (typeof ALERT_ACTIONS)[number];

export const incidentCreateSchema = z.object({
  alertId: uuid.optional(),
  type: z.enum(["FIRE", "THEFT", "SECURITY", "LEAKAGE", "MEDICAL", "OTHER"]),
  findings: z.string().trim().min(5).max(3000),
  resolution: z.string().trim().max(2000).optional(),
});
