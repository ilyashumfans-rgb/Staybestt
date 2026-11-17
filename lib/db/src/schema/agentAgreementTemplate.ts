import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const agentAgreementTemplateTable = pgTable("agent_agreement_template", {
  id: integer("id").primaryKey().default(1),
  template: text("template").notNull(),
  cin: text("cin").notNull().default(""),
  signatory: text("signatory").notNull().default(""),
  designation: text("designation").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertAgentAgreementTemplateSchema = createInsertSchema(agentAgreementTemplateTable);
