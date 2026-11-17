import { and, eq, isNull, sql } from "drizzle-orm";
import { db, propertiesTable, propertyCategoriesTable, roomsTable } from "@workspace/db";

export const HOTEL_SUBCATEGORIES = [
  "Luxury Hotel", "Premium Hotel", "Budget Hotel", "Boutique Hotel", "Business Hotel",
  "5-Star Hotel", "4-Star Hotel", "3-Star Hotel", "Airport Hotel", "Heritage Hotel",
];

export async function ensureSubcategories() {
  const categories = await db.select().from(propertyCategoriesTable);
  if ((categories.length === 0 || categories.some(category => category.subcategories === null)) &&
      !categories.some(category => ["stay", "hotel"].includes(category.slug) || ["hotel", "hotels"].includes(category.name.toLowerCase()))) {
    await db.insert(propertyCategoriesTable).values({
      name: "Hotel", slug: "stay", sortOrder: 0, active: true, subcategories: HOTEL_SUBCATEGORIES,
    }).onConflictDoNothing({ target: propertyCategoriesTable.slug });
  }
  // Null marks an existing, not-yet-initialized category. An intentionally empty
  // list is never reseeded, and existing category visibility is preserved.
  await db.update(propertyCategoriesTable).set({ subcategories: HOTEL_SUBCATEGORIES })
    .where(and(isNull(propertyCategoriesTable.subcategories),
      sql`(lower(${propertyCategoriesTable.name}) in ('hotel', 'hotels') or ${propertyCategoriesTable.slug} in ('stay', 'hotel'))`));
  await db.update(propertyCategoriesTable).set({ subcategories: [] })
    .where(isNull(propertyCategoriesTable.subcategories));
}

export function isValidSubcategorySelection(selected: string[], allowed: string[]) {
  return new Set(selected).size === selected.length && selected.every(name => allowed.includes(name));
}

export async function validateSubcategories(category: string, selected: string[] | undefined) {
  if (!selected?.length) return true;
  await ensureSubcategories();
  const [parent] = await db.select().from(propertyCategoriesTable)
    .where(eq(propertyCategoriesTable.slug, category));
  return !!parent && isValidSubcategorySelection(selected, parent.subcategories ?? []);
}

export async function validateRoomSubcategories(propertyId: number, selected: string[] | undefined) {
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId));
  return !!property && await validateSubcategories(property.category, selected);
}

export async function canChangePropertyCategory(propertyId: number, category: string) {
  const rooms = await db.select().from(roomsTable).where(eq(roomsTable.propertyId, propertyId));
  return validateSubcategories(category, [...new Set(rooms.flatMap(room => room.subcategories))]);
}
