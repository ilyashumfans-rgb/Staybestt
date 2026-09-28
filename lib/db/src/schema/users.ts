import { pgTable, text, timestamp, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Clerk-backed users. id is the Clerk user id.
export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    role: text("role").notNull().default("customer"), // customer | partner | agent | employee | admin
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"), // active | blocked
    statusReason: text("status_reason"),
    approvalStatus: text("approval_status").notNull().default("approved"), // pending | approved | rejected
    approvalReason: text("approval_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} <> ''`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
