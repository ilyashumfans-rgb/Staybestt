import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  bookingsTable,
  commissionLedgerEventsTable,
  commissionLedgerTable,
  commercialTermsTable,
  db,
  invoiceLineItemsTable,
  invoicePaymentsTable,
  invoicesTable,
  notificationsTable,
  propertiesTable,
  razorpayOrdersTable,
  razorpayPaymentsTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import {
  loadPaymentSummary,
  RazorpayLedgerError,
  recordRazorpayPayment,
} from "./razorpay";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const runNamespace = randomUUID();
const customerId = `razorpay-pending-customer-${runNamespace}`;
const partnerId = `razorpay-pending-partner-${runNamespace}`;
const fixtures: number[] = [];
const orderIds: number[] = [];
const paymentIds: number[] = [];
const invoiceIds: number[] = [];
const ledgerIds: number[] = [];
let propertyId = 0;
let roomId = 0;

async function createPendingFixture(input: {
  key: string;
  holdExpiresAt: Date;
  amount?: number;
}) {
  const fixtureKey = `${runNamespace}-${input.key}`;
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      bookingRef: null,
      idempotencyKey: fixtureKey,
      idempotencyFingerprint: `fingerprint-${fixtureKey}`,
      userId: customerId,
      propertyId,
      roomId,
      checkIn: "2030-04-01",
      checkOut: "2030-04-03",
      guests: 2,
      adults: 2,
      children: 0,
      roomsCount: 1,
      guestName: "Pending Payment Customer",
      guestEmail: `${customerId}@example.test`,
      guestPhone: "9999999999",
      status: "pending_payment",
      totalAmount: input.amount ?? 200,
      paymentHoldExpiresAt: input.holdExpiresAt,
    })
    .returning();
  if (!booking) throw new Error("Pending payment fixture was not created");
  fixtures.push(booking.id);

  const externalOrderId = `order_pending_${fixtureKey}`;
  const [order] = await db
    .insert(razorpayOrdersTable)
    .values({
      bookingId: booking.id,
      externalOrderId,
      receipt: `receipt_${fixtureKey}`,
      attempt: 1,
      amountMinor: Math.round(booking.totalAmount * 100),
      currency: "INR",
      mode: "test",
      status: "created",
    })
    .returning();
  if (!order) throw new Error("Razorpay order fixture was not created");
  orderIds.push(order.id);
  return { booking, order, externalOrderId };
}

