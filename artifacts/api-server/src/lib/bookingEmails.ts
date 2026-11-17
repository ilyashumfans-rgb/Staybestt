import nodemailer from "nodemailer";
import { and, eq, lte } from "drizzle-orm";
import { db, bookingEmailsTable, bookingsTable, propertiesTable, roomsTable, invoicesTable, invoiceLineItemsTable, invoicePaymentsTable, billingSettingsTable, razorpayPaymentsTable } from "@workspace/db";
import { generateInvoicePdf } from "./invoicePdf";
import { invoiceBookingFromSnapshot } from "./invoiceSnapshot";
import { bookingEmailTemplate } from "./bookingEmailTemplate";
import { logger } from "./logger";

export function bookingMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || SMTP_PORT !== "465") throw new Error("SMTP configuration unavailable");
  return nodemailer.createTransport({
    host: SMTP_HOST, port: 465, secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}

let running = false;
export async function dispatchBookingEmails() {
  if (running) return;
  running = true;
  try {
    // Network delivery runs after payment commits, never inside the capture transaction.
    for (let n = 0; n < 10; n++) {
      const processed = await db.transaction(async tx => {
        const [job] = await tx.select().from(bookingEmailsTable)
          .where(and(eq(bookingEmailsTable.status, "pending"), lte(bookingEmailsTable.nextAttemptAt, new Date())))
          .limit(1).for("update", { skipLocked: true });
        if (!job) return false;
        try {
          const [row] = await tx.select().from(bookingsTable)
            .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
            .leftJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
            .where(eq(bookingsTable.id, job.bookingId));
          if (!row || row.bookings.status !== "confirmed") {
            await tx.update(bookingEmailsTable).set({ status: "skipped", lastError: "Booking is no longer confirmed" }).where(eq(bookingEmailsTable.bookingId, job.bookingId));
            return true;
          }
          const [payment] = await tx.select().from(razorpayPaymentsTable).where(and(
            eq(razorpayPaymentsTable.bookingId, job.bookingId), eq(razorpayPaymentsTable.status, "captured"),
            eq(razorpayPaymentsTable.refundRequired, false),
          )).limit(1);
          const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.bookingId, job.bookingId)).limit(1);
          const [settings] = await tx.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
          if (!payment || !invoice || !settings || !row.bookings.bookingRef || !payment.capturedAt) throw new Error("Confirmed booking billing details unavailable");
          const lines = await tx.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, invoice.id));
          const payments = await tx.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoice.id));
          const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
          const pdf = await generateInvoicePdf({ settings, invoice: {
            ...invoice, lines, payments, paidMinor, dueMinor: Math.max(0, invoice.totalMinor - paidMinor),
            status: "paid", booking: invoiceBookingFromSnapshot(invoice),
          } });
          const mail = bookingEmailTemplate({
            guestName: row.bookings.guestName, bookingRef: row.bookings.bookingRef,
            propertyName: row.properties.name, address: row.properties.address,
            roomName: row.rooms?.name ?? "Day Out", roomsCount: row.bookings.roomsCount, guests: row.bookings.guests,
            checkIn: row.bookings.checkIn, checkOut: row.bookings.checkOut,
            checkInTime: row.properties.checkInTime, checkOutTime: row.properties.checkOutTime,
            timezone: row.properties.timezone, amountMinor: payment.amountMinor,
            paidAt: payment.capturedAt, paymentId: payment.externalPaymentId, invoiceNumber: invoice.invoiceNumber,
          });
          const transport = bookingMailTransport();
          try {
            const result = await transport.sendMail({
              from: { name: "StayBest Bookings", address: process.env.SMTP_FROM || process.env.SMTP_USER! },
              to: row.bookings.guestEmail, ...mail,
              messageId: `<staybest-booking-${job.bookingId}@staybestt.com>`,
              attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
            });
            if (!result.accepted.length) throw new Error("SMTP did not accept recipient");
          } finally { transport.close(); }
          await tx.update(bookingEmailsTable).set({ status: "sent", sentAt: new Date(), attempts: job.attempts + 1, lastError: null }).where(eq(bookingEmailsTable.bookingId, job.bookingId));
          logger.info({ bookingId: job.bookingId }, "Booking invoice email accepted by SMTP");
        } catch (error) {
          const attempts = job.attempts + 1;
          // Store only a safe code, not provider text that could contain credentials or personal data.
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "EMAIL_FAILED";
          await tx.update(bookingEmailsTable).set({
            attempts, lastError: code, status: attempts >= 8 ? "failed" : "pending",
            nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** attempts)),
          }).where(eq(bookingEmailsTable.bookingId, job.bookingId));
          logger.error({ bookingId: job.bookingId, code, attempts }, "Booking email failed; delivery recorded for retry");
        }
        return true;
      });
      if (!processed) break;
    }
  } catch {
    logger.error("Booking email worker unavailable; pending messages retained");
  } finally { running = false; }
}
