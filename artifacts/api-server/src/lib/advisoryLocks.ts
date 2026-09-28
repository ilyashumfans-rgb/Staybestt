import { sql } from "drizzle-orm";

// Keep lock domains disjoint. A room id must never alias a booking, coupon, or
// invoice id because all checkout/cancellation paths acquire these locks in a
// shared order.
const LOCK_DOMAIN = {
  room: 41_001,
  booking: 41_002,
  coupon: 41_003,
  invoice: 41_004,
} as const;

type Transaction = {
  execute(query: unknown): Promise<unknown>;
};

export async function lockRoom(tx: Transaction, roomId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_DOMAIN.room}, ${roomId})`);
}

export async function lockBooking(tx: Transaction, bookingId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_DOMAIN.booking}, ${bookingId})`);
}

export async function lockRoomAndBooking(
  tx: Transaction,
  roomId: number,
  bookingId: number,
): Promise<void> {
  await lockRoom(tx, roomId);
  await lockBooking(tx, bookingId);
}

export async function lockCoupon(tx: Transaction, couponId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_DOMAIN.coupon}, ${couponId})`);
}

export async function lockInvoice(tx: Transaction, invoiceId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_DOMAIN.invoice}, ${invoiceId})`);
}