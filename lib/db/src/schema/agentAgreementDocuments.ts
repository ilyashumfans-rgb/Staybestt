import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { usersTable } from "./users";

// An agent may sign before submitting a property. Association is optional,
// explicit, and can only be set to a property owned by the uploading agent.
export const agentAgreementDocumentsTable = pgTable("agent_agreement_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id),
  agentId: text("agent_id").notNull().references(() => usersTable.id),
  originalName: text("original_name").notNull(),
  originalBytes: integer("original_bytes").notNull(),
  storedBytes: integer("stored_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});