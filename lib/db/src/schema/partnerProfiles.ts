import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const partnerProfilesTable = pgTable("partner_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull().default(""),
  gstNumber: text("gst_number").notNull().default(""),
  address: text("address").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  bankAccountName: text("bank_account_name").notNull().default(""),
  bankAccountNumber: text("bank_account_number").notNull().default(""),
  bankIfsc: text("bank_ifsc").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PartnerProfile = typeof partnerProfilesTable.$inferSelect;
