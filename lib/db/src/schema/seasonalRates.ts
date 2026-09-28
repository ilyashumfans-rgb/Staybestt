import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";
import { roomsTable } from "./rooms";

export const seasonalRatesTable = pgTable("seasonal_rates", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  pricePerNight: integer("price_per_night").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SeasonalRate = typeof seasonalRatesTable.$inferSelect;
