import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";

export const partnerPushKeysTable = pgTable("partner_push_keys", {
  id: integer("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
});
export const partnerPushSubscriptionsTable = pgTable("partner_push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
});
export const partnerBookingAlertsTable = pgTable("partner_booking_alerts", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, t => [uniqueIndex("partner_alert_booking_owner").on(t.bookingId, t.userId)]);
export const partnerPushDeliveriesTable = pgTable("partner_push_deliveries", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").notNull().references(() => partnerBookingAlertsTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").notNull().references(() => partnerPushSubscriptionsTable.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
}, t => [uniqueIndex("partner_push_alert_device").on(t.alertId, t.subscriptionId)]);
