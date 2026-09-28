import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { invoicesTable, invoicePaymentsTable } from "./billing";
import { usersTable } from "./users";

/**
 * A refund is an immutable completed manual return of a recorded invoice
 * payment.  There is deliberately no status/edit/delete surface: a row is
 * only inserted once the administrator has completed the manual refund.
 */
export const bookingRefundsTable = pgTable(
  "booking_refunds",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "restrict" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "restrict" }),
    invoicePaymentId: integer("invoice_payment_id")
      .notNull()
      .references(() => invoicePaymentsTable.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    refundDate: date("refund_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    method: text("method").notNull(),
    actorUserId: text("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("booking_refunds_booking_id_idx").on(table.bookingId),
    index("booking_refunds_invoice_payment_id_idx").on(table.invoicePaymentId),
    index("booking_refunds_refund_date_idx").on(table.refundDate),
    uniqueIndex("booking_refunds_booking_idempotency_key_idx").on(
      table.bookingId,
      table.idempotencyKey,
    ),
    check("booking_refunds_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const insertBookingRefundSchema = createInsertSchema(
  bookingRefundsTable,
).omit({ id: true, createdAt: true });
export type InsertBookingRefund = z.infer<typeof insertBookingRefundSchema>;
export type BookingRefund = typeof bookingRefundsTable.$inferSelect;