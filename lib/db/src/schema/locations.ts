import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { postalDirectoryTable } from "./postalDirectory";

// Admin-managed list of serviceable locations. Each row is a
// country + state + optional district + city + area + pincode combination.
export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  country: text("country").notNull().default("India"),
  state: text("state").notNull().default("Other"),
  district: text("district"),
  city: text("city").notNull(),
  area: text("area").notNull(),
  pincode: text("pincode").notNull(),
  // Existing manually curated rows were already approved before the postal
  // directory existed. The default preserves that admin-approved state during
  // the schema transition; imported directory links are explicitly checked.
  approved: boolean("approved").notNull().default(true),
  postalDirectoryId: integer("postal_directory_id").references(
    () => postalDirectoryTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // One row per normalized country/state/city/area/pincode combination.
  uniqueIndex("locations_hierarchy_unique").on(
    sql`lower(${t.country})`,
    sql`lower(${t.state})`,
    sql`lower(${t.city})`,
    sql`lower(${t.area})`,
    t.pincode,
  ),
  uniqueIndex("locations_postal_directory_unique").on(t.postalDirectoryId),
]);
