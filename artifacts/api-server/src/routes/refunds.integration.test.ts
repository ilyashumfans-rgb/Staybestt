import { createHash } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  bookingRefundsTable,
  bookingsTable,
  db,
  invoiceLineItemsTable,
  invoicePaymentsTable,
  invoicesTable,
  propertiesTable,
  roomsTable,
  usersTable,
} from "@workspace/db";
import { currentBusinessDate } from "../lib/billing";

process.env.ADMIN_USERNAME = "refunds-integration-admin";
process.env.ADMIN_PASSWORD = "refunds-integration-password";
process.env.SESSION_SECRET = "refunds-integration-session";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const suffix = `${process.pid}-${Date.now()}`;
const aliceId = `refunds-alice-${suffix}`;
const bobId = `refunds-bob-${suffix}`;
const token = createHash("sha256")
  .update(
    `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}:${process.env.SESSION_SECRET}`,
  )
  .digest("hex");

type Fixture = {
  bookingId: number;
  invoiceId: number;
  paymentId: number;
};

let server: Server;
let baseUrl = "";
let propertyAId = 0;
let propertyBId = 0;
let roomAId = 0;
let roomBId = 0;
const fixtures: Fixture[] = [];
const bookingIds: number[] = [];
const invoiceIds: number[] = [];
const paymentIds: number[] = [];

async function request(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function createFixture(input: {
  propertyId: number;
  roomId: number;
  userId: string;
  guestName: string;
  guestEmail: string;
  amountMinor: number;
  bookingRef: string;
  invoiceNumber: string;
  paymentKey: string;
}): Promise<Fixture> {
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      bookingRef: input.bookingRef,
      userId: input.userId,
      propertyId: input.propertyId,
      roomId: input.roomId,
      checkIn: "2030-01-01",
      checkOut: "2030-01-03",
      guests: 2,
      roomsCount: 1,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      totalAmount: input.amountMinor / 100,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    })
    .returning();
  if (!booking) throw new Error("Refund test booking was not created");
  bookingIds.push(booking.id);

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber: input.invoiceNumber,
      bookingId: booking.id,
      customerName: input.guestName,
      customerEmail: input.guestEmail,
      issueDate: "2020-01-01",
      dueDate: "2030-01-31",
      currency: "INR",
      subtotalMinor: input.amountMinor,
      taxMinor: 0,
      totalMinor: input.amountMinor,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    })
    .returning();
  if (!invoice) throw new Error("Refund test invoice was not created");
  invoiceIds.push(invoice.id);

  await db.insert(invoiceLineItemsTable).values({
    invoiceId: invoice.id,
    description: "Refund integration test stay",
    quantity: 1,
    unitPriceMinor: input.amountMinor,
    taxRateBps: 0,
    taxMinor: 0,
    totalMinor: input.amountMinor,
  });

  const [payment] = await db
    .insert(invoicePaymentsTable)
    .values({
      invoiceId: invoice.id,
      amountMinor: input.amountMinor,
      paymentDate: "2020-01-01",
      method: "upi",
      reference: `fixture-payment-${suffix}`,
      idempotencyKey: input.paymentKey,
    })
    .returning();
  if (!payment) throw new Error("Refund test payment was not created");
  paymentIds.push(payment.id);
  const fixture = {
    bookingId: booking.id,
    invoiceId: invoice.id,
    paymentId: payment.id,
  };
  fixtures.push(fixture);
  return fixture;
}

