-- Properties list: owner-entered total area, free-text location and declared unit count
ALTER TABLE "Property" ADD COLUMN "totalSqft" INTEGER,
  ADD COLUMN "locationText" TEXT,
  ADD COLUMN "declaredUnits" INTEGER;
