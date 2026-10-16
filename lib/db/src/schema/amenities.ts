import { pgTable, serial, text, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const amenityCategoriesTable = pgTable("amenity_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(100),
});

export const amenitiesTable = pgTable("amenities", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => amenityCategoriesTable.id),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("check"),
  archived: boolean("archived").notNull().default(false),
}, (table) => [uniqueIndex("amenities_category_name_unique").on(table.categoryId, table.name)]);

export const insertAmenitySchema = createInsertSchema(amenitiesTable).omit({ id: true });
export const insertAmenityCategorySchema = createInsertSchema(amenityCategoriesTable).omit({ id: true });
