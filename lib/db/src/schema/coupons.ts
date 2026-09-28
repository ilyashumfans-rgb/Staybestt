import {
  pgTable,
  serial,
  text,
  doublePrecision,
  integer,
  boolean,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(), // percent | flat
  value: doublePrecision("value").notNull(),
  minAmount: doublePrecision("min_amount"),
  maxDiscount: doublePrecision("max_discount"),
  startsAt: date("starts_at", { mode: "string" }),
  expiresAt: date("expires_at", { mode: "string" }),
  totalUsageLimit: integer("total_usage_limit"),
  perUserUsageLimit: integer("per_user_usage_limit"),
  audience: text("audience").notNull().default("all"), // all | customers | agents | partners
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
