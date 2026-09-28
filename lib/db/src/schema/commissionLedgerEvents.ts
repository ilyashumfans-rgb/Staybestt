import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { commissionLedgerTable } from "./commissionLedger";
import { usersTable } from "./users";

/**
 * Immutable audit trail for commission allocations. Application code only
 * inserts rows here; it never updates or removes an event.
 */
export const commissionLedgerEventsTable = pgTable("commission_ledger_events", {
  id: serial("id").primaryKey(),
  ledgerId: integer("ledger_id")
    .notNull()
    .references(() => commissionLedgerTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommissionLedgerEventSchema = createInsertSchema(
  commissionLedgerEventsTable,
).omit({ id: true, createdAt: true });
export type InsertCommissionLedgerEvent = z.infer<typeof insertCommissionLedgerEventSchema>;
export type CommissionLedgerEvent = typeof commissionLedgerEventsTable.$inferSelect;