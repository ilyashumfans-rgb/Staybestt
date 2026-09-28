import { describe, expect, it } from "vitest";
import {
  computeInvoiceTotals,
  invoiceStatus,
  isInvoiceDate,
} from "./billing";

describe("computeInvoiceTotals", () => {
  it("computes subtotal, rounded tax, and total in integer minor units", () => {
    expect(
      computeInvoiceTotals([
        { description: "Room night", quantity: 2, unitPriceMinor: 12_345, taxRateBps: 1_800 },
        { description: "Breakfast", quantity: 1, unitPriceMinor: 1_000 },
      ]),
    ).toEqual({
      lines: [
        {
          description: "Room night",
          quantity: 2,
          unitPriceMinor: 12_345,
          taxRateBps: 1_800,
          subtotalMinor: 24_690,
          taxMinor: 4_444,
          totalMinor: 29_134,
        },
        {
          description: "Breakfast",
          quantity: 1,
          unitPriceMinor: 1_000,
          taxRateBps: 0,
          subtotalMinor: 1_000,
          taxMinor: 0,
          totalMinor: 1_000,
        },
      ],
      subtotalMinor: 25_690,
      taxMinor: 4_444,
      totalMinor: 30_134,
    });
  });

  it("rejects unsafe, fractional, or over-range money inputs", () => {
    expect(() =>
      computeInvoiceTotals([
        { description: "Room", quantity: 1, unitPriceMinor: 1.5 },
      ]),
    ).toThrow(/whole INR minor-unit/);
    expect(() =>
      computeInvoiceTotals([
        { description: "Room", quantity: 1, unitPriceMinor: 2_147_483_647 },
        { description: "Extra", quantity: 1, unitPriceMinor: 1 },
      ]),
    ).toThrow(/Invoice subtotal/);
  });
});

describe("invoiceStatus", () => {
  it("distinguishes unpaid, partial, and paid", () => {
    expect(invoiceStatus(10_000, 0, "2026-08-10", "2026-08-09")).toBe("unpaid");
    expect(invoiceStatus(10_000, 2_000, "2026-08-10", "2026-08-11")).toBe("partial");
    expect(invoiceStatus(10_000, 10_000, "2026-08-10", "2026-08-11")).toBe("paid");
  });

  it("marks only an entirely unpaid past-due invoice overdue", () => {
    expect(invoiceStatus(10_000, 0, "2026-08-10", "2026-08-11")).toBe("overdue");
    expect(invoiceStatus(10_000, 1, "2026-08-10", "2026-08-11")).toBe("partial");
  });
});

describe("isInvoiceDate", () => {
  it("accepts calendar dates without coercing timezone", () => {
    expect(isInvoiceDate("2026-02-28")).toBe(true);
    expect(isInvoiceDate("2026-02-29")).toBe(false);
    expect(isInvoiceDate("2026-2-8")).toBe(false);
  });
});