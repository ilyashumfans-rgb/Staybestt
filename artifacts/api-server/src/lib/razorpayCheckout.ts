import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bookingsTable,
  db,
  invoicePaymentsTable,
  invoicesTable,
  razorpayOrdersTable,
  razorpayPaymentsTable,
} from "@workspace/db";
import {
  bookingTotalMinor,
  loadPaymentSummary,
  RazorpayLedgerError,
  recordRazorpayPayment,
} from "./razorpay";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  getRazorpayConfig,
  getRazorpayReadinessWithProbe,
  RazorpayProviderError,
  verifyRazorpayCheckoutSignature,
  getRazorpayReadiness,
} from "./razorpayProvider";
import { lockRoomAndBooking } from "./advisoryLocks";

export type RazorpayCheckoutInput = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type RazorpayPaymentEntity = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  error_code?: string | null;
  error_description?: string | null;
};

export type RazorpayOrderResult = {
  orderId: string;
  bookingId: number;
  amountMinor: number;
  currency: string;
  receipt: string;
  keyId: string;
  mode: string;
  status: string;
};

export function providerFailureMessage(error: unknown): string {
  if (error instanceof RazorpayProviderError && error.providerStatus === 401) {
    return "Razorpay credentials were rejected. Contact support.";
  }
  return "Razorpay is temporarily unavailable. Please try again.";
}

/**
 * Create or reuse the one active provider order for a booking.
 *
 * This function intentionally takes plain booking ids rather than Express
 * requests. The browser owner route and the mobile checkout route therefore
 * share the exact amount, lock, and ledger guards without impersonating one
 * another through a fabricated request object.
 */
