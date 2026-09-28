import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  // Public, immutable PM reference number. This is intentionally separate
  // from the primary key so deleting a property never reuses its reference.
  propertyNumber: serial("property_number").notNull().unique(),
  ownerId: text("owner_id").references(() => usersTable.id),
  name: text("name").notNull(),
  category: text("category").notNull(), // prime | luxury | budget | package
  country: text("country"),
  state: text("state"),
  city: text("city").notNull(),
  area: text("area").notNull(),
  landmark: text("landmark"),
  pincode: text("pincode").notNull().default(""),
  address: text("address").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  images: text("images").array().notNull().default([]),
  youtubeUrl: text("youtube_url"),
  amenities: text("amenities").array().notNull().default([]),
  policies: text("policies").array().notNull().default([]),
  // IANA timezone name used to evaluate time-sensitive policies (e.g.
  // cancellation windows) in property-local time.
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  checkInTime: text("check_in_time").notNull().default("2:00 PM"),
  checkOutTime: text("check_out_time").notNull().default("11:00 AM"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  rating: doublePrecision("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  startingPrice: doublePrecision("starting_price").notNull(),
  freeCancellation: boolean("free_cancellation").notNull().default(false),
  breakfastIncluded: boolean("breakfast_included").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  status: text("status").notNull().default("pending"), // pending | approved | active | suspended | rejected
  reviewReason: text("review_reason"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  popularityScore: integer("popularity_score").notNull().default(0),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({
  id: true,
  propertyNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
