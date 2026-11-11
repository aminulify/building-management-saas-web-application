import { z } from "zod";
import { uuid } from "@/lib/api/common";

export const CATEGORIES = ["PLUMBING", "ELECTRICAL", "GAS", "LIFT", "PAINT", "SECURITY", "CLEANING", "OTHER"] as const;

/** When the tenant would like the repair: a moment that is not in the past (5 min grace) and within a year. */
const preferredAt = z.iso.datetime({ offset: true }).refine((v) => {
  const t = Date.parse(v);
  return t > Date.now() - 5 * 60_000 && t < Date.now() + 366 * 86_400_000;
}, "preferred_range");

export const maintenanceCreateSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  preferredAt: preferredAt.optional(),
  images: z.array(z.string().trim().min(3).max(300)).max(5).default([]),
});

/**
 * The tenant edits their own request: the words, priority, photo and preferred time while it is still Pending/Approved,
 * and the condition (mark it Completed, or reopen it as Pending). `images` is the complete list of photos after the edit.
 */
export const maintenanceUpdateSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(5).max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  preferredAt: preferredAt.nullable().optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  images: z.array(z.string().trim().min(3).max(300)).max(5).optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), "empty");

export const maintenanceListQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
  /** several statuses at once, e.g. PENDING,APPROVED for the "Pending" tab */
  statuses: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.enum(["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"])).max(6)).optional(),
  category: z.enum(CATEGORIES).optional(),
  unitId: uuid.optional(),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export const actionBodySchema = z.object({
  technicianName: z.string().trim().min(2).max(80).optional(),
  /** owner: move a request straight to Pending, In Progress or Completed (the status pill on the Maintenance page) */
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export const ACTIONS = ["approve", "reject", "assign", "status", "complete", "cancel"] as const;
export type MaintenanceAction = (typeof ACTIONS)[number];
