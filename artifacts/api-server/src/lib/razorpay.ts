import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bookingsTable,
  commercialTermsTable,
  commissionLedgerEventsTable,
  commissionLedgerTable,
  couponRedemptionsTable,
  couponsTable,
  db,
  invoicePaymentsTable,
  invoicesTable,
  invoiceLineItemsTable,
  propertiesTable,
  razorpayOrdersTable,
  razorpayPaymentsTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import { currentBusinessDate } from "./billing";
import { bookedRoomsCount } from "./availability";
import { lockCoupon, lockRoomAndBooking } from "./advisoryLocks";

export type PaymentSummary = {
  status: "paid" | "unpaid" | "processing" | "failed" | "refund_required";
  provider: "none" | "manual" | "razorpay";
  currency: "INR";
  amountMinor: number;
  paidMinor: number;
  dueMinor: number;
  orderId: string | null;
  paymentId: string | null;
  verifiedAt: string | null;
  requiresRefund: boolean;
};

export type ExternalPaymentStatus = "authorized" | "captured" | "failed";

export class RazorpayLedgerError extends Error {
  readonly code:
    | "missing_booking"
    | "payment_hold_expired"
    | "order_mismatch"
    | "payment_conflict"
    | "mixed_payment"
    | "invoice_mismatch";

  constructor(
    code: RazorpayLedgerError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RazorpayLedgerError";
    this.code = code;
  }
}

function makeBookingRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SB-${suffix}`;
}

/**
 * Finalize a newly-created booking after captured money is trusted. The caller
 * already holds the room advisory lock followed by the booking advisory lock.
 * Keeping this transition in the payment ledger means checkout, webhook and
 * reconciliation all share one idempotent path.
 */
async function finalizeCapturedPendingBooking(tx: Tx, booking: any): Promise<any> {
  if (booking.status !== "pending_payment") return booking;

  const now = new Date();
  if (!booking.paymentHoldExpiresAt || booking.paymentHoldExpiresAt <= now) {
    const [expired] = await tx
      .update(bookingsTable)
      .set({ status: "expired", paymentHoldExpiresAt: null })
      .where(and(
        eq(bookingsTable.id, booking.id),
        eq(bookingsTable.status, "pending_payment"),
      ))
      .returning();
    return expired ?? { ...booking, status: "expired" };
  }

  const [room] = await tx
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, booking.roomId));
    if (!room) {
      const [expired] = await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, booking.id),
          eq(bookingsTable.status, "pending_payment"),
        ))
        .returning();
      return expired ?? { ...booking, status: "expired", paymentHoldExpiresAt: null };
    }
  const booked = await bookedRoomsCount(
    room.id,
    booking.checkIn,
    booking.checkOut,
    tx,
    booking.id,
  );
  if (room.totalRooms - booked < booking.roomsCount) {
    const [expired] = await tx
      .update(bookingsTable)
      .set({ status: "expired", paymentHoldExpiresAt: null })
      .where(and(
        eq(bookingsTable.id, booking.id),
        eq(bookingsTable.status, "pending_payment"),
      ))
      .returning();
    return expired ?? { ...booking, status: "expired", paymentHoldExpiresAt: null };
  }

  // The nullable unique index makes this retry-safe even when two trusted
  // capture observations race one another.
  let bookingRef = makeBookingRef();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [conflict] = await tx
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, bookingRef))
      .limit(1);
    if (!conflict) break;
    bookingRef = makeBookingRef();
  }
  const [confirmed] = await tx
    .update(bookingsTable)
    .set({
      status: "confirmed",
      bookingRef,
      paymentHoldExpiresAt: null,
    })
    .where(and(
      eq(bookingsTable.id, booking.id),
      eq(bookingsTable.status, "pending_payment"),
    ))
    .returning();
  if (!confirmed) return booking;

  // Coupon use is intentionally deferred until capture. Revalidate inside the
  // coupon advisory lock, but never alter the already-charged booking amount.
  if (confirmed.couponCode) {
    const [coupon] = await tx
      .select()
      .from(couponsTable)
      .where(eq(sql`upper(${couponsTable.code})`, confirmed.couponCode.toUpperCase()));
    const user = confirmed.userId
      ? (await tx.select().from(usersTable).where(eq(usersTable.id, confirmed.userId)))[0]
      : null;
    const today = new Date().toISOString().slice(0, 10);
    const couponStillValid =
      coupon &&
      coupon.active &&
      (!coupon.startsAt || coupon.startsAt <= today) &&
      (!coupon.expiresAt || coupon.expiresAt >= today) &&
      (coupon.audience === "all" || coupon.audience === user?.role) &&
      (!coupon.minAmount || confirmed.totalAmount + (confirmed.discountAmount ?? 0) >= coupon.minAmount);
    if (couponStillValid) {
      await lockCoupon(tx, coupon.id);
      const [used] = await tx
        .select({ value: count() })
        .from(couponRedemptionsTable)
        .where(and(
          eq(couponRedemptionsTable.couponId, coupon.id),
          eq(couponRedemptionsTable.status, "applied"),
        ));
      const [userUsed] = confirmed.userId
        ? await tx
            .select({ value: count() })
            .from(couponRedemptionsTable)
            .where(and(
              eq(couponRedemptionsTable.couponId, coupon.id),
              eq(couponRedemptionsTable.userId, confirmed.userId),
              eq(couponRedemptionsTable.status, "applied"),
            ))
        : [{ value: 0 }];
      if (
        (coupon.totalUsageLimit == null || Number(used?.value ?? 0) < coupon.totalUsageLimit) &&
        (coupon.perUserUsageLimit == null || Number(userUsed?.value ?? 0) < coupon.perUserUsageLimit) &&
        confirmed.discountAmount != null
      ) {
        await tx.insert(couponRedemptionsTable).values({
          couponId: coupon.id,
          bookingId: confirmed.id,
          userId: confirmed.userId,
          discountAmount: confirmed.discountAmount,
        });
      }
    }
  }

  const property = (await tx
    .select({ ownerId: propertiesTable.ownerId })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, confirmed.propertyId)))[0];
  const recipientIds = [confirmed.agentId, property?.ownerId].filter(
    (id): id is string => Boolean(id),
  );
  if (recipientIds.length) {
    const [terms, recipientRows] = await Promise.all([
      tx.select().from(commercialTermsTable).where(inArray(commercialTermsTable.userId, recipientIds)),
      tx.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, recipientIds)),
    ]);
    const termByUser = new Map<string, any>(
      terms.map((term: any) => [term.userId, term]),
    );
    const roleByUser = new Map(recipientRows.map((user: any) => [user.id, user.role]));
    const allocations: any[] = [];
    const addAllocation = (userId: string | null, type: "agent" | "partner") => {
      if (!userId || roleByUser.get(userId) !== type) return;
      const term = termByUser.get(userId);
      const value = term && Number.isFinite(term.value) && term.value > 0 ? term.value : 0;
      const mode = term?.mode === "fixed" ? "fixed" : "percentage";
      const amount = mode === "fixed"
        ? Math.min(confirmed.totalAmount, value)
        : Math.min(confirmed.totalAmount, (confirmed.totalAmount * Math.min(value, 100)) / 100);
      allocations.push({
        bookingId: confirmed.id,
        recipientUserId: userId,
        allocationType: type,
        termMode: mode,
        termValue: value,
        amount,
        status: "pending",
      });
    };
    addAllocation(confirmed.agentId, "agent");
    addAllocation(property?.ownerId ?? null, "partner");
    if (allocations.length) {
      const ledgerEntries = await tx.insert(commissionLedgerTable).values(allocations).returning();
      await tx.insert(commissionLedgerEventsTable).values(
        ledgerEntries.map((entry: any) => ({
          ledgerId: entry.id,
          actorUserId: confirmed.userId ?? null,
          fromStatus: null,
          toStatus: "pending",
          reason: "allocation_created_after_capture",
        })),
      );
    }
  }
  return confirmed;
}

export function bookingTotalMinor(totalAmount: number): number {
  const amountMinor = Math.round(totalAmount * 100);
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > 2_147_483_647
  ) {
    throw new RazorpayLedgerError(
      "invoice_mismatch",
      "This booking has an invalid payable amount",
    );
  }
  return amountMinor;
}

function paymentSummaryDto(input: Omit<PaymentSummary, "status"> & {
  status: PaymentSummary["status"];
}): PaymentSummary {
  return input;
}

export function derivePaymentSummary(input: {
  amountMinor: number;
  externalPayments: Array<{
    status: string;
    amountMinor: number;
    refundRequired: boolean;
    externalOrderId: string;
    externalPaymentId: string;
    verifiedAt: Date | null;
    createdAt: Date;
  }>;
  orders: Array<{
    status: string;
    externalOrderId: string;
  }>;
  invoiceRows: Array<{
    amountMinor: number;
    method: string;
  }>;
}): PaymentSummary {
  const { amountMinor, externalPayments, orders, invoiceRows } = input;
  const capturedPayments = externalPayments.filter(
    (payment) => payment.status === "captured",
  );
  const latestExternal = externalPayments[0] ?? null;
  // Prefer a captured payment for the visible identity. A newer failed or
  // authorized attempt must not hide the older attempt that actually paid.
  const displayExternal = capturedPayments[0] ?? latestExternal;
  // A failed attempt does not make the order terminal while any payment
  // attempt remains authorized. Razorpay can report attempts out of order,
  // so this must not be derived from only the newest ledger row.
  const authorized = externalPayments.some(
    (payment) => payment.status === "authorized",
  );
  const onlinePaidMinor = capturedPayments.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0,
  );
  const manualRows = invoiceRows.filter((row) => row.method !== "razorpay");
  const manualPaidMinor = manualRows.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0,
  );
  const hasManual = manualRows.length > 0;
  const hasPendingOrder = orders.some((order) =>
    ["created", "attempted"].includes(order.status),
  );
  const requiresRefund = externalPayments.some(
    (payment) => payment.status === "captured" && payment.refundRequired,
  );
  const paidMinor = onlinePaidMinor > 0 ? onlinePaidMinor : manualPaidMinor;
  const provider: PaymentSummary["provider"] =
    externalPayments.length > 0
      ? "razorpay"
      : hasManual
        ? "manual"
        : "none";
  let status: PaymentSummary["status"] = "unpaid";
  if (requiresRefund) status = "refund_required";
  else if (onlinePaidMinor >= amountMinor || manualPaidMinor >= amountMinor) {
    status = "paid";
  } else if (authorized || hasPendingOrder) {
    status = "processing";
  } else if (
    latestExternal?.status === "failed" ||
    (latestExternal !== null && externalPayments.every((p) => p.status === "failed"))
  ) {
    status = "failed";
  }

  const latestVerified = externalPayments.find((payment) => payment.verifiedAt);
  return paymentSummaryDto({
    status,
    provider,
    currency: "INR",
    amountMinor,
    paidMinor,
    dueMinor: Math.max(0, amountMinor - paidMinor),
    orderId: displayExternal?.externalOrderId ?? orders[0]?.externalOrderId ?? null,
    paymentId: displayExternal?.externalPaymentId ?? null,
    verifiedAt: latestVerified?.verifiedAt?.toISOString() ?? null,
    requiresRefund,
  });
}

/**
 * Payment state is derived from immutable booking money and the two existing
 * accounting sources. A Razorpay invoice payment is not added a second time
 * because the external ledger is the authoritative online-money record.
 */
export async function loadPaymentSummary(
  bookingId: number,
): Promise<PaymentSummary | null> {
  const [booking] = await db
    .select({ totalAmount: bookingsTable.totalAmount })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return null;

  const amountMinor = bookingTotalMinor(booking.totalAmount);
  const [externalPayments, orders, invoiceRows] = await Promise.all([
    db
      .select()
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.bookingId, bookingId))
      .orderBy(desc(razorpayPaymentsTable.createdAt), desc(razorpayPaymentsTable.id)),
    db
      .select()
      .from(razorpayOrdersTable)
      .where(eq(razorpayOrdersTable.bookingId, bookingId))
      .orderBy(desc(razorpayOrdersTable.createdAt), desc(razorpayOrdersTable.id)),
    db
      .select({
        amountMinor: invoicePaymentsTable.amountMinor,
        method: invoicePaymentsTable.method,
      })
      .from(invoicePaymentsTable)
      .innerJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
      .where(eq(invoicesTable.bookingId, bookingId)),
  ]);

  return derivePaymentSummary({ amountMinor, externalPayments, orders, invoiceRows });
}

type Tx = any;

async function createBookingInvoicePayment(
  tx: Tx,
  bookingId: number,
  paymentId: string,
  amountMinor: number,
): Promise<{ ok: true } | { ok: false; reason: "mixed" | "mismatch" }> {
  const [booking] = await tx
    .select({
      id: bookingsTable.id,
      bookingRef: bookingsTable.bookingRef,
      guestName: bookingsTable.guestName,
      guestEmail: bookingsTable.guestEmail,
      guestPhone: bookingsTable.guestPhone,
      totalAmount: bookingsTable.totalAmount,
      propertyName: propertiesTable.name,
      roomName: roomsTable.name,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
    })
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return { ok: false, reason: "mismatch" };

  const linkedInvoices = await tx
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.bookingId, bookingId))
    .orderBy(invoicesTable.id);
  let invoice = linkedInvoices[0];
  if (linkedInvoices.length > 1) return { ok: false, reason: "mismatch" };
  if (invoice && invoice.totalMinor !== amountMinor) {
    return { ok: false, reason: "mismatch" };
  }

  if (invoice) {
    const payments = await tx
      .select()
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoice.id));
    if (payments.some((payment: any) => payment.method !== "razorpay")) {
      return { ok: false, reason: "mixed" };
    }
    if (payments.some((payment: any) => payment.reference !== paymentId)) {
      return { ok: false, reason: "mixed" };
    }
  } else {
    const [created] = await tx
      .insert(invoicesTable)
      .values({
        invoiceNumber: `SB-INV-${new Date().getUTCFullYear()}-${randomUUID()
          .replace(/-/g, "")
          .slice(0, 10)
          .toUpperCase()}`,
        bookingId,
        customerName: booking.guestName,
        customerEmail: booking.guestEmail,
        customerPhone: booking.guestPhone,
        customerAddress: null,
        bookingSnapshotRef: booking.bookingRef,
        bookingSnapshotPropertyName: booking.propertyName,
        bookingSnapshotRoomName: booking.roomName,
        bookingSnapshotCheckIn: booking.checkIn,
        bookingSnapshotCheckOut: booking.checkOut,
        bookingSnapshotTotalMinor: amountMinor,
        issueDate: currentBusinessDate(),
        dueDate: currentBusinessDate(),
        currency: "INR",
        subtotalMinor: amountMinor,
        taxMinor: 0,
        totalMinor: amountMinor,
      })
      .returning();
    invoice = created;
    if (!invoice) return { ok: false, reason: "mismatch" };
    await tx.insert(invoiceLineItemsTable).values({
      invoiceId: invoice.id,
      description: booking.bookingRef
        ? `StayBest booking ${booking.bookingRef}`
        : `StayBest booking #${booking.id}`,
      quantity: 1,
      unitPriceMinor: amountMinor,
      taxRateBps: 0,
      taxMinor: 0,
      totalMinor: amountMinor,
    });
  }

  const idempotencyKey = `razorpay:${paymentId}`;
  const [existingPayment] = await tx
    .select()
    .from(invoicePaymentsTable)
    .where(
      and(
        eq(invoicePaymentsTable.invoiceId, invoice.id),
        eq(invoicePaymentsTable.idempotencyKey, idempotencyKey),
      ),
    );
  if (existingPayment) return { ok: true };
  await tx.insert(invoicePaymentsTable).values({
    invoiceId: invoice.id,
    amountMinor,
    paymentDate: currentBusinessDate(),
    method: "razorpay",
    reference: paymentId,
    idempotencyKey,
  });
  return { ok: true };
}

