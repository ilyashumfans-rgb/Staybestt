import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { propertiesTable } from "./properties";

/** Immutable audit records for privileged agent-management changes. */
export const agentLifecycleEventsTable = pgTable("agent_lifecycle_events", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => usersTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  kind: text("kind").notNull(), // account_status | approval_status
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Snapshot history; booking ledger rows continue to hold the terms effective at booking time. */
export const commercialTermEventsTable = pgTable("commercial_term_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  fromMode: text("from_mode"),
  fromValue: doublePrecision("from_value"),
  toMode: text("to_mode").notNull(),
  toValue: doublePrecision("to_value").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const propertyReviewEventsTable = pgTable("property_review_events", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id),
  agentId: text("agent_id").notNull().references(() => usersTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});