import { eq } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";

const same = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

export async function destinationExistsInCatalog(input: {
  country: string;
  state?: string | null;
  city?: string | null;
}): Promise<boolean> {
  const locations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.approved, true));
  return locations.some(
    (location) =>
      same(location.country, input.country) &&
      (!input.state || same(location.state, input.state)) &&
      (!input.city || same(location.city, input.city)),
  );
}

export async function propertyLocationExistsInCatalog(input: {
  country: string;
  state: string;
  city: string;
  area: string;
  pincode?: string | null;
}): Promise<boolean> {
  const locations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.approved, true));
  // Partner and agent writes fail closed. An empty approved catalog must
  // never turn into an implicit allow-all fallback.
  const pincode = input.pincode?.trim();
  if (!pincode) return false;

  return locations.some(
    (location) =>
      same(location.country, input.country) &&
      same(location.state, input.state) &&
      same(location.city, input.city) &&
      same(location.area, input.area) &&
      location.pincode.trim() === pincode,
  );
}