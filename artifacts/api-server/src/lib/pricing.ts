import { asc, eq } from "drizzle-orm";
import { db, seasonalRatesTable } from "@workspace/db";

/**
 * Total price for one room across the stay, applying seasonal rates per
 * night. Deterministic: rates are ordered by startDate then id, and the
 * first matching range wins (overlaps are rejected at creation time).
 */
export async function stayPriceForRoom(
  roomId: number,
  basePricePerNight: number,
  checkIn: string,
  nights: number,
): Promise<number> {
  const rates = await db
    .select()
    .from(seasonalRatesTable)
    .where(eq(seasonalRatesTable.roomId, roomId))
    .orderBy(asc(seasonalRatesTable.startDate), asc(seasonalRatesTable.id));
  let total = 0;
  const nightMs = 24 * 60 * 60 * 1000;
  const startMs = Date.parse(`${checkIn}T00:00:00Z`);
  for (let i = 0; i < nights; i++) {
    const night = new Date(startMs + i * nightMs).toISOString().slice(0, 10);
    const rate = rates.find((r) => night >= r.startDate && night <= r.endDate);
    total += rate ? rate.pricePerNight : basePricePerNight;
  }
  return total;
}
