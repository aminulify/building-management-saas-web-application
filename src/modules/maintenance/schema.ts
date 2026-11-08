import { z } from "zod";
import { uuid } from "@/lib/api/common";

export const CATEGORIES = ["PLUMBING", "ELECTRICAL", "GAS", "LIFT", "PAINT", "SECURITY", "CLEANING", "OTHER"] as const;

export const maintenanceCreateSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  images: z.array(z.string().trim().min(3).max(300)).max(5).default([]),
});

export const maintenanceListQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
  category: z.enum(CATEGORIES).optional(),
  unitId: uuid.optional(),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export const actionBodySchema = z.object({
  technicianName: z.string().trim().min(2).max(80).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export const ACTIONS = ["approve", "reject", "assign", "status", "complete", "cancel"] as const;
export type MaintenanceAction = (typeof ACTIONS)[number];
