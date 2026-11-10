import { db } from "@/lib/db";

export const listDivisions = () => db.division.findMany({ orderBy: { nameEn: "asc" } });

/** All districts when no division is given (e.g. the emergency alert form). */
export const listDistricts = (divisionId?: string) =>
  db.district.findMany({ where: divisionId ? { divisionId } : {}, orderBy: { nameEn: "asc" } });

export const listUpazilas = (districtId: string) =>
  db.upazila.findMany({ where: { districtId }, orderBy: { nameEn: "asc" } });

export const listZones = (q?: string, upazilaId?: string) =>
  db.zone.findMany({
    where: {
      upazilaId,
      ...(q
        ? { OR: [{ nameEn: { contains: q, mode: "insensitive" } }, { nameBn: { contains: q } }] }
        : {}),
    },
    orderBy: { nameEn: "asc" },
    take: 50,
  });