run("manual refunds API integration", () => {
  let noPaymentBookingId = 0;
  let partial: Fixture;
  let idempotent: Fixture;
  let concurrent: Fixture;
  let cancelled: Fixture;
  let invoice: Fixture;
  let dateFixture: Fixture;
  let paymentDateInvoiceId = 0;

  beforeAll(async () => {
    const [{ default: adminRouter }, { default: billingRouter }] = await Promise.all([
      import("./admin"),
      import("./billing"),
    ]);
    const app = express();
    app.use(express.json());
    app.use(adminRouter);
    app.use(billingRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Refund integration test server did not bind");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    await db.insert(usersTable).values([
      {
        id: aliceId,
        email: `${aliceId}@example.test`,
        name: "Alice Refund",
        role: "customer",
      },
      {
        id: bobId,
        email: `${bobId}@example.test`,
        name: "Bob Refund",
        role: "customer",
      },
    ]);
    const [propertyA] = await db
      .insert(propertiesTable)
      .values({
        name: `Refund Test A ${suffix}`,
        category: "budget",
        city: "Refund City A",
        area: "Refund Area A",
        pincode: "000001",
        address: "Refund address A",
        description: "Refund integration property A",
        imageUrl: "https://example.test/refund-a.jpg",
        startingPrice: 100,
        status: "active",
      })
      .returning();
    const [propertyB] = await db
      .insert(propertiesTable)
      .values({
        name: `Refund Test B ${suffix}`,
        category: "budget",
        city: "Refund City B",
        area: "Refund Area B",
        pincode: "000002",
        address: "Refund address B",
        description: "Refund integration property B",
        imageUrl: "https://example.test/refund-b.jpg",
        startingPrice: 100,
        status: "active",
      })
      .returning();
    if (!propertyA || !propertyB) throw new Error("Refund test properties were not created");
    propertyAId = propertyA.id;
    propertyBId = propertyB.id;

    const [roomA] = await db
      .insert(roomsTable)
      .values({
        propertyId: propertyAId,
        name: "Refund Room A",
        description: "Refund room A",
        imageUrl: "https://example.test/refund-room-a.jpg",
        pricePerNight: 100,
      })
      .returning();
    const [roomB] = await db
      .insert(roomsTable)
      .values({
        propertyId: propertyBId,
        name: "Refund Room B",
        description: "Refund room B",
        imageUrl: "https://example.test/refund-room-b.jpg",
        pricePerNight: 100,
      })
      .returning();
    if (!roomA || !roomB) throw new Error("Refund test rooms were not created");
    roomAId = roomA.id;
    roomBId = roomB.id;

    const [legacyBooking] = await db
      .insert(bookingsTable)
      .values({
        bookingRef: `REFUND-NO-PAYMENT-${suffix}`,
        userId: aliceId,
        propertyId: propertyAId,
        roomId: roomAId,
        checkIn: "2030-01-01",
        checkOut: "2030-01-02",
        guests: 1,
        roomsCount: 1,
        guestName: "Legacy No Payment",
        guestEmail: "legacy-refund@example.test",
        totalAmount: 50,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      })
      .returning();
    if (!legacyBooking) throw new Error("Legacy refund test booking was not created");
    noPaymentBookingId = legacyBooking.id;
    bookingIds.push(noPaymentBookingId);

    partial = await createFixture({
      propertyId: propertyAId,
      roomId: roomAId,
      userId: aliceId,
      guestName: "Alice Refund",
      guestEmail: `${aliceId}@example.test`,
      amountMinor: 10_000,
      bookingRef: `REFUND-PARTIAL-${suffix}`,
      invoiceNumber: `REFUND-INV-PARTIAL-${suffix}`,
      paymentKey: `refund-payment-partial-${suffix}`,
    });
    idempotent = await createFixture({
      propertyId: propertyAId,
      roomId: roomAId,
      userId: aliceId,
      guestName: "Alice Refund",
      guestEmail: `${aliceId}@example.test`,
      amountMinor: 10_000,
      bookingRef: `REFUND-IDEMPOTENT-${suffix}`,
      invoiceNumber: `REFUND-INV-IDEMPOTENT-${suffix}`,
      paymentKey: `refund-payment-idempotent-${suffix}`,
    });
    concurrent = await createFixture({
      propertyId: propertyAId,
      roomId: roomAId,
      userId: bobId,
      guestName: "Bob Refund",
      guestEmail: `${bobId}@example.test`,
      amountMinor: 1_000,
      bookingRef: `REFUND-CONCURRENT-${suffix}`,
      invoiceNumber: `REFUND-INV-CONCURRENT-${suffix}`,
      paymentKey: `refund-payment-concurrent-${suffix}`,
    });
    cancelled = await createFixture({
      propertyId: propertyBId,
      roomId: roomBId,
      userId: aliceId,
      guestName: "Alice Cancelled",
      guestEmail: `${aliceId}@example.test`,
      amountMinor: 3_000,
      bookingRef: `REFUND-CANCELLED-${suffix}`,
      invoiceNumber: `REFUND-INV-CANCELLED-${suffix}`,
      paymentKey: `refund-payment-cancelled-${suffix}`,
    });
    invoice = await createFixture({
      propertyId: propertyAId,
      roomId: roomAId,
      userId: aliceId,
      guestName: "Alice Refund",
      guestEmail: `${aliceId}@example.test`,
      amountMinor: 12_000,
      bookingRef: `REFUND-INVOICE-${suffix}`,
      invoiceNumber: `REFUND-INV-INVOICE-${suffix}`,
      paymentKey: `refund-payment-invoice-${suffix}`,
    });
    dateFixture = await createFixture({
      propertyId: propertyBId,
      roomId: roomBId,
      userId: bobId,
      guestName: "Bob Date",
      guestEmail: `${bobId}@example.test`,
      amountMinor: 2_000,
      bookingRef: `REFUND-DATES-${suffix}`,
      invoiceNumber: `REFUND-INV-DATES-${suffix}`,
      paymentKey: `refund-payment-dates-${suffix}`,
    });

    const [paymentDateInvoice] = await db
      .insert(invoicesTable)
      .values({
        invoiceNumber: `REFUND-INV-FUTURE-PAYMENT-${suffix}`,
        customerName: "Payment Date Test",
        customerEmail: `payment-date-${suffix}@example.test`,
        issueDate: "2020-01-01",
        dueDate: "2030-01-31",
        currency: "INR",
        subtotalMinor: 1_000,
        taxMinor: 0,
        totalMinor: 1_000,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      })
      .returning();
    if (!paymentDateInvoice) throw new Error("Payment date test invoice was not created");
    paymentDateInvoiceId = paymentDateInvoice.id;
    invoiceIds.push(paymentDateInvoice.id);
    await db.insert(invoiceLineItemsTable).values({
      invoiceId: paymentDateInvoice.id,
      description: "Payment date integration test",
      quantity: 1,
      unitPriceMinor: 1_000,
      taxRateBps: 0,
      taxMinor: 0,
      totalMinor: 1_000,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (bookingIds.length) {
      await db
        .delete(bookingRefundsTable)
        .where(inArray(bookingRefundsTable.bookingId, bookingIds));
    }
    if (paymentIds.length) {
      await db
        .delete(invoicePaymentsTable)
        .where(inArray(invoicePaymentsTable.id, paymentIds));
    }
    if (invoiceIds.length) {
      await db
        .delete(invoiceLineItemsTable)
        .where(inArray(invoiceLineItemsTable.invoiceId, invoiceIds));
      await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
    }
    if (bookingIds.length) {
      await db.delete(bookingsTable).where(inArray(bookingsTable.id, bookingIds));
    }
    if (roomAId || roomBId) {
      await db
        .delete(roomsTable)
        .where(inArray(roomsTable.id, [roomAId, roomBId].filter(Boolean)));
    }
    if (propertyAId || propertyBId) {
      await db
        .delete(propertiesTable)
        .where(inArray(propertiesTable.id, [propertyAId, propertyBId].filter(Boolean)));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [aliceId, bobId]));
  });

  it("denies unauthenticated refund access", async () => {
    const response = await request(
      `/admin/bookings/${noPaymentBookingId}/refunds`,
      {},
      false,
    );
    expect(response.status).toBe(401);
  });

  it("returns an explicit zero-refund reason and rejects a booking with no linked payment", async () => {
    const summaryResponse = await request(`/admin/bookings/${noPaymentBookingId}/refunds`);
    expect(summaryResponse.status).toBe(200);
    const summary = (await summaryResponse.json()) as any;
    expect(summary).toMatchObject({
      status: "none",
      grossPaidMinor: 0,
      refundedMinor: 0,
      netPaidMinor: 0,
      remainingRefundableMinor: 0,
      availablePaymentSources: [],
      refunds: [],
    });
    expect(summary.refundableReason).toContain("legacy bookings");

    const createResponse = await request(
      `/admin/bookings/${noPaymentBookingId}/refunds`,
      {
        method: "POST",
        body: JSON.stringify({
          invoicePaymentId: 999_999_999,
          amountMinor: 100,
          refundDate: "2021-01-01",
          reason: "Legacy booking has no payment",
          method: "cash",
          idempotencyKey: `refund-no-source-${suffix}`,
        }),
      },
    );
    expect(createResponse.status).toBe(409);
    expect(((await createResponse.json()) as any).message).toContain("0 refundable amount");
  });

  it("rejects future/prior refund dates but allows the payment date itself", async () => {
    const future = await request(`/admin/bookings/${dateFixture.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: dateFixture.paymentId,
        amountMinor: 100,
        refundDate: "2099-01-01",
        reason: "Future return",
        method: "cash",
        idempotencyKey: `refund-future-date-${suffix}`,
      }),
    });
    expect(future.status).toBe(400);
    expect(((await future.json()) as any).message).toContain("future");

    const beforePayment = await request(`/admin/bookings/${dateFixture.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: dateFixture.paymentId,
        amountMinor: 100,
        refundDate: "2019-12-31",
        reason: "Before payment return",
        method: "cash",
        idempotencyKey: `refund-before-payment-date-${suffix}`,
      }),
    });
    expect(beforePayment.status).toBe(400);
    expect(((await beforePayment.json()) as any).message).toContain("before");

    const sameDay = await request(`/admin/bookings/${dateFixture.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: dateFixture.paymentId,
        amountMinor: 100,
        refundDate: "2020-01-01",
        reason: "Same-day return",
        method: "cash",
        idempotencyKey: `refund-same-day-${suffix}`,
      }),
    });
    expect(sameDay.status).toBe(201);
    expect(((await sameDay.json()) as any).refundedMinor).toBe(100);
  });

  it("rejects future manual payment dates while allowing today's India business date", async () => {
    const future = await request(`/admin/invoices/${paymentDateInvoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amountMinor: 100,
        paymentDate: "2099-01-01",
        method: "cash",
        idempotencyKey: `payment-future-date-${suffix}`,
      }),
    });
    expect(future.status).toBe(400);
    expect(((await future.json()) as any).message).toContain("future");

    const sameDay = await request(`/admin/invoices/${paymentDateInvoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amountMinor: 100,
        paymentDate: currentBusinessDate(),
        method: "cash",
        idempotencyKey: `payment-same-day-${suffix}`,
      }),
    });
    expect(sameDay.status).toBe(201);
    expect(((await sameDay.json()) as any).paidMinor).toBe(100);
  });

  it("guards partial/full refunds and rejects an over-refund", async () => {
    const first = await request(`/admin/bookings/${partial.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: partial.paymentId,
        amountMinor: 4_000,
        refundDate: "2021-01-15",
        reason: "Partial manual return",
        method: "upi",
        idempotencyKey: `refund-partial-${suffix}`,
      }),
    });
    expect(first.status).toBe(201);
    expect(((await first.json()) as any).status).toBe("partial");

    const over = await request(`/admin/bookings/${partial.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: partial.paymentId,
        amountMinor: 7_000,
        refundDate: "2021-01-15",
        reason: "Too much",
        method: "upi",
        idempotencyKey: `refund-over-${suffix}`,
      }),
    });
    expect(over.status).toBe(409);

    const second = await request(`/admin/bookings/${partial.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: partial.paymentId,
        amountMinor: 6_000,
        refundDate: "2021-01-16",
        reason: "Final manual return",
        method: "cash",
        idempotencyKey: `refund-full-${suffix}`,
      }),
    });
    expect(second.status).toBe(201);
    const full = (await second.json()) as any;
    expect(full).toMatchObject({
      status: "full",
      grossPaidMinor: 10_000,
      refundedMinor: 10_000,
      netPaidMinor: 0,
      remainingRefundableMinor: 0,
      availablePaymentSources: [],
    });
    expect(full.refunds).toHaveLength(2);
  });

  it("returns the same idempotent result once and rejects a mismatched retry", async () => {
    const input = {
      invoicePaymentId: idempotent.paymentId,
      amountMinor: 1_000,
      refundDate: "2021-01-17",
      reason: "Same manual return",
      method: "bank",
      idempotencyKey: `refund-idempotent-${suffix}`,
    };
    const first = await request(`/admin/bookings/${idempotent.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const retry = await request(`/admin/bookings/${idempotent.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(((await retry.json()) as any).refundedMinor).toBe(1_000);

    const mismatch = await request(`/admin/bookings/${idempotent.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({ ...input, amountMinor: 2_000 }),
    });
    expect(mismatch.status).toBe(409);
    const rows = await db
      .select()
      .from(bookingRefundsTable)
      .where(eq(bookingRefundsTable.bookingId, idempotent.bookingId));
    expect(rows).toHaveLength(1);
  });

  it("serializes concurrent refund attempts so only one can exceed a source balance", async () => {
    const body = (key: string) => ({
      invoicePaymentId: concurrent.paymentId,
      amountMinor: 700,
      refundDate: "2021-01-18",
      reason: "Concurrent return",
      method: "card",
      idempotencyKey: key,
    });
    const responses = await Promise.all([
      request(`/admin/bookings/${concurrent.bookingId}/refunds`, {
        method: "POST",
        body: JSON.stringify(body(`refund-concurrent-a-${suffix}`)),
      }),
      request(`/admin/bookings/${concurrent.bookingId}/refunds`, {
        method: "POST",
        body: JSON.stringify(body(`refund-concurrent-b-${suffix}`)),
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const rows = await db
      .select()
      .from(bookingRefundsTable)
      .where(eq(bookingRefundsTable.invoicePaymentId, concurrent.paymentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountMinor).toBe(700);
  });

  it("does not auto-refund cancellation and still allows an explicit manual refund", async () => {
    const cancelledResponse = await request(`/admin/bookings/${cancelled.bookingId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(cancelledResponse.status).toBe(200);

    const before = await request(`/admin/bookings/${cancelled.bookingId}/refunds`);
    expect(before.status).toBe(200);
    expect((await before.json())).toMatchObject({
      status: "none",
      refundedMinor: 0,
      remainingRefundableMinor: 3_000,
      refunds: [],
    });

    const manual = await request(`/admin/bookings/${cancelled.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: cancelled.paymentId,
        amountMinor: 500,
        refundDate: "2021-01-19",
        reason: "Cancellation reviewed manually",
        method: "cash",
        idempotencyKey: `refund-cancelled-${suffix}`,
      }),
    });
    expect(manual.status).toBe(201);
    expect(((await manual.json()) as any).status).toBe("partial");
  });

  it("uses refundDate and linked booking filters in the report", async () => {
    const invoiceRefund = await request(`/admin/bookings/${invoice.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: invoice.paymentId,
        amountMinor: 3_000,
        refundDate: "2021-01-20",
        reason: "Invoice totals return",
        method: "upi",
        idempotencyKey: `refund-invoice-${suffix}`,
      }),
    });
    expect(invoiceRefund.status).toBe(201);

    const response = await request(
      `/admin/business-reports?period=monthly&from=2021-01-01&to=2021-01-31` +
        `&propertyId=${propertyAId}&bookingStatus=confirmed&customer=${encodeURIComponent("Alice Refund")}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.refunds.summary).toEqual({
      refundedTransactions: 4,
      distinctBookings: 3,
      refundedAmountMinor: 14_000,
    });
    expect(body.refunds.rows.every((row: any) => row.refundDate.startsWith("2021-01"))).toBe(true);
    expect(body.refunds.rows.every((row: any) => row.propertyId === propertyAId)).toBe(true);
    expect(body.refunds.rows.every((row: any) => row.bookingStatus === "confirmed")).toBe(true);
    expect(body.refunds.rows.every((row: any) => row.guestName === "Alice Refund")).toBe(true);
    // Booking value remains a booking-created-date metric and must not be
    // populated by refunds whose completion dates are in this range.
    expect(body.revenue.summary.bookingValue).toBe(0);

    const cancelledReport = await request(
      `/admin/business-reports?period=daily&from=2021-01-19&to=2021-01-19&bookingStatus=cancelled`,
    );
    expect(cancelledReport.status).toBe(200);
    const cancelledBody = (await cancelledReport.json()) as any;
    expect(cancelledBody.refunds.summary).toEqual({
      refundedTransactions: 1,
      distinctBookings: 1,
      refundedAmountMinor: 500,
    });
    expect(cancelledBody.refunds.rows[0]).toMatchObject({
      bookingId: cancelled.bookingId,
      propertyId: propertyBId,
      bookingStatus: "cancelled",
    });
  });

  it("exposes gross/returned/net invoice totals while keeping original due balance", async () => {
    const refund = await request(`/admin/bookings/${invoice.bookingId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        invoicePaymentId: invoice.paymentId,
        amountMinor: 3_000,
        refundDate: "2021-01-20",
        reason: "Invoice totals return",
        method: "upi",
        idempotencyKey: `refund-invoice-${suffix}`,
      }),
    });
    expect(refund.status).toBe(201);

    const response = await request(`/admin/invoices/${invoice.invoiceId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body).toMatchObject({
      totalMinor: 12_000,
      paidMinor: 12_000,
      grossPaidMinor: 12_000,
      refundedMinor: 3_000,
      netPaidMinor: 9_000,
      dueMinor: 0,
      status: "paid",
    });
    expect(body.refunds).toHaveLength(1);
  });
});