export async function recordRazorpayPayment(input: {
  bookingId: number;
  externalOrderId: string;
  externalPaymentId: string;
  amountMinor: number;
  currency: string;
  mode: string;
  status: ExternalPaymentStatus;
  source: "checkout" | "webhook" | "reconciliation";
  failureCode?: string | null;
  failureDescription?: string | null;
}): Promise<PaymentSummary> {
  await db.transaction(async (tx) => {
    // Capture paths and reservation paths share the same lock order: room
    // inventory first, then the booking row. This prevents a provider capture
    // racing a cancellation/hold transition from deadlocking.
    const [lockBooking] = await tx
      .select({ roomId: bookingsTable.roomId })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, input.bookingId));
    if (!lockBooking) {
      throw new RazorpayLedgerError("missing_booking", "Booking not found");
    }
    await lockRoomAndBooking(tx, lockBooking.roomId, input.bookingId);
    const [booking] = await tx
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, input.bookingId));
    if (!booking) {
      throw new RazorpayLedgerError("missing_booking", "Booking not found");
    }
    const [order] = await tx
      .select()
      .from(razorpayOrdersTable)
      .where(
        and(
          eq(razorpayOrdersTable.bookingId, input.bookingId),
          eq(razorpayOrdersTable.externalOrderId, input.externalOrderId),
        ),
      );
    if (!order) {
      throw new RazorpayLedgerError("order_mismatch", "Razorpay order is not linked to this booking");
    }
    if (
      order.amountMinor !== input.amountMinor ||
      order.currency !== input.currency ||
      order.mode !== input.mode
    ) {
      throw new RazorpayLedgerError(
        "order_mismatch",
        "Razorpay payment details do not match the booking order",
      );
    }

    const [existing] = await tx
      .select()
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.externalPaymentId, input.externalPaymentId));
    if (existing && existing.bookingId !== input.bookingId) {
      throw new RazorpayLedgerError(
        "payment_conflict",
        "Razorpay payment is already linked to another booking",
      );
    }
    if (existing && existing.status === "captured" && input.status !== "captured") {
      return;
    }

    const now = new Date();
    let ledger = existing;
    if (ledger) {
      [ledger] = await tx
        .update(razorpayPaymentsTable)
        .set({
          status: input.status,
          source: ledger.source,
          failureCode: input.failureCode ?? ledger.failureCode,
          failureDescription:
            input.failureDescription ?? ledger.failureDescription,
          verifiedAt: now,
          capturedAt:
            input.status === "captured" ? ledger.capturedAt ?? now : ledger.capturedAt,
          updatedAt: now,
        })
        .where(eq(razorpayPaymentsTable.id, ledger.id))
        .returning();
    } else {
      [ledger] = await tx
        .insert(razorpayPaymentsTable)
        .values({
          bookingId: input.bookingId,
          orderId: order.id,
          externalPaymentId: input.externalPaymentId,
          externalOrderId: input.externalOrderId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          mode: input.mode,
          status: input.status,
          source: input.source,
          failureCode: input.failureCode ?? null,
          failureDescription: input.failureDescription ?? null,
          refundRequired: false,
          verifiedAt: now,
          capturedAt: input.status === "captured" ? now : null,
        })
        .returning();
    }
    if (!ledger) throw new RazorpayLedgerError("payment_conflict", "Payment ledger write failed");

    if (input.status === "failed") {
      const [capturedForOrder] = await tx
        .select({ id: razorpayPaymentsTable.id })
        .from(razorpayPaymentsTable)
        .where(
          and(
            eq(razorpayPaymentsTable.orderId, order.id),
            eq(razorpayPaymentsTable.status, "captured"),
          ),
        )
        .limit(1);
      const [authorizedForOrder] = await tx
        .select({ id: razorpayPaymentsTable.id })
        .from(razorpayPaymentsTable)
        .where(
          and(
            eq(razorpayPaymentsTable.orderId, order.id),
            eq(razorpayPaymentsTable.status, "authorized"),
          ),
        )
        .limit(1);
      // A failed attempt does not terminate an order that still has another
      // authorized attempt. Keeping it unresolved lets reconciliation and
      // checkout safely reuse the same order instead of creating a duplicate.
      if (!capturedForOrder && !authorizedForOrder) {
        await tx
          .update(razorpayOrdersTable)
          .set({ status: "failed", updatedAt: now })
          .where(eq(razorpayOrdersTable.id, order.id));
      }
      return;
    }
    if (input.status === "authorized") {
      // Provider events can arrive out of order: an authorization for this
      // order may be observed after a failed attempt. Re-open the local order
      // as unresolved so checkout reuses it instead of creating a duplicate.
      const [capturedForOrder] = await tx
        .select({ id: razorpayPaymentsTable.id })
        .from(razorpayPaymentsTable)
        .where(
          and(
            eq(razorpayPaymentsTable.orderId, order.id),
            eq(razorpayPaymentsTable.status, "captured"),
          ),
        )
        .limit(1);
      if (!capturedForOrder) {
        await tx
          .update(razorpayOrdersTable)
          .set({ status: "attempted", updatedAt: now })
          .where(eq(razorpayOrdersTable.id, order.id));
      }
      return;
    }
    if (input.status !== "captured") return;

    const otherCaptured = await tx
      .select()
      .from(razorpayPaymentsTable)
      .where(
        and(
          eq(razorpayPaymentsTable.bookingId, input.bookingId),
          eq(razorpayPaymentsTable.status, "captured"),
        ),
      );
    const hasDifferentCaptured = otherCaptured.some(
      (payment: any) => payment.externalPaymentId !== input.externalPaymentId,
    );
    const invoicePayments = await tx
      .select({ method: invoicePaymentsTable.method })
      .from(invoicePaymentsTable)
      .innerJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
      .where(eq(invoicesTable.bookingId, input.bookingId));
    const hasManualPayment = invoicePayments.some(
      (payment: any) => payment.method !== "razorpay",
    );
    // Finalize the reservation before creating its invoice snapshot. This is
    // the only point at which a new public booking reference can be assigned.
    const effectiveBooking =
      booking.status === "pending_payment"
        ? await finalizeCapturedPendingBooking(tx, booking)
        : booking;
    let refundRequired =
      effectiveBooking.status === "cancelled" ||
      effectiveBooking.status === "completed" ||
      effectiveBooking.status === "expired" ||
      hasDifferentCaptured ||
      hasManualPayment;
    // A late capture still receives an invoice snapshot/payment ledger so
    // operators can record a manual refund. It must never restore booking
    // availability or change the cancelled/completed booking status.
    if (!hasDifferentCaptured && !hasManualPayment) {
      const invoiceResult = await createBookingInvoicePayment(
        tx,
        input.bookingId,
        input.externalPaymentId,
        input.amountMinor,
      );
      if (!invoiceResult.ok) refundRequired = true;
    }
    if (refundRequired) {
      await tx
        .update(razorpayPaymentsTable)
        .set({ refundRequired: true, updatedAt: now })
        .where(eq(razorpayPaymentsTable.id, ledger.id));
    }
    await tx
      .update(razorpayOrdersTable)
      .set({ status: "paid", updatedAt: now })
      .where(eq(razorpayOrdersTable.id, order.id));

  });

  const summary = await loadPaymentSummary(input.bookingId);
  if (!summary) throw new RazorpayLedgerError("missing_booking", "Booking not found");
  return summary;
}
