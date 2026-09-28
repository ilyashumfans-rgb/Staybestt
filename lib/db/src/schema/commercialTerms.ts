import { pgTable, serial, text, doublePrecision, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/** Admin-managed commission terms for agents and property-owner partners. */
export const commercialTermsTable = pgTable(
  "commercial_terms",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id),
    mode: text("mode").notNull().default("percentage"), // percentage | fixed
    value: doublePrecision("value").notNull().default(0),
    updatedBy: text("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("commercial_terms_user_unique").on(t.userId)],
);
export const insertCommercialTermsSchema = createInsertSchema(commercialTermsTable).omit({ id: true, updatedAt: true });
export type InsertCommercialTerms = z.infer<typeof insertCommercialTermsSchema>;
export type CommercialTerms = typeof commercialTermsTable.$inferSelect;