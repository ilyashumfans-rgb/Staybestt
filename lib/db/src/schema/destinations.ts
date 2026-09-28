import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const destinationsTable = pgTable("destinations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  country: text("country").notNull(),
  state: text("state"),
  city: text("city"),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Destination = typeof destinationsTable.$inferSelect;