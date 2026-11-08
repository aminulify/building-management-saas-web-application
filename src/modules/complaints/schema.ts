import { z } from "zod";
import { uuid } from "@/lib/api/common";

export const complaintCreateSchema = z.object({
  category: z.enum(["NOISE", "SECURITY", "PAYMENT", "BEHAVIOUR", "FACILITY", "FRAUD", "OTHER"]),
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
  propertyId: uuid.optional(),
  evidence: z.array(z.string().min(10).max(300)).max(5).default([]),
});

export const complaintListQuery = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED", "REOPENED"]).optional(),
});

export const complaintActionSchema = z.object({
  assigneeId: uuid.optional(),
  status: z.enum(["IN_REVIEW", "REJECTED"]).optional(),
  note: z.string().trim().min(2).max(1000).optional(),
  resolution: z.string().trim().min(3).max(1000).optional(),
});

export const COMPLAINT_ACTIONS = ["assign", "status", "notes", "resolve", "reopen"] as const;
export type ComplaintAction = (typeof COMPLAINT_ACTIONS)[number];
