import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";

export const bookingEmailsTable = pgTable("booking_emails", {
  bookingId: integer("booking_id").primaryKey().references(() => bookingsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
});
