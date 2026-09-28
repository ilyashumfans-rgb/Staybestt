import { and, count, eq, sql } from "drizzle-orm";
import { db, couponRedemptionsTable, couponsTable, type Coupon } from "@workspace/db";
import { lockCoupon } from "./advisoryLocks";

export type CouponCheck =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; message: string };

/**
 * Validate a coupon code against a booking subtotal and compute the discount.
 * The discount never exceeds the subtotal.
 */
export async function checkCoupon(
  code: string,
  amount: number,
  user?: { id: string; role: string } | null,
): Promise<CouponCheck> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, message: "Enter a coupon code" };
  }
  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(eq(sql`upper(${couponsTable.code})`, normalized));
  if (!coupon) {
    return { ok: false, message: "Invalid coupon code" };
  }
  if (!coupon.active) {
    return { ok: false, message: "This coupon is no longer active" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (coupon.startsAt && coupon.startsAt > today) {
    return { ok: false, message: "This coupon is not active yet" };
  }
  if (coupon.expiresAt) {
    if (coupon.expiresAt < today) {
      return { ok: false, message: "This coupon has expired" };
    }
  }
  if (coupon.audience !== "all" && coupon.audience !== user?.role) {
    return { ok: false, message: "This coupon is not available to your account" };
  }
  // Validation reflects only redemptions that have not been reversed.
  const [total] = await db.select({ value: count() }).from(couponRedemptionsTable)
    .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.status, "applied")));
  if (coupon.totalUsageLimit != null && total!.value >= coupon.totalUsageLimit) {
    return { ok: false, message: "This coupon has reached its usage limit" };
  }
  if (coupon.perUserUsageLimit != null && user?.id) {
    const [used] = await db.select({ value: count() }).from(couponRedemptionsTable)
      .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.userId, user.id), eq(couponRedemptionsTable.status, "applied")));
    if (used!.value >= coupon.perUserUsageLimit) return { ok: false, message: "You have already used this coupon" };
  }
  if (coupon.minAmount != null && amount < coupon.minAmount) {
    return {
      ok: false,
      message: `This coupon requires a minimum booking amount of ₹${coupon.minAmount.toLocaleString("en-IN")}`,
    };
  }
  const raw =
    coupon.type === "percent" ? (amount * coupon.value) / 100 : coupon.value;
  const discountAmount = Math.min(
    Math.round(raw * 100) / 100,
    coupon.maxDiscount ?? Number.POSITIVE_INFINITY,
    amount,
  );
  return { ok: true, coupon, discountAmount };
}

/** Reserve a redemption inside the booking transaction. Advisory locking makes
 * counter checks safe even when several requests validate the same code. */
export async function redeemCoupon(
  tx: any,
  coupon: Coupon,
  bookingId: number,
  userId: string | null,
  discountAmount: number,
): Promise<boolean> {
  await lockCoupon(tx, coupon.id);
  const [total] = await tx.select({ value: count() }).from(couponRedemptionsTable)
    .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.status, "applied")));
  if (coupon.totalUsageLimit != null && total!.value >= coupon.totalUsageLimit) return false;
  if (coupon.perUserUsageLimit != null) {
    if (!userId) return false;
    const [used] = await tx.select({ value: count() }).from(couponRedemptionsTable)
      .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.userId, userId), eq(couponRedemptionsTable.status, "applied")));
    if (used!.value >= coupon.perUserUsageLimit) return false;
  }
  await tx.insert(couponRedemptionsTable).values({ couponId: coupon.id, bookingId, userId, discountAmount });
  return true;
}
