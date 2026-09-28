import { integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const assistantDailyUsageTable = pgTable(
  "assistant_daily_usage",
  {
    id: serial("id").primaryKey(),
    keyHash: text("key_hash").notNull(),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(1),
  },
  (table) => [
    uniqueIndex("assistant_daily_usage_key_date_idx").on(
      table.keyHash,
      table.usageDate,
    ),
  ],
);