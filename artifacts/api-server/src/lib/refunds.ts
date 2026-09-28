import { desc, eq, sql } from "drizzle-orm";
import {
  bookingRefundsTable,
  bookingsTable,
  db,
  invoicePaymentsTable,
  invoicesTable,
  type BookingRefund,
} from "@workspace/db";

export type BookingRefundSummaryDto = {
  status: "none" | "partial" | "full";
  grossPaidMinor: number;
  refundedMinor: number;
  netPaidMinor: number;
  remainingRefundableMinor: number;
  refundableReason: string | null;
  availablePaymentSources: Array<{
    invoicePaymentId: number;
    invoiceId: number;
    invoiceNumber: string;
    amountMinor: number;
    refundedMinor: number;
    remainingMinor: number;
    paymentDate: string;
    method: "cash" | "upi" | "bank" | "card" | "other" | "razorpay";
    reference: string | null;
  }>;
  refunds: Array<{
    id: number;
    bookingId: number;
    invoiceId: number;
    invoicePaymentId: number;
    amountMinor: number;
    refundDate: string;
    reason: string;
    reference: string | null;
    method: "cash" | "upi" | "bank" | "card" | "other";
    actorUserId: string | null;
    idempotencyKey: string;
    createdAt: string;
  }>;
};

export function mapBookingRefund(refund: BookingRefund): BookingRefundSummaryDto["refunds"][number] {
  return {
    id: refund.id,
    bookingId: refund.bookingId,
    invoiceId: refund.invoiceId,
    invoicePaymentId: refund.invoicePaymentId,
    amountMinor: refund.amountMinor,
    refundDate: refund.refundDate,
    reason: refund.reason,
    reference: refund.reference,
    method: refund.method as BookingRefundSummaryDto["refunds"][number]["method"],
    actorUserId: refund.actorUserId,
    idempotencyKey: refund.idempotencyKey,
    createdAt: refund.createdAt.toISOString(),
  };
}

/**
 * Invoice payments are the only reliable paid source.  A payment is eligible
 * only when its invoice is linked to the booking; booking totals and
 * cancellation status are intentionally not used as payment evidence.
 */
export async function loadBookingRefundSummary(
  bookingId: number,
): Promise<BookingRefundSummaryDto | null> {
  const [booking] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return null;

  const [sources, refunds] = await Promise.all([
    db
      .select({
        invoicePaymentId: invoicePaymentsTable.id,
        invoiceId: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        amountMinor: invoicePaymentsTable.amountMinor,
        paymentDate: invoicePaymentsTable.paymentDate,
        method: invoicePaymentsTable.method,
        reference: invoicePaymentsTable.reference,
      })
      .from(invoicePaymentsTable)
      .innerJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
      .where(eq(invoicesTable.bookingId, bookingId))
      .orderBy(desc(invoicePaymentsTable.paymentDate), desc(invoicePaymentsTable.id)),
    db
      .select()
      .from(bookingRefundsTable)
      .where(eq(bookingRefundsTable.bookingId, bookingId))
      .orderBy(desc(bookingRefundsTable.refundDate), desc(bookingRefundsTable.id)),
  ]);

  const refundedByPayment = new Map<number, number>();
  for (const refund of refunds) {
    refundedByPayment.set(
      refund.invoicePaymentId,
      (refundedByPayment.get(refund.invoicePaymentId) ?? 0) + refund.amountMinor,
    );
  }
  const availablePaymentSources = sources
    .map((source) => {
      const refundedMinor = refundedByPayment.get(source.invoicePaymentId) ?? 0;
      return {
        invoicePaymentId: source.invoicePaymentId,
        invoiceId: source.invoiceId,
        invoiceNumber: source.invoiceNumber,
        amountMinor: source.amountMinor,
        refundedMinor,
        remainingMinor: Math.max(0, source.amountMinor - refundedMinor),
        paymentDate: source.paymentDate,
        method: source.method as BookingRefundSummaryDto["availablePaymentSources"][number]["method"],
        reference: source.reference,
      };
    })
    .filter((source) => source.remainingMinor > 0);

  const grossPaidMinor = sources.reduce((sum, source) => sum + source.amountMinor, 0);
  const refundedMinor = refunds.reduce((sum, refund) => sum + refund.amountMinor, 0);
  const remainingRefundableMinor = availablePaymentSources.reduce(
    (sum, source) => sum + source.remainingMinor,
    0,
  );
  const status =
    grossPaidMinor === 0 || refundedMinor === 0
      ? "none"
      : remainingRefundableMinor === 0
        ? "full"
        : "partial";

  return {
    status,
    grossPaidMinor,
    refundedMinor,
    netPaidMinor: Math.max(0, grossPaidMinor - refundedMinor),
    remainingRefundableMinor,
    refundableReason:
      sources.length === 0
        ? "No recorded invoice payments are linked to this booking; legacy bookings have 0 refundable amount."
        : remainingRefundableMinor === 0
          ? "All recorded payments linked to this booking have already been refunded."
          : null,
    availablePaymentSources,
    refunds: refunds.map(mapBookingRefund),
  };
}

export async function loadInvoiceRefunds(invoiceId: number): Promise<BookingRefund[]> {
  return db
    .select()
    .from(bookingRefundsTable)
    .where(eq(bookingRefundsTable.invoiceId, invoiceId))
    .orderBy(desc(bookingRefundsTable.refundDate), desc(bookingRefundsTable.id));
}

export async function sumInvoiceRefunds(invoiceId: number): Promise<number> {
  const [row] = await db
    .select({
      amountMinor: sql<number>`coalesce(sum(${bookingRefundsTable.amountMinor}), 0)::int`,
    })
    .from(bookingRefundsTable)
    .where(eq(bookingRefundsTable.invoiceId, invoiceId));
  return Number(row?.amountMinor ?? 0);
}