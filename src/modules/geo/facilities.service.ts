import { Prisma, type FacilityType } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const TYPES = ["MOSQUE", "SCHOOL", "COLLEGE", "UNIVERSITY", "HOSPITAL", "MARKET", "PARK", "PLAYGROUND", "HIGHWAY"] as const;

export const facilitiesQuery = z.object({
  type: z.enum(TYPES).optional(),
  /** minLng,minLat,maxLng,maxLat */
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).transform((s) => s.split(",").map(Number)).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function listFacilities(q: z.infer<typeof facilitiesQuery>) {
  const bbox = q.bbox as number[] | undefined;
  const box = bbox ? Prisma.sql`AND location && ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)::geography` : Prisma.empty;
  const type = q.type ? Prisma.sql`AND type = ${q.type}::"FacilityType"` : Prisma.empty;
  return db.$queryRaw<{ id: string; type: FacilityType; nameBn: string; nameEn: string; lat: number; lng: number }[]>`
    SELECT id, type, "nameBn", "nameEn", ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Facility" WHERE location IS NOT NULL ${type} ${box} LIMIT ${q.limit}`;
}

/**
 * Pre-computes the nearest facility of every type for a listing (architecture 5.1 ListingFacilityDistance).
 * Uses verified coordinates only: if the listing has no location, nothing is stored.
 */
export async function computeFacilityDistances(listingId: string, tx: Prisma.TransactionClient = db) {
  await tx.$executeRaw`DELETE FROM "ListingFacilityDistance" WHERE "listingId" = ${listingId}::uuid`;
  await tx.$executeRaw`
    INSERT INTO "ListingFacilityDistance" (id, "listingId", "facilityType", "nearestFacilityId", "distanceM")
    SELECT gen_random_uuid(), l.id, t.type, f.id, ROUND(ST_Distance(l.location, f.location))::int
    FROM "Listing" l
    CROSS JOIN (SELECT DISTINCT type FROM "Facility") t
    CROSS JOIN LATERAL (
      SELECT id, location FROM "Facility" WHERE type = t.type AND location IS NOT NULL
      ORDER BY location <-> l.location LIMIT 1
    ) f
    WHERE l.id = ${listingId}::uuid AND l.location IS NOT NULL`;
}
