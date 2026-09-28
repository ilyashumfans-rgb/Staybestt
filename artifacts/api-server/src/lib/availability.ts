import { and, eq, gt, lt, or, sql, ne } from "drizzle-orm";
import { db, bookingsTable } from "@workspace/db";

/**
 * Number of rooms of a room type already committed by confirmed bookings or
 * an unexpired payment hold that overlap the [checkIn, checkOut) range.
 * Expired holds remain in the database for audit/history but do not consume
 * inventory.
 */
type DbClient = Pick<typeof db, "select">;

export async function bookedRoomsCount(
  roomId: number,
  checkIn: string,
  checkOut: string,
  client: DbClient = db,
  excludeBookingId?: number,
): Promise<number> {
  const now = new Date();
  const [row] = await client
    .select({
      total: sql<number>`coalesce(sum(${bookingsTable.roomsCount}), 0)::int`,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.roomId, roomId),
        or(
          eq(bookingsTable.status, "confirmed"),
          and(
            eq(bookingsTable.status, "pending_payment"),
            gt(bookingsTable.paymentHoldExpiresAt, now),
          ),
        ),
        lt(bookingsTable.checkIn, checkOut),
        gt(bookingsTable.checkOut, checkIn),
        ...(excludeBookingId === undefined
          ? []
          : [ne(bookingsTable.id, excludeBookingId)]),
      ),
    );
  return row?.total ?? 0;
}

/** Mark expired holds without deleting their audit records. */
export async function expirePaymentHold(
  bookingId: number,
  client: Pick<typeof db, "update"> = db,
): Promise<void> {
  await client
    .update(bookingsTable)
    .set({ status: "expired", paymentHoldExpiresAt: null })
    .where(
      and(
        eq(bookingsTable.id, bookingId),
        eq(bookingsTable.status, "pending_payment"),
        sql`${bookingsTable.paymentHoldExpiresAt} <= now()`,
      ),
    );
}
