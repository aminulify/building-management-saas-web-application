-- Units list: dining rooms and kitchens shown under the unit name
ALTER TABLE "Unit" ADD COLUMN "diningRooms" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "kitchens" INTEGER NOT NULL DEFAULT 0;
