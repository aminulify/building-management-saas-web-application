import type { Prisma } from "@prisma/client";

type Table = "Property" | "Listing" | "EmergencyAlert";

/** Prisma cannot write `geography` columns, so set them with raw SQL (table name is a closed union, never user input). */
export async function setPoint(tx: Prisma.TransactionClient, table: Table, id: string, lat: number, lng: number) {
  const sql = `UPDATE "${table}" SET "location" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3::uuid`;
  await tx.$executeRawUnsafe(sql, lng, lat, id);
}
