import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  images: text("images").array().notNull().default([]),
  maxGuests: integer("max_guests").notNull().default(2),
  totalRooms: integer("total_rooms").notNull().default(5),
  pricePerNight: doublePrecision("price_per_night").notNull(),
  amenities: text("amenities").array().notNull().default([]),
  isAvailable: boolean("is_available").notNull().default(true),
});

export const insertRoomSchema = createInsertSchema(roomsTable).omit({
  id: true,
});
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;
