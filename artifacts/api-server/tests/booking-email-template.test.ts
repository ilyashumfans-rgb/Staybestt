import { describe, it, expect } from "vitest";
import { bookingEmailTemplate, type BookingEmailDetails } from "../src/lib/bookingEmailTemplate";
const details: BookingEmailDetails = {
  guestName: "Test Guest", bookingRef: "SB-TEST", propertyName: "Example Hotel", address: "Bengaluru",
  roomName: "Deluxe", roomsCount: 1, guests: 2, checkIn: "2026-11-20", checkOut: "2026-11-22",
  checkInTime: "14:00", checkOutTime: "11:00", timezone: "Asia/Kolkata",
  amountMinor: 240000, paidAt: new Date("2026-11-16T12:00:00Z"), paymentId: "pay_example", invoiceNumber: "INV-TEST",
};
describe("booking confirmation email", () => {
  it("includes stay dates and times, timezone, payment, and invoice details", () => {
    const mail = bookingEmailTemplate(details);
    for (const value of ["20 November 2026", "22 November 2026", "14:00", "11:00", "Asia/Kolkata", "2,400", "pay_example", "INV-TEST", "SB-TEST", "PDF is attached"]) {
      expect(mail.text).toContain(value);
      expect(mail.html).toContain(value);
    }
    expect(mail.subject).toContain("SB-TEST");
  });
  it("escapes guest-provided HTML", () => {
    const mail = bookingEmailTemplate({ ...details, guestName: '<script>alert("test")</script>' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
