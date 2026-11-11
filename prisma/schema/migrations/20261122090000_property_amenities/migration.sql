-- Amenities picked when a property is added (Near Hospital, Parking, Lift, Furnished …)
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