run("pending Razorpay ledger integration", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values([
      {
        id: customerId,
        email: `${customerId}@example.test`,
        name: "Pending Payment Customer",
        role: "customer",
        status: "active",
      },
      {
        id: partnerId,
        email: `${partnerId}@example.test`,
        name: "Pending Payment Partner",
        role: "partner",
        status: "active",
      },
    ]);
    const [property] = await db
      .insert(propertiesTable)
      .values({
        ownerId: partnerId,
        name: "Pending Payment Property",
        category: "budget",
        city: "Test City",
        area: "Test Area",
        pincode: "000000",
        address: "Test address",
        description: "Pending payment integration fixture",
        imageUrl: "https://example.test/property.jpg",
        startingPrice: 100,
        status: "active",
      })
      .returning();
    if (!property) throw new Error("Pending payment property was not created");
    propertyId = property.id;
    const [room] = await db
      .insert(roomsTable)
      .values({
        propertyId,
        name: "Pending Payment Room",
        description: "Pending payment integration fixture",
        imageUrl: "https://example.test/room.jpg",
        totalRooms: 10,
        pricePerNight: 100,
      })
      .returning();
    if (!room) throw new Error("Pending payment room was not created");
    roomId = room.id;
    await db.insert(commercialTermsTable).values({
      userId: partnerId,
      mode: "percentage",
      value: 10,
    });
  });

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    const cleanup = async (operation: () => PromiseLike<unknown>) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };

    if (fixtures.length) {
      await cleanup(async () => {
        const discoveredPayments = await db
          .select({ id: razorpayPaymentsTable.id })
          .from(razorpayPaymentsTable)
          .where(inArray(razorpayPaymentsTable.bookingId, fixtures));
        paymentIds.push(...discoveredPayments.map(({ id }) => id));
      });
      await cleanup(async () => {
        const discoveredInvoices = await db
          .select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(inArray(invoicesTable.bookingId, fixtures));
        invoiceIds.push(...discoveredInvoices.map(({ id }) => id));
      });
      await cleanup(async () => {
        const discoveredLedgers = await db
          .select({ id: commissionLedgerTable.id })
          .from(commissionLedgerTable)
          .where(inArray(commissionLedgerTable.bookingId, fixtures));
        ledgerIds.push(...discoveredLedgers.map(({ id }) => id));
      });
    }

    const uniquePaymentIds = [...new Set(paymentIds)];
    const uniqueOrderIds = [...new Set(orderIds)];
    const uniqueInvoiceIds = [...new Set(invoiceIds)];
    const uniqueLedgerIds = [...new Set(ledgerIds)];
    if (paymentIds.length) {
      await cleanup(() => db.delete(razorpayPaymentsTable).where(inArray(razorpayPaymentsTable.id, uniquePaymentIds)));
    }
    if (orderIds.length) {
      await cleanup(() => db.delete(razorpayOrdersTable).where(inArray(razorpayOrdersTable.id, uniqueOrderIds)));
    }
    if (invoiceIds.length) {
      await cleanup(() => db.delete(invoicePaymentsTable).where(
        inArray(
          invoicePaymentsTable.invoiceId,
          uniqueInvoiceIds,
        ),
      ));
      await cleanup(() => db.delete(invoiceLineItemsTable).where(
        inArray(invoiceLineItemsTable.invoiceId, uniqueInvoiceIds),
      ));
      await cleanup(() => db.delete(invoicesTable).where(inArray(invoicesTable.id, uniqueInvoiceIds)));
    }
    if (ledgerIds.length) {
      await cleanup(() => db.delete(commissionLedgerEventsTable).where(
        inArray(commissionLedgerEventsTable.ledgerId, uniqueLedgerIds),
      ));
      await cleanup(() => db.delete(commissionLedgerTable).where(inArray(commissionLedgerTable.id, uniqueLedgerIds)));
    }
    if (fixtures.length) {
      await cleanup(() => db.delete(bookingsTable).where(inArray(bookingsTable.id, fixtures)));
    }
    if (roomId) await cleanup(() => db.delete(roomsTable).where(eq(roomsTable.id, roomId)));
    if (propertyId) await cleanup(() => db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId)));
    await cleanup(() => db.delete(commercialTermsTable).where(eq(commercialTermsTable.userId, partnerId)));
    await cleanup(() => db.delete(notificationsTable).where(inArray(notificationsTable.userId, [customerId, partnerId])));
    await cleanup(() => db.delete(usersTable).where(inArray(usersTable.id, [customerId, partnerId])));
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Pending Razorpay integration fixture cleanup failed");
    }
    expect(await db.select({ id: usersTable.id }).from(usersTable)
      .where(inArray(usersTable.id, [customerId, partnerId]))).toEqual([]);
  });

  it("finalizes one captured hold exactly once with an invoice and commission allocation", async () => {
    const fixture = await createPendingFixture({
      key: "captured",
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const input = {
      bookingId: fixture.booking.id,
      externalOrderId: fixture.externalOrderId,
      externalPaymentId: `pay_pending_captured_${runNamespace}`,
      amountMinor: 20_000,
      currency: "INR",
      mode: "test",
      status: "captured" as const,
      source: "checkout" as const,
    };

    const first = await recordRazorpayPayment(input);
    const second = await recordRazorpayPayment(input);
    expect(first.status).toBe("paid");
    expect(second.status).toBe("paid");
    expect(first.paymentId).toBe(input.externalPaymentId);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, fixture.booking.id));
    expect(booking).toMatchObject({ status: "confirmed" });
    expect(booking?.bookingRef).toMatch(/^SB-[A-Z2-9]{6}$/);

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, fixture.booking.id));
    const payments = await db
      .select()
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.bookingId, fixture.booking.id));
    const invoicePayments = invoices.length
      ? await db
          .select()
          .from(invoicePaymentsTable)
          .where(eq(invoicePaymentsTable.invoiceId, invoices[0]!.id))
      : [];
    const ledgers = await db
      .select()
      .from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, fixture.booking.id));
    invoiceIds.push(...invoices.map((invoice) => invoice.id));
    paymentIds.push(...payments.map((payment) => payment.id));
    ledgerIds.push(...ledgers.map((ledger) => ledger.id));

    expect(invoices).toHaveLength(1);
    expect(invoicePayments).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "captured", refundRequired: false });
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatchObject({ recipientUserId: partnerId, status: "pending" });
  });

  it("keeps authorized and failed attempts pending without a reference, invoice, or commission", async () => {
    const fixture = await createPendingFixture({
      key: "authorized-failed",
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const base = {
      bookingId: fixture.booking.id,
      externalOrderId: fixture.externalOrderId,
      amountMinor: 20_000,
      currency: "INR",
      mode: "test",
      source: "webhook" as const,
    };
    const authorized = await recordRazorpayPayment({
      ...base,
      externalPaymentId: `pay_pending_authorized_${runNamespace}`,
      status: "authorized",
    });
    const failed = await recordRazorpayPayment({
      ...base,
      externalPaymentId: `pay_pending_failed_${runNamespace}`,
      status: "failed",
      failureCode: "CARD_DECLINED",
    });
    expect(authorized.status).toBe("processing");
    expect(failed.status).toBe("processing");

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, fixture.booking.id));
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, fixture.booking.id));
    const ledgers = await db
      .select()
      .from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, fixture.booking.id));
    const payments = await db
      .select()
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.bookingId, fixture.booking.id));
    paymentIds.push(...payments.map((payment) => payment.id));
    expect(booking).toMatchObject({ status: "pending_payment", bookingRef: null });
    expect(invoices).toHaveLength(0);
    expect(ledgers).toHaveLength(0);
    expect(payments.map((payment) => payment.status)).toEqual(["authorized", "failed"]);
  });

  it("rejects replaying one provider payment against a different booking", async () => {
    const first = await createPendingFixture({
      key: "payment-conflict-first",
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const second = await createPendingFixture({
      key: "payment-conflict-second",
      holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const externalPaymentId = `pay_pending_conflict_${runNamespace}`;
    await recordRazorpayPayment({
      bookingId: first.booking.id,
      externalOrderId: first.externalOrderId,
      externalPaymentId,
      amountMinor: 20_000,
      currency: "INR",
      mode: "test",
      status: "captured",
      source: "checkout",
    });
    await expect(
      recordRazorpayPayment({
        bookingId: second.booking.id,
        externalOrderId: second.externalOrderId,
        externalPaymentId,
        amountMinor: 20_000,
        currency: "INR",
        mode: "test",
        status: "captured",
        source: "webhook",
      }),
    ).rejects.toMatchObject({
      name: "RazorpayLedgerError",
      code: "payment_conflict",
    } satisfies Partial<RazorpayLedgerError>);

    const firstPayment = await db
      .select({ id: razorpayPaymentsTable.id })
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.bookingId, first.booking.id));
    paymentIds.push(...firstPayment.map((payment) => payment.id));
    const firstInvoices = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, first.booking.id));
    invoiceIds.push(...firstInvoices.map((invoice) => invoice.id));
    const firstLedgers = await db
      .select({ id: commissionLedgerTable.id })
      .from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, first.booking.id));
    ledgerIds.push(...firstLedgers.map((ledger) => ledger.id));
  });

  it("records a late capture for refund without confirming an expired hold", async () => {
    const fixture = await createPendingFixture({
      key: "expired",
      holdExpiresAt: new Date(Date.now() - 1_000),
    });
    const summary = await recordRazorpayPayment({
      bookingId: fixture.booking.id,
      externalOrderId: fixture.externalOrderId,
      externalPaymentId: `pay_pending_late_${runNamespace}`,
      amountMinor: 20_000,
      currency: "INR",
      mode: "test",
      status: "captured",
      source: "reconciliation",
    });
    expect(summary.status).toBe("refund_required");
    expect(summary.requiresRefund).toBe(true);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, fixture.booking.id));
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, fixture.booking.id));
    const payments = await db
      .select()
      .from(razorpayPaymentsTable)
      .where(eq(razorpayPaymentsTable.bookingId, fixture.booking.id));
    const ledgers = await db
      .select()
      .from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, fixture.booking.id));
    invoiceIds.push(...invoices.map((invoice) => invoice.id));
    paymentIds.push(...payments.map((payment) => payment.id));
    expect(booking).toMatchObject({ status: "expired", bookingRef: null });
    expect(invoices).toHaveLength(1);
    expect(payments).toMatchObject([{ status: "captured", refundRequired: true }]);
    expect(ledgers).toHaveLength(0);
    expect((await loadPaymentSummary(fixture.booking.id))?.status).toBe("refund_required");
  });
});