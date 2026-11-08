-- Array columns default to an empty array instead of NULL (NULL arrays broke NOT (col @> ...) filters).
UPDATE "Message" SET "deletedForIds" = ARRAY[]::TEXT[] WHERE "deletedForIds" IS NULL;
UPDATE "Property" SET "securityFeatures" = ARRAY[]::TEXT[] WHERE "securityFeatures" IS NULL;
UPDATE "Listing" SET "amenities" = ARRAY[]::TEXT[] WHERE "amenities" IS NULL;
UPDATE "Broadcast" SET "audience" = ARRAY[]::"Role"[] WHERE "audience" IS NULL;

ALTER TABLE "Message" ALTER COLUMN "deletedForIds" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Property" ALTER COLUMN "securityFeatures" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Listing" ALTER COLUMN "amenities" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Broadcast" ALTER COLUMN "audience" SET DEFAULT ARRAY[]::"Role"[];
