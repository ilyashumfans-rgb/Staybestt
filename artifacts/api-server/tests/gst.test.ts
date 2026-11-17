import { describe, it, expect } from "vitest";
import { calculateGst } from "@workspace/api-zod";
import { computeInvoiceTotals } from "../src/lib/billing";

describe("room GST", () => {
  it("adds exclusive GST to the complete stay amount", () => {
    expect(calculateGst(100000, 1800, "exclusive")).toEqual({ subtotalMinor: 100000, taxMinor: 18000, totalMinor: 118000 });
  });
  it("extracts inclusive GST without increasing the amount due", () => {
    expect(calculateGst(100000, 1800, "inclusive")).toEqual({ subtotalMinor: 84746, taxMinor: 15254, totalMinor: 100000 });
  });
  it("calculates once on all nights and rooms after discounts", () => {
    const roomTotal = 120000 * 3 * 2;
    expect(calculateGst(roomTotal - 20000, 1200, "exclusive").totalMinor).toBe(784000);
    expect(calculateGst(roomTotal - 20000, 1200, "inclusive").totalMinor).toBe(700000);
  });
  it("keeps zero GST unchanged and rejects unsafe values", () => {
    expect(calculateGst(123456, 0).totalMinor).toBe(123456);
    for (const rate of [-1, 10001, 1.5, NaN]) expect(() => calculateGst(10000, rate)).toThrow();
    expect(() => calculateGst(2147483647, 1800)).toThrow();
  });
  it("rounds in paise without losing money", () => {
    for (const mode of ["inclusive", "exclusive"]) {
      const gst = calculateGst(99999, 1250, mode);
      expect(gst.subtotalMinor + gst.taxMinor).toBe(gst.totalMinor);
      expect(Number.isInteger(gst.taxMinor)).toBe(true);
    }
  });
  it("uses the same inclusive/exclusive math for invoices", () => {
    const lines = [{ description: "Stay", quantity: 2, unitPriceMinor: 50000, taxRateBps: 1800 }];
    for (const mode of ["inclusive", "exclusive"]) {
      const invoice = computeInvoiceTotals(lines, mode);
      const expected = calculateGst(100000, 1800, mode);
      expect(invoice.totalMinor).toBe(expected.totalMinor);
      expect(invoice.taxMinor).toBe(expected.taxMinor);
      expect(invoice.subtotalMinor).toBe(expected.subtotalMinor);
    }
  });
});
