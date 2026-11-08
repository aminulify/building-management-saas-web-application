import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";

/** Loads a property and enforces property:read (admins read-only) or property:manage (owner of it). */
export async function loadProperty(actor: Actor, id: string, mode: "read" | "manage") {
  const property = await db.property.findUnique({ where: { id } });
  if (!property) throw new AppError("NOT_FOUND");
  await authorize(actor, mode === "read" ? "property:read" : "property:manage", {
    ownerId: property.ownerId,
    readOnly: mode === "read",
  });
  return property;
}

export async function loadUnit(actor: Actor, id: string, mode: "read" | "manage") {
  const unit = await db.unit.findUnique({ where: { id }, include: { property: true } });
  if (!unit) throw new AppError("NOT_FOUND");
  await authorize(actor, mode === "read" ? "unit:read" : "unit:manage", {
    ownerId: unit.property.ownerId,
    readOnly: mode === "read",
  });
  return unit;
}