export async function createRazorpayOrderForBooking(
  bookingId: number,
  expectedMode?: string,
): Promise<{ order: RazorpayOrderResult; keyId: string }> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new RazorpayProviderError(
      "Razorpay online payments are not configured",
    );
  }
  const syncReadiness = getRazorpayReadiness();
  const probe = getRazorpayReadinessWithProbe as unknown as
    | (() => Promise<typeof syncReadiness>)
    | undefined;
  const readiness = probe ? await probe() : syncReadiness;
  const paymentAllowed = Object.prototype.hasOwnProperty.call(readiness, "paymentAllowed")
    ? readiness.paymentAllowed
    : readiness.configured &&
      !(process.env.NODE_ENV !== "production" && readiness.mode === "live");
  if (!paymentAllowed) {
    throw new RazorpayProviderError(
      "Razorpay online payments are not ready for new orders",
    );
  }
  if (config.mode === "live" && process.env.NODE_ENV !== "production") {
    throw new RazorpayProviderError(
      "Live Razorpay payments are disabled outside production",
    );
  }
  if (expectedMode && config.mode !== expectedMode) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay mode changed; this checkout session cannot be reused",
    );
  }

  const order = await db.transaction(async (tx) => {
    const [unlockedBooking] = await tx
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));
    if (!unlockedBooking) {
      throw new RazorpayLedgerError(
        "order_mismatch",
        "Only an owned booking can accept online payment",
      );
    }
    await lockRoomAndBooking(tx, unlockedBooking.roomId, bookingId);
    const [lockedBooking] = await tx
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));
    if (!lockedBooking) {
      throw new RazorpayLedgerError(
        "order_mismatch",
        "Only an owned booking can accept online payment",
      );
    }
    const booking = lockedBooking;
    if (
      booking.status === "pending_payment" &&
      (!booking.paymentHoldExpiresAt || booking.paymentHoldExpiresAt.getTime() <= Date.now())
    ) {
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, bookingId),
          eq(bookingsTable.status, "pending_payment"),
        ));
      throw new RazorpayLedgerError(
        "payment_hold_expired",
        "This payment hold expired. Start a new booking to select these dates again.",
      );
    }
    if (!["pending_payment", "confirmed"].includes(booking.status)) {
      throw new RazorpayLedgerError(
        "order_mismatch",
        "Only a pending payment hold or a legacy confirmed booking can accept online payment",
      );
    }

    const [capturedPayment] = await tx
      .select({ id: razorpayPaymentsTable.id })
      .from(razorpayPaymentsTable)
      .where(
        and(
          eq(razorpayPaymentsTable.bookingId, bookingId),
          eq(razorpayPaymentsTable.status, "captured"),
        ),
      )
      .limit(1);
    if (capturedPayment) {
      throw new RazorpayLedgerError(
        "payment_conflict",
        "This booking already has a recorded payment",
      );
    }

    const [manualPayment] = await tx
      .select({ id: invoicePaymentsTable.id })
      .from(invoicePaymentsTable)
      .innerJoin(
        invoicesTable,
        eq(invoicePaymentsTable.invoiceId, invoicesTable.id),
      )
      .where(
        and(
          eq(invoicesTable.bookingId, bookingId),
          sql`${invoicePaymentsTable.method} <> 'razorpay'`,
        ),
      )
      .limit(1);
    if (manualPayment) {
      throw new RazorpayLedgerError(
        "payment_conflict",
        "This booking already has a recorded manual payment",
      );
    }

    const pending = await tx
      .select()
      .from(razorpayOrdersTable)
      .where(
        and(
          eq(razorpayOrdersTable.bookingId, bookingId),
          eq(razorpayOrdersTable.mode, config.mode),
          inArray(razorpayOrdersTable.status, ["created", "attempted"]),
        ),
      )
      .orderBy(desc(razorpayOrdersTable.createdAt), desc(razorpayOrdersTable.id));
    if (pending[0]) return pending[0];

    const [attemptRow] = await tx
      .select({
        maxAttempt: sql<number>`coalesce(max(${razorpayOrdersTable.attempt}), 0)::int`,
      })
      .from(razorpayOrdersTable)
      .where(eq(razorpayOrdersTable.bookingId, bookingId));
    const attempt = Number(attemptRow?.maxAttempt ?? 0) + 1;
    // The provider receipt is an internal payment identifier, not the public
    // booking reference. New pending bookings deliberately have no ref yet.
    const receipt = `SB-PAY-${booking.id}-${attempt}`;
    const amountMinor = bookingTotalMinor(booking.totalAmount);
    const external = await createRazorpayOrder({
      amountMinor,
      receipt,
      notes: {
        booking_id: String(booking.id),
        ...(booking.bookingRef ? { booking_ref: booking.bookingRef } : {}),
      },
    });
    const [created] = await tx
      .insert(razorpayOrdersTable)
      .values({
        bookingId,
        externalOrderId: external.id,
        receipt,
        attempt,
        amountMinor,
        currency: "INR",
        mode: config.mode,
        status: "created",
      })
      .returning();
    if (!created) {
      throw new RazorpayProviderError("Razorpay order could not be recorded");
    }
    return created;
  });

  return {
    keyId: config.keyId,
    order: {
      orderId: order.externalOrderId,
      bookingId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      receipt: order.receipt,
      keyId: config.keyId,
      mode: order.mode,
      status: order.status,
    },
  };
}

function assertProviderPaymentMatchesOrder(
  payment: RazorpayPaymentEntity,
  orderId: string,
  amountMinor: number,
): void {
  if (
    payment.order_id !== orderId ||
    payment.amount !== amountMinor ||
    payment.currency !== "INR" ||
    (payment.status === "captured" && payment.captured !== true) ||
    !["authorized", "captured", "failed"].includes(payment.status)
  ) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay payment details do not match the booking order",
    );
  }
}

/**
 * Verify and record a provider payment for a booking. Unlike order creation,
 * this deliberately does not require a confirmed booking: a late capture
 * after cancellation is recorded by the ledger as refund_required.
 */
