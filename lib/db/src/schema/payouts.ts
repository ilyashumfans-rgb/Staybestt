import { pgTable, serial, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/** A payout request/audit record. No provider transfer is attempted without configuration. */
export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  amount: doublePrecision("amount").notNull(),
  status: text("status").notNull().default("failed"), // requested | paid | failed
  provider: text("provider"),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;