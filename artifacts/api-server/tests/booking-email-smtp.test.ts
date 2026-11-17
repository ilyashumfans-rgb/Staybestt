import { expect, it } from "vitest";
import { bookingMailTransport } from "../src/lib/bookingEmails";
import { bookingEmailTemplate } from "../src/lib/bookingEmailTemplate";
import { generateInvoicePdf } from "../src/lib/invoicePdf";

// Explicit opt-in only. Synthetic data goes exclusively to the configured sender.
it.skipIf(process.env.SEND_SELF_SMTP_TEST !== "1")("accepts a synthetic confirmation with PDF at the sender mailbox", async () => {
  const recipient = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!recipient) throw new Error("Sender is not configured");
  const details = {
    guestName: "Test Guest — not a real booking", bookingRef: "TEST-NOT-A-BOOKING",
    propertyName: "Example Hotel (Test)", address: "Sample address",
    roomName: "Sample Room", roomsCount: 1, guests: 2,
    checkIn: "2026-12-01", checkOut: "2026-12-02",
    checkInTime: "14:00", checkOutTime: "11:00", timezone: "Asia/Kolkata",
    amountMinor: 120000, paidAt: new Date(), paymentId: "TEST-NO-PAYMENT", invoiceNumber: "TEST-NOT-A-TAX-INVOICE",
  };
  const mail = bookingEmailTemplate(details);
  const today = new Date().toISOString().slice(0, 10);
  const pdf = await generateInvoicePdf({
    settings: { businessName: "StayBest — TEST ONLY", address: "Sample address — not a real invoice", taxRegistration: null, email: recipient },
    invoice: {
      invoiceNumber: details.invoiceNumber, issueDate: today, dueDate: today,
      customerName: details.guestName, customerEmail: recipient, customerPhone: null, customerAddress: null,
      subtotalMinor: 120000, taxMinor: 0, totalMinor: 120000, paidMinor: 120000, dueMinor: 0, status: "paid",
      lines: [{ description: "TEST ONLY — sample stay", quantity: 1, unitPriceMinor: 120000, taxRateBps: 0, taxMinor: 0, totalMinor: 120000 }],
      payments: [{ amountMinor: 120000, paymentDate: today, method: "test", reference: "TEST-NO-PAYMENT" }],
      booking: { bookingRef: details.bookingRef, propertyName: details.propertyName, roomName: details.roomName, checkIn: details.checkIn, checkOut: details.checkOut, totalMinor: 120000 },
    },
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const transport = bookingMailTransport();
  try {
    const result = await transport.sendMail({
      from: { name: "StayBest Bookings", address: recipient }, to: recipient, ...mail,
      subject: "[TEST ONLY] StayBest confirmation and invoice preview",
      attachments: [{ filename: "TEST-ONLY-invoice.pdf", content: pdf, contentType: "application/pdf" }],
    });
    expect(result.accepted.length).toBe(1);
  } finally { transport.close(); }
}, 60000);
