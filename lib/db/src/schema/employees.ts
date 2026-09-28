import { pgTable, serial, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// HR records for internal staff. Optionally linked to a users row by email.
export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(), // e.g. SB-0001
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  designation: text("designation").notNull().default(""),
  department: text("department").notNull().default(""),
  joiningDate: text("joining_date"), // YYYY-MM-DD
  exitDate: text("exit_date"), // YYYY-MM-DD, null while employed
  ctcAnnual: doublePrecision("ctc_annual"), // INR per year
  insuranceDetails: text("insurance_details"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
