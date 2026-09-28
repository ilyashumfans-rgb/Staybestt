import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";
import { usersTable } from "./users";

/**
 * A capability is deliberately separate from the HR employees table. Clerk
 * users with role=employee are the principals that can receive this grant.
 */
export const propertyDocumentUploadGrantsTable = pgTable(
  "property_document_upload_grants",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => usersTable.id),
    active: boolean("active").notNull().default(true),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => usersTable.id),
  },
  (table) => [uniqueIndex("property_document_upload_grants_user_unique").on(table.userId)],
);

export const propertyDocumentsTable = pgTable("property_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: integer("property_id")
    .notNull()
    .references(() => propertiesTable.id),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => usersTable.id),
  originalName: text("original_name").notNull(),
  originalBytes: integer("original_bytes").notNull(),
  storedBytes: integer("stored_bytes").notNull(),
  contentType: text("content_type").notNull(),
  storageKey: text("storage_key").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  generation: integer("generation").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const propertyDocumentUploadIntentsTable = pgTable(
  "property_document_upload_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => propertiesTable.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => usersTable.id),
    stageKey: text("stage_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    declaredBytes: integer("declared_bytes").notNull(),
    status: text("status").notNull().default("pending"),
    generation: integer("generation").notNull().default(1),
    documentId: uuid("document_id").references(() => propertyDocumentsTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("property_document_upload_intents_stage_key_unique").on(table.stageKey)],
);

export const insertPropertyDocumentUploadGrantSchema = createInsertSchema(
  propertyDocumentUploadGrantsTable,
).omit({ id: true, grantedAt: true, revokedAt: true });

export const insertPropertyDocumentSchema = createInsertSchema(
  propertyDocumentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertPropertyDocumentUploadIntentSchema = createInsertSchema(
  propertyDocumentUploadIntentsTable,
).omit({ id: true, createdAt: true, finalizedAt: true });

export type PropertyDocumentUploadGrant =
  typeof propertyDocumentUploadGrantsTable.$inferSelect;
export type InsertPropertyDocumentUploadGrant = z.infer<
  typeof insertPropertyDocumentUploadGrantSchema
>;
export type PropertyDocument = typeof propertyDocumentsTable.$inferSelect;
export type InsertPropertyDocument = z.infer<typeof insertPropertyDocumentSchema>;
export type PropertyDocumentUploadIntent =
  typeof propertyDocumentUploadIntentsTable.$inferSelect;
export type InsertPropertyDocumentUploadIntent = z.infer<
  typeof insertPropertyDocumentUploadIntentSchema
>;