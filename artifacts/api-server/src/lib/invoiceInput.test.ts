import { describe, expect, it } from "vitest";
import { CreateAdminInvoiceBody } from "@workspace/api-zod";
import {
  normalizeBillingSettingsBody,
  normalizeInvoiceBody,
  normalizePaymentBody,
} from "./invoiceInput";

describe("invoice input normalization", () => {
  it("normalizes whitespace before required-field validation", () => {
    const parsed = CreateAdminInvoiceBody.safeParse(
      normalizeInvoiceBody({
        customerName: "  Ada\n  Lovelace  ",
        customerEmail: " ADA@EXAMPLE.COM ",
        customerPhone: "  +91 999  ",
        customerAddress: "  1   Main\n Street ",
        dueDate: " 2030-01-31 ",
        lineItems: [{ description: "  Room\n night  ", quantity: 1, unitPriceMinor: 100 }],
      }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.customerName).toBe("Ada Lovelace");
    expect(parsed.success && parsed.data.customerEmail).toBe("ada@example.com");
    expect(parsed.success && parsed.data.customerAddress).toBe("1 Main Street");
    expect(parsed.success && parsed.data.lineItems[0]?.description).toBe("Room night");
  });

  it("rejects blank normalized names, addresses, and malformed email addresses", () => {
    const invoice = normalizeInvoiceBody({
      customerName: " \n ",
      customerEmail: "not-an-email",
      dueDate: "2030-01-31",
      lineItems: [{ description: "Room", quantity: 1, unitPriceMinor: 100 }],
    });
    expect(CreateAdminInvoiceBody.safeParse(invoice).success).toBe(false);
    expect(
      normalizeBillingSettingsBody({ businessName: " \t ", address: " \n " }),
    ).toEqual({ businessName: "", address: "", taxRegistration: undefined });
  });

  it("normalizes idempotency keys before enforcing their minimum length", () => {
    expect(
      normalizePaymentBody({
        amountMinor: 100,
        paymentDate: " 2030-01-31 ",
        method: "cash",
        idempotencyKey: "  payment-123  ",
      }),
    ).toEqual({
      amountMinor: 100,
      paymentDate: "2030-01-31",
      method: "cash",
      idempotencyKey: "payment-123",
    });
  });
});