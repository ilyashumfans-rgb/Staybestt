import { pgTable, serial, text, integer, doublePrecision, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

/** Immutable allocation snapshot written in the same transaction as a booking. */
export const commissionLedgerTable = pgTable(
  "commission_ledger",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
    recipientUserId: text("recipient_user_id").notNull().references(() => usersTable.id),
    allocationType: text("allocation_type").notNull(), // agent | partner
    termMode: text("term_mode").notNull(),
    termValue: doublePrecision("term_value").notNull(),
    amount: doublePrecision("amount").notNull(),
    status: text("status").notNull().default("pending"), // pending | available | paid | voided
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("commission_ledger_booking_recipient_type_unique").on(t.bookingId, t.recipientUserId, t.allocationType)],
);
export const insertCommissionLedgerSchema = createInsertSchema(commissionLedgerTable).omit({ id: true, createdAt: true });
export type InsertCommissionLedger = z.infer<typeof insertCommissionLedgerSchema>;
export type CommissionLedger = typeof commissionLedgerTable.$inferSelect;