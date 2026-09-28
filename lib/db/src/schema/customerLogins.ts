import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Usernames are identifiers only. Passwords are verified and stored by Clerk.
export const customerLoginsTable = pgTable("customer_logins", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("customer_logins_username_unique").on(table.username)]);