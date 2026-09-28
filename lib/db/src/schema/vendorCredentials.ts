import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Admin-managed vendor login credentials. The password copy is stored so the
// admin can view and share it with hotel owners on request (explicit product
// decision by the site owner).
export const vendorCredentialsTable = pgTable("vendor_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  password: text("password").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorCredential = typeof vendorCredentialsTable.$inferSelect;
