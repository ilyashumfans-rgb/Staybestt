import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";
import { roomsTable } from "./rooms";
import { usersTable } from "./users";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  // New online bookings do not receive a public reference until Razorpay
  // reports a captured payment. Existing rows keep their historical refs.
  bookingRef: text("booking_ref"),
  idempotencyKey: text("idempotency_key"),
  idempotencyFingerprint: text("idempotency_fingerprint"),
  userId: text("user_id").references(() => usersTable.id),
  // Attribution is populated exclusively from the authenticated agent identity.
  agentId: text("agent_id").references(() => usersTable.id),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  roomId: integer("room_id")
    .notNull()
    .references(() => roomsTable.id),
  checkIn: date("check_in", { mode: "string" }).notNull(),
  checkOut: date("check_out", { mode: "string" }).notNull(),
  guests: integer("guests").notNull(),
  adults: integer("adults"),
  children: integer("children"),
  roomsCount: integer("rooms_count").notNull().default(1),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  specialRequests: text("special_requests"),
  status: text("status").notNull().default("confirmed"), // pending_payment | confirmed | cancelled | completed | expired
  totalAmount: doublePrecision("total_amount").notNull(),
  couponCode: text("coupon_code"),
  discountAmount: doublePrecision("discount_amount"),
  paymentHoldExpiresAt: timestamp("payment_hold_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  // PostgreSQL unique indexes permit multiple NULL values, preserving all
  // pre-existing rows while making assigned public refs globally unique.
  uniqueIndex("bookings_booking_ref_idx").on(table.bookingRef),
  uniqueIndex("bookings_user_idempotency_key_idx").on(table.userId, table.idempotencyKey),
  index("bookings_payment_hold_expires_at_idx").on(table.paymentHoldExpiresAt),
]);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
