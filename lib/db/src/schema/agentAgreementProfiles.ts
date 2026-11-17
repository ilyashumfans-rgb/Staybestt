import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";

export const agentAgreementProfilesTable = pgTable("agent_agreement_profiles", {
  agentId: text("agent_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertAgentAgreementProfileSchema = createInsertSchema(agentAgreementProfilesTable);
export type AgentAgreementProfile = typeof agentAgreementProfilesTable.$inferSelect;
