import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";
import { usersTable } from "./users";

export const wishlistTable = pgTable(
  "wishlist",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => usersTable.id),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("wishlist_email_property").on(t.email, t.propertyId)],
);

export const insertWishlistSchema = createInsertSchema(wishlistTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWishlist = z.infer<typeof insertWishlistSchema>;
export type WishlistItem = typeof wishlistTable.$inferSelect;
