import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn(), transaction: vi.fn(), pdf: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mock.send, close: vi.fn() }) } }));
vi.mock("../src/lib/invoicePdf", () => ({ generateInvoicePdf: mock.pdf }));
vi.mock("../src/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { transaction: mock.transaction } };
});
import { dispatchBookingEmails } from "../src/lib/bookingEmails";

function setup(status = "confirmed") {
  const answers: unknown[] = [
    [{ bookingId: 999, attempts: 0 }],
    [{ bookings: { status, bookingRef: "SB-TEST", guestName: "Test", guestEmail: "nobody@example.com", roomsCount: 1, guests: 2, checkIn: "2026-11-20", checkOut: "2026-11-21" },
      properties: { name: "Hotel", address: "Address", checkInTime: "14:00", checkOutTime: "11:00", timezone: "Asia/Kolkata" }, rooms: { name: "Room" } }],
    [{ amountMinor: 120000, capturedAt: new Date(), externalPaymentId: "pay_test" }],
    [{ id: 4, invoiceNumber: "INV-TEST", totalMinor: 120000 }],
    [{ businessName: "StayBest" }], [], [{ amountMinor: 120000 }], [],
  ];
  if (status !== "confirmed") answers.splice(2, 5);
  const updates: Record<string, unknown>[] = [];
  const tx = {
    select: () => {
      const answer = answers.shift() ?? [];
      const chain: any = { then: (resolve: any) => Promise.resolve(answer).then(resolve) };
      for (const method of ["from", "where", "limit", "for", "innerJoin"]) chain[method] = () => chain;
      return chain;
    },
    update: () => ({ set: (value: Record<string, unknown>) => {
      updates.push(value);
      return { where: async () => undefined };
    } }),
  };
  mock.transaction.mockImplementation(fn => fn(tx));
  return updates;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_HOST", "mail.example.com");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "booking@example.com");
  vi.stubEnv("SMTP_PASSWORD", "test-only-not-a-real-password");
  mock.pdf.mockResolvedValue(Buffer.from("%PDF-test"));
  mock.send.mockResolvedValue({ accepted: ["nobody@example.com"] });
});
it("attaches the invoice and records SMTP acceptance", async () => {
  const updates = setup();
  await dispatchBookingEmails();
  expect(mock.send).toHaveBeenCalledTimes(1);
  expect(mock.send.mock.calls[0][0]).toMatchObject({
    to: "nobody@example.com", attachments: [{ filename: "INV-TEST.pdf", contentType: "application/pdf" }],
  });
  expect(updates[0]).toMatchObject({ status: "sent", attempts: 1 });
});
it("keeps failed delivery pending for retry without throwing", async () => {
  const updates = setup();
  mock.send.mockRejectedValue(Object.assign(new Error("provider detail"), { code: "ETIMEDOUT" }));
  await dispatchBookingEmails();
  expect(updates[0]).toMatchObject({ status: "pending", lastError: "ETIMEDOUT", attempts: 1 });
});
it("never sends a confirmation for a cancelled booking", async () => {
  const updates = setup("cancelled");
  await dispatchBookingEmails();
  expect(mock.send).not.toHaveBeenCalled();
  expect(updates[0]).toMatchObject({ status: "skipped" });
});
