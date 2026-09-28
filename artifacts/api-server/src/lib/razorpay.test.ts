import { describe, expect, it } from "vitest";
import { bookingTotalMinor, derivePaymentSummary } from "./razorpay";

const date = new Date("2026-01-01T00:00:00.000Z");
function payment(
  status: "authorized" | "captured" | "failed",
  order: string,
  id: string,
  extra: Partial<{ refundRequired: boolean; amountMinor: number }> = {},
) {
  return {
    status,
    externalOrderId: order,
    externalPaymentId: id,
    amountMinor: extra.amountMinor ?? 10_000,
    refundRequired: extra.refundRequired ?? false,
    verifiedAt: date,
    createdAt: date,
  };
}

describe("Razorpay ledger state", () => {
  it("converts the persisted booking total to exact INR paise", () => {
    expect(bookingTotalMinor(123.45)).toBe(12_345);
    expect(() => bookingTotalMinor(0)).toThrow();
    expect(() => bookingTotalMinor(21_474_836.48)).toThrow();
  });

  it("keeps processing when an older attempt remains authorized after a failed attempt", () => {
    const summary = derivePaymentSummary({
      amountMinor: 10_000,
      externalPayments: [
        payment("failed", "order_2", "pay_failed"),
        payment("authorized", "order_1", "pay_authorized"),
      ],
      orders: [
        { status: "failed", externalOrderId: "order_2" },
        { status: "created", externalOrderId: "order_1" },
      ],
      invoiceRows: [],
    });
    expect(summary.status).toBe("processing");
    expect(summary.orderId).toBe("order_2");
  });

  it("finds an older captured attempt even when a newer attempt failed", () => {
    const summary = derivePaymentSummary({
      amountMinor: 10_000,
      externalPayments: [
        payment("failed", "order_2", "pay_failed"),
        payment("captured", "order_1", "pay_captured"),
      ],
      orders: [
        { status: "failed", externalOrderId: "order_2" },
        { status: "paid", externalOrderId: "order_1" },
      ],
      invoiceRows: [{ amountMinor: 10_000, method: "razorpay" }],
    });
    expect(summary.status).toBe("paid");
    expect(summary.paymentId).toBe("pay_captured");
    expect(summary.paidMinor).toBe(10_000);
  });

  it("flags duplicate or late-cancel captured money for manual refund", () => {
    const summary = derivePaymentSummary({
      amountMinor: 10_000,
      externalPayments: [
        payment("captured", "order_2", "pay_second", { amountMinor: 10_000, refundRequired: true }),
        payment("captured", "order_1", "pay_first", { amountMinor: 10_000 }),
      ],
      orders: [
        { status: "paid", externalOrderId: "order_2" },
        { status: "paid", externalOrderId: "order_1" },
      ],
      invoiceRows: [],
    });
    expect(summary.status).toBe("refund_required");
    expect(summary.paidMinor).toBe(20_000);
  });

  it("never treats an authorized payment as paid", () => {
    const summary = derivePaymentSummary({
      amountMinor: 10_000,
      externalPayments: [payment("authorized", "order_1", "pay_auth")],
      orders: [{ status: "created", externalOrderId: "order_1" }],
      invoiceRows: [],
    });
    expect(summary.status).toBe("processing");
    expect(summary.paidMinor).toBe(0);
  });

  it("keeps manual payments separate and reports a manual payment guard state", () => {
    const summary = derivePaymentSummary({
      amountMinor: 10_000,
      externalPayments: [],
      orders: [],
      invoiceRows: [{ amountMinor: 2_000, method: "cash" }],
    });
    expect(summary.provider).toBe("manual");
    expect(summary.status).toBe("unpaid");
    expect(summary.paidMinor).toBe(2_000);
  });
});