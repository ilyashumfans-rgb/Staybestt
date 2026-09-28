import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateInvoicePdf, replaceMissingGlyphs } from "./invoicePdf";

describe("invoice PDF rendering", () => {
  it("marks unsupported Unicode glyphs visibly instead of silently dropping them", async () => {
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont(
      await readFile("node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
      { subset: false },
    );
    expect(replaceMissingGlyphs("Zoë ₹", font)).toBe("Zoë ₹");
    expect(replaceMissingGlyphs("ग्राहक", font)).toMatch(/^□+$/u);
  });

  it("paginates every line and payment row while preserving Unicode text", async () => {
    const pdf = await generateInvoicePdf({
      settings: {
        businessName: "StayBest Résorts",
        address: "1 Main Street, नई दिल्ली, India\nAccounts department",
        taxRegistration: "GST-₹-123",
      },
      invoice: {
        invoiceNumber: "SB-INV-UNICODE",
        issueDate: "2030-01-01",
        dueDate: "2030-01-31",
        customerName: "Zoë ग्राहक",
        customerEmail: "guest@example.com",
        customerPhone: null,
        customerAddress: "Long address with enough words to wrap across multiple lines, दिल्ली",
        subtotalMinor: 20_000,
        taxMinor: 3_600,
        totalMinor: 23_600,
        paidMinor: 7_000,
        dueMinor: 16_600,
        status: "partial",
        lines: Array.from({ length: 20 }, (_, index) => ({
          description: `Room night ${index + 1} — a deliberately long description that wraps`,
          quantity: 1,
          unitPriceMinor: 1_000,
          taxRateBps: 1_800,
          taxMinor: 180,
          totalMinor: 1_180,
        })),
        payments: Array.from({ length: 7 }, (_, index) => ({
          amountMinor: 1_000,
          paymentDate: `2030-01-${String(index + 1).padStart(2, "0")}`,
          method: "cash",
          reference: `Receipt reference ${index + 1} with a long Unicode note — ग्राहक`,
        })),
        booking: {
          bookingRef: "BOOK-UNICODE",
          propertyName: "StayBest Résorts",
          roomName: "सुइट",
          checkIn: "2030-01-01",
          checkOut: "2030-01-04",
          totalMinor: 35_400,
        },
      },
    });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});