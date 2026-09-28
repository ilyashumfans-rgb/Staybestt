import {
  check,
  boolean,
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
import { usersTable } from "./users";

/**
 * One row represents one Razorpay checkout attempt. Razorpay deliberately
 * maps one order to one attempt, so a failed order is never reused.
 */
export const razorpayOrdersTable = pgTable(
  "razorpay_orders",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "cascade" }),
    externalOrderId: text("external_order_id").notNull(),
    receipt: text("receipt").notNull(),
    attempt: integer("attempt").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    mode: text("mode").notNull(), // test | live
    status: text("status").notNull().default("created"), // created | failed | paid
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("razorpay_orders_external_order_id_idx").on(table.externalOrderId),
    uniqueIndex("razorpay_orders_booking_attempt_idx").on(table.bookingId, table.attempt),
    index("razorpay_orders_booking_id_idx").on(table.bookingId),
    check("razorpay_orders_amount_positive", sql`${table.amountMinor} > 0`),
    check("razorpay_orders_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

/**
 * Immutable external payment ledger. The status may move from authorized to
 * captured, but a provider payment id is never associated with a second
 * booking. The source tells operators which trusted path first observed it.
 */
export const razorpayPaymentsTable = pgTable(
  "razorpay_payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => razorpayOrdersTable.id, { onDelete: "restrict" }),
    externalPaymentId: text("external_payment_id").notNull(),
    externalOrderId: text("external_order_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    mode: text("mode").notNull(), // test | live
    status: text("status").notNull(), // authorized | captured | failed
    source: text("source").notNull(), // checkout | webhook | reconciliation
    failureCode: text("failure_code"),
    failureDescription: text("failure_description"),
    refundRequired: boolean("refund_required").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("razorpay_payments_external_payment_id_idx").on(
      table.externalPaymentId,
    ),
    uniqueIndex("razorpay_payments_booking_order_payment_idx").on(
      table.bookingId,
      table.orderId,
      table.externalPaymentId,
    ),
    index("razorpay_payments_booking_id_idx").on(table.bookingId),
    index("razorpay_payments_external_order_id_idx").on(table.externalOrderId),
    check("razorpay_payments_amount_nonnegative", sql`${table.amountMinor} >= 0`),
  ],
);

/**
 * Razorpay webhook event ids are globally unique. Keeping the receipt state
 * lets a transient provider/API failure be retried instead of incorrectly
 * treating an inserted-but-unprocessed event as a duplicate.
 */
export const razorpayWebhookEventsTable = pgTable(
  "razorpay_webhook_events",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    event: text("event").notNull(),
    status: text("status").notNull().default("received"), // received | processed | failed
    paymentId: text("payment_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("razorpay_webhook_events_event_id_idx").on(table.eventId),
    index("razorpay_webhook_events_payment_id_idx").on(table.paymentId),
  ],
);

/**
 * A mobile handoff has two independent credentials:
 *
 * - capabilityHash is the single-use value placed in the hosted-page
 *   fragment;
 * - checkoutTokenHash is the short-lived bearer used by the hosted page.
 *
 * Only SHA-256 digests are persisted. Neither raw value is recoverable from
 * the database, and a capability cannot be exchanged twice.
 */
export const razorpayMobileSessionsTable = pgTable(
  "razorpay_mobile_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "cascade" }),
    capabilityHash: text("capability_hash").notNull(),
    checkoutTokenHash: text("checkout_token_hash"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    mode: text("mode").notNull(), // test | live
    capabilityExpiresAt: timestamp("capability_expires_at", {
      withTimezone: true,
    }).notNull(),
    capabilityConsumedAt: timestamp("capability_consumed_at", {
      withTimezone: true,
    }),
    checkoutIssuedAt: timestamp("checkout_issued_at", { withTimezone: true }),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("razorpay_mobile_sessions_capability_hash_idx").on(
      table.capabilityHash,
    ),
    uniqueIndex("razorpay_mobile_sessions_checkout_token_hash_idx").on(
      table.checkoutTokenHash,
    ),
    index("razorpay_mobile_sessions_user_id_idx").on(table.userId),
    index("razorpay_mobile_sessions_booking_id_idx").on(table.bookingId),
    check("razorpay_mobile_sessions_amount_positive", sql`${table.amountMinor} > 0`),
    check("razorpay_mobile_sessions_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const insertRazorpayOrderSchema = createInsertSchema(
  razorpayOrdersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRazorpayOrder = z.infer<typeof insertRazorpayOrderSchema>;
export type RazorpayOrder = typeof razorpayOrdersTable.$inferSelect;

export const insertRazorpayPaymentSchema = createInsertSchema(
  razorpayPaymentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRazorpayPayment = z.infer<
  typeof insertRazorpayPaymentSchema
>;
export type RazorpayPayment = typeof razorpayPaymentsTable.$inferSelect;

export const insertRazorpayWebhookEventSchema = createInsertSchema(
  razorpayWebhookEventsTable,
).omit({ id: true });
export type InsertRazorpayWebhookEvent = z.infer<
  typeof insertRazorpayWebhookEventSchema
>;
export type RazorpayWebhookEvent =
  typeof razorpayWebhookEventsTable.$inferSelect;

export const insertRazorpayMobileSessionSchema = createInsertSchema(
  razorpayMobileSessionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRazorpayMobileSession = z.infer<
  typeof insertRazorpayMobileSessionSchema
>;
export type RazorpayMobileSession =
  typeof razorpayMobileSessionsTable.$inferSelect;