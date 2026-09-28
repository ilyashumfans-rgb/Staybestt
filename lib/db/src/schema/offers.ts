import {
  pgTable,
  serial,
  text,
  doublePrecision,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  couponCode: text("coupon_code"),
  discountPercent: doublePrecision("discount_percent"),
  active: boolean("active").notNull().default(true),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({
  id: true,
});
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
