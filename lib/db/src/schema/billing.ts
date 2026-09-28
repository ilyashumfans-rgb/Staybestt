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

/**
 * The application has one billing profile. Keeping it in a table, rather than
 * in environment variables, lets an administrator change the information
 * printed on future invoices without fabricating defaults in application code.
 */
export const billingSettingsTable = pgTable("billing_settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull(),
  address: text("address").notNull(),
  taxRegistration: text("tax_registration"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const invoicesTable = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    bookingId: integer("booking_id").references(() => bookingsTable.id, {
      onDelete: "set null",
    }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    // These fields are immutable invoice-time values. Never re-join live
    // booking/property/room rows when rendering an invoice.
    bookingSnapshotRef: text("booking_snapshot_ref"),
    bookingSnapshotPropertyName: text("booking_snapshot_property_name"),
    bookingSnapshotRoomName: text("booking_snapshot_room_name"),
    bookingSnapshotCheckIn: date("booking_snapshot_check_in", { mode: "string" }),
    bookingSnapshotCheckOut: date("booking_snapshot_check_out", { mode: "string" }),
    bookingSnapshotTotalMinor: integer("booking_snapshot_total_minor"),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invoices_booking_id_idx").on(table.bookingId),
    check("invoices_minor_totals_nonnegative", sql`
      ${table.subtotalMinor} >= 0
      and ${table.taxMinor} >= 0
      and ${table.totalMinor} > 0
      and ${table.totalMinor}::bigint = ${table.subtotalMinor}::bigint + ${table.taxMinor}::bigint
    `),
  ],
);

export const invoiceLineItemsTable = pgTable(
  "invoice_line_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
  },
  (table) => [
    index("invoice_line_items_invoice_id_idx").on(table.invoiceId),
    check("invoice_line_items_quantity_positive", sql`${table.quantity} > 0`),
    check("invoice_line_items_prices_nonnegative", sql`
      ${table.unitPriceMinor} >= 0
      and ${table.taxRateBps} >= 0
      and ${table.taxRateBps} <= 10000
      and ${table.taxMinor} >= 0
      and ${table.totalMinor}::bigint =
        (${table.quantity}::bigint * ${table.unitPriceMinor}::bigint) + ${table.taxMinor}::bigint
    `),
  ],
);

export const invoicePaymentsTable = pgTable(
  "invoice_payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invoice_payments_invoice_id_idx").on(table.invoiceId),
    uniqueIndex("invoice_payments_invoice_idempotency_key_idx").on(
      table.invoiceId,
      table.idempotencyKey,
    ),
    check("invoice_payments_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const insertBillingSettingsSchema = createInsertSchema(
  billingSettingsTable,
).omit({ updatedAt: true });
export type InsertBillingSettings = z.infer<typeof insertBillingSettingsSchema>;
export type BillingSettings = typeof billingSettingsTable.$inferSelect;

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const insertInvoiceLineItemSchema = createInsertSchema(
  invoiceLineItemsTable,
).omit({ id: true });
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InvoiceLineItem = typeof invoiceLineItemsTable.$inferSelect;

export const insertInvoicePaymentSchema = createInsertSchema(
  invoicePaymentsTable,
).omit({ id: true, createdAt: true });
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;