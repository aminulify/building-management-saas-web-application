/** Row returned by GET /properties (see listProperties): the property plus ready-to-show figures. */
export interface PropertyRow {
  id: string;
  name: string;
  locationLabel: string;
  locationText: string | null;
  sqft: number;
  totalSqft: number | null;
  declaredUnits: number | null;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  coverUrl: string | null;
  coverImageId: string | null;
}

export interface PropertyPage { items: PropertyRow[]; nextCursor: string | null }