export async function verifyRazorpayPaymentForBooking(
  bookingId: number,
  input: RazorpayCheckoutInput,
  expectedMode?: string,
): Promise<Awaited<ReturnType<typeof loadPaymentSummary>>> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new RazorpayProviderError(
      "Razorpay online payments are not configured",
    );
  }
  if (expectedMode && config.mode !== expectedMode) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay mode changed; this checkout session cannot be reused",
    );
  }
  const [order] = await db
    .select()
    .from(razorpayOrdersTable)
    .where(
      and(
        eq(razorpayOrdersTable.bookingId, bookingId),
        eq(razorpayOrdersTable.externalOrderId, input.razorpayOrderId),
      ),
    );
  if (!order || order.mode !== config.mode) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay order does not match this booking",
    );
  }
  if (
    !verifyRazorpayCheckoutSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
      config.keySecret,
    )
  ) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Invalid Razorpay payment signature",
    );
  }
  const payment = await fetchRazorpayPayment(input.razorpayPaymentId);
  assertProviderPaymentMatchesOrder(payment, order.externalOrderId, order.amountMinor);
  return recordRazorpayPayment({
    bookingId,
    externalOrderId: order.externalOrderId,
    externalPaymentId: payment.id,
    amountMinor: payment.amount,
    currency: payment.currency,
    mode: config.mode,
    status: payment.status as "authorized" | "captured" | "failed",
    source: "checkout",
    failureCode: payment.error_code,
    failureDescription: payment.error_description,
  });
}

export function assertReconciliationPaymentMatchesOrder(
  payment: RazorpayPaymentEntity,
  orderId: string,
): void {
  if (
    payment.order_id !== orderId ||
    payment.amount <= 0 ||
    payment.currency !== "INR"
  ) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay payment details do not match the booking order",
    );
  }
  if (payment.status === "captured" && payment.captured !== true) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay payment is not confirmed as captured",
    );
  }
  if (!["authorized", "captured", "failed"].includes(payment.status)) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay returned an unsupported payment status",
    );
  }
}

export async function reconcileProviderPaymentForBooking(
  bookingId: number,
  orderId: string,
  mode: string,
  payment: RazorpayPaymentEntity,
) {
  assertReconciliationPaymentMatchesOrder(payment, orderId);
  return recordRazorpayPayment({
    bookingId,
    externalOrderId: orderId,
    externalPaymentId: payment.id,
    amountMinor: payment.amount,
    currency: payment.currency,
    mode,
    status: payment.status as "captured" | "authorized" | "failed",
    source: "reconciliation",
    failureCode: payment.error_code,
    failureDescription: payment.error_description,
  });
}

const reconciliationLastRun = new Map<number, number>();

/**
 * Reconcile every historical order attempt. This is shared by the normal
 * owner status route and the scoped mobile status route, including after a
 * local paid state so duplicate/late captures are surfaced.
 */
export async function getRazorpayPaymentStatusForBooking(
  bookingId: number,
): Promise<
  | {
      summary: Awaited<ReturnType<typeof loadPaymentSummary>>;
      throttled: false;
    }
  | { summary: Awaited<ReturnType<typeof loadPaymentSummary>>; throttled: true }
> {
  let summary = await loadPaymentSummary(bookingId);
  if (!summary) return { summary: null, throttled: false };
  const orders = await db
    .select()
    .from(razorpayOrdersTable)
    .where(eq(razorpayOrdersTable.bookingId, bookingId))
    .orderBy(desc(razorpayOrdersTable.createdAt), desc(razorpayOrdersTable.id));
  if (orders.length === 0) return { summary, throttled: false };

  const now = Date.now();
  const last = reconciliationLastRun.get(bookingId) ?? 0;
  if (now - last < 2_000) return { summary, throttled: true };
  reconciliationLastRun.set(bookingId, now);

  const config = getRazorpayConfig();
  if (!config) return { summary, throttled: false };
  const matchingOrders = orders.filter((order) => order.mode === config.mode);
  if (matchingOrders.length === 0) {
    throw new RazorpayLedgerError(
      "order_mismatch",
      "Razorpay mode changed; this order cannot be reconciled",
    );
  }
  for (const order of matchingOrders) {
    const payments = await fetchRazorpayOrderPayments(order.externalOrderId);
    for (const payment of payments) {
      summary = await reconcileProviderPaymentForBooking(
        bookingId,
        order.externalOrderId,
        config.mode,
        payment,
      );
    }
  }
  return { summary, throttled: false };
}