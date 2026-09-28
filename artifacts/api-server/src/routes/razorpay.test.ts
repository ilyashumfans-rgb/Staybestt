import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUser: vi.fn(),
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  getRazorpayConfig: vi.fn(),
  getRazorpayReadiness: vi.fn(),
  getRazorpayReadinessWithProbe: undefined,
  verifyRazorpayCheckoutSignature: vi.fn(),
  verifyRazorpayWebhookSignature: vi.fn(),
  fetchRazorpayPayment: vi.fn(),
  fetchRazorpayOrderPayments: vi.fn(),
  verifyRazorpayCredentials: vi.fn(),
  recordRazorpayPayment: vi.fn(),
  loadPaymentSummary: vi.fn(),
}));

vi.mock("../lib/auth", () => ({ resolveUser: mocks.resolveUser }));
vi.mock("../lib/razorpayProvider", () => ({
  getRazorpayConfig: mocks.getRazorpayConfig,
  getRazorpayReadiness: mocks.getRazorpayReadiness,
  getRazorpayReadinessWithProbe: mocks.getRazorpayReadinessWithProbe,
  verifyRazorpayCheckoutSignature: mocks.verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature: mocks.verifyRazorpayWebhookSignature,
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  fetchRazorpayOrderPayments: mocks.fetchRazorpayOrderPayments,
  verifyRazorpayCredentials: mocks.verifyRazorpayCredentials,
  createRazorpayOrder: vi.fn(),
  RazorpayProviderError: class RazorpayProviderError extends Error {
    providerStatus: number | null = null;
  },
}));
vi.mock("../lib/razorpay", () => ({
  bookingTotalMinor: (amount: number) => Math.round(amount * 100),
  loadPaymentSummary: mocks.loadPaymentSummary,
  recordRazorpayPayment: mocks.recordRazorpayPayment,
  RazorpayLedgerError: class RazorpayLedgerError extends Error {
    code = "order_mismatch";
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: () => ({}),
}));
vi.mock("@workspace/db", () => ({
  db: mocks.db,
  bookingsTable: { id: "booking.id" },
  invoicePaymentsTable: { id: "payment.id", invoiceId: "payment.invoiceId", method: "payment.method" },
  invoicesTable: { id: "invoice.id", bookingId: "invoice.bookingId" },
  razorpayOrdersTable: { id: "order.id", bookingId: "order.bookingId", externalOrderId: "order.externalOrderId", mode: "order.mode" },
  razorpayPaymentsTable: { id: "razorpayPayment.id", bookingId: "razorpayPayment.bookingId", status: "razorpayPayment.status" },
  razorpayWebhookEventsTable: { eventId: "webhook.eventId" },
}));

import razorpayRouter from "./razorpay";

const config = {
  keyId: "rzp_test_synthetic",
  keySecret: "synthetic-secret",
  webhookSecret: "webhook-secret",
  mode: "test" as const,
};
const booking = { id: 7, userId: "user-1", status: "confirmed" };
const order = {
  id: 11,
  bookingId: 7,
  externalOrderId: "order_7",
  amountMinor: 12_345,
  currency: "INR",
  mode: "test",
  receipt: "SB-TEST-1",
  status: "created",
};
const paidSummary = {
  status: "paid",
  provider: "razorpay",
  amountMinor: 12_345,
  paidMinor: 12_345,
  dueMinor: 0,
  currency: "INR",
  orderId: "order_7",
  paymentId: "pay_7",
  verifiedAt: new Date().toISOString(),
  requiresRefund: false,
};

function queueSelect(result: unknown) {
  const whereResult = {
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  mocks.db.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  });
}

let server: Server;
let baseUrl: string;
let rawServer: Server;
let rawBaseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(razorpayRouter);
  server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const rawApp = express();
  rawApp.use("/api", express.raw({ type: "application/json" }));
  rawApp.use("/api", razorpayRouter);
  rawServer = await new Promise<Server>((resolve, reject) => {
    const instance = rawApp.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const rawAddress = rawServer.address();
  if (!rawAddress || typeof rawAddress === "string") throw new Error("Raw test server did not bind");
  rawBaseUrl = `http://127.0.0.1:${rawAddress.port}`;
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => rawServer.close((error) => error ? reject(error) : resolve())),
  ]);
});

beforeEach(() => {
  mocks.resolveUser.mockReset();
  mocks.db.select.mockReset();
  mocks.db.insert.mockReset();
  mocks.db.update.mockReset();
  mocks.getRazorpayConfig.mockReset().mockReturnValue(config);
  mocks.getRazorpayReadiness.mockReset().mockReturnValue({
    configured: true,
    mode: "test",
    webhookConfigured: true,
  });
  mocks.verifyRazorpayCredentials.mockReset().mockResolvedValue(true);
  mocks.verifyRazorpayCheckoutSignature.mockReset().mockReturnValue(true);
  mocks.verifyRazorpayWebhookSignature.mockReset().mockReturnValue(false);
  mocks.fetchRazorpayPayment.mockReset();
  mocks.fetchRazorpayOrderPayments.mockReset();
  mocks.recordRazorpayPayment.mockReset().mockResolvedValue(paidSummary);
  mocks.loadPaymentSummary.mockReset();
});

describe("Razorpay owner and payment verification routes", () => {
  it("caches the read-only readiness probe instead of calling Razorpay per request", async () => {
    const first = await fetch(`${baseUrl}/razorpay/readiness`);
    const second = await fetch(`${baseUrl}/razorpay/readiness`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.verifyRazorpayCredentials).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-owner before any provider/payment operation", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "different-user" });
    queueSelect([{ ...booking, userId: "user-1" }]);

    const response = await fetch(`${baseUrl}/bookings/7/razorpay/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_7",
        razorpayPaymentId: "pay_7",
        razorpaySignature: "signature",
      }),
    });
    expect(response.status).toBe(404);
    expect(mocks.fetchRazorpayPayment).not.toHaveBeenCalled();
    expect(mocks.recordRazorpayPayment).not.toHaveBeenCalled();
  });

  it("rejects a non-owner before minting a Razorpay order", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "different-user" });
    queueSelect([{ ...booking, userId: "user-1" }]);

    const response = await fetch(`${baseUrl}/bookings/7/razorpay/order`, {
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(mocks.getRazorpayConfig).not.toHaveBeenCalled();
    expect(mocks.loadPaymentSummary).not.toHaveBeenCalled();
  });

  it("rejects invalid checkout signatures", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    queueSelect([booking]);
    queueSelect([order]);
    mocks.verifyRazorpayCheckoutSignature.mockReturnValue(false);

    const response = await fetch(`${baseUrl}/bookings/7/razorpay/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_7",
        razorpayPaymentId: "pay_7",
        razorpaySignature: "bad",
      }),
    });
    expect(response.status).toBe(400);
    expect(mocks.fetchRazorpayPayment).not.toHaveBeenCalled();
  });

  it("rejects provider amount/currency mismatches before recording money", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    queueSelect([booking]);
    queueSelect([order]);
    mocks.fetchRazorpayPayment.mockResolvedValue({
      id: "pay_7",
      order_id: "order_7",
      amount: 12_346,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    const response = await fetch(`${baseUrl}/bookings/7/razorpay/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_7",
        razorpayPaymentId: "pay_7",
        razorpaySignature: "valid",
      }),
    });
    expect(response.status).toBe(400);
    expect(mocks.recordRazorpayPayment).not.toHaveBeenCalled();
  });

  it("records authorization as processing, never as paid", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    queueSelect([booking]);
    queueSelect([order]);
    mocks.fetchRazorpayPayment.mockResolvedValue({
      id: "pay_auth",
      order_id: "order_7",
      amount: 12_345,
      currency: "INR",
      status: "authorized",
      captured: false,
    });
    mocks.recordRazorpayPayment.mockResolvedValue({
      ...paidSummary,
      status: "processing",
      paidMinor: 0,
      dueMinor: 12_345,
      paymentId: "pay_auth",
    });

    const response = await fetch(`${baseUrl}/bookings/7/razorpay/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_7",
        razorpayPaymentId: "pay_auth",
        razorpaySignature: "valid",
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({ status: "processing" });
    expect(mocks.recordRazorpayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ status: "authorized", amountMinor: 12_345 }),
    );
  });

  it("returns the same captured result for concurrent verification retries", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    queueSelect([booking]);
    queueSelect([order]);
    queueSelect([booking]);
    queueSelect([order]);
    mocks.fetchRazorpayPayment.mockResolvedValue({
      id: "pay_retry",
      order_id: "order_7",
      amount: 12_345,
      currency: "INR",
      status: "captured",
      captured: true,
    });
    let ledgerWrites = 0;
    let processed = false;
    mocks.recordRazorpayPayment.mockImplementation(async () => {
      if (!processed) {
        ledgerWrites += 1;
        processed = true;
      }
      return { ...paidSummary, paymentId: "pay_retry" };
    });
    const request = () => fetch(`${baseUrl}/bookings/7/razorpay/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_7",
        razorpayPaymentId: "pay_retry",
        razorpaySignature: "valid",
      }),
    });

    const [first, second] = await Promise.all([request(), request()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()) as { paymentId: string }).toMatchObject({ paymentId: "pay_retry" });
    expect((await second.json()) as { paymentId: string }).toMatchObject({ paymentId: "pay_retry" });
    expect(mocks.recordRazorpayPayment).toHaveBeenCalledTimes(2);
    // The mocked ledger models the booking lock + external-payment unique
    // constraint: concurrent retries produce one money row.
    expect(ledgerWrites).toBe(1);
  });

  it("reconciles every historical order attempt, not only the newest", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    const firstOrder = { ...order, bookingId: 8, id: 21, externalOrderId: "order_old" };
    const secondOrder = { ...order, bookingId: 8, id: 22, externalOrderId: "order_new" };
    queueSelect([{ ...booking, id: 8 }]);
    queueSelect([secondOrder, firstOrder]);
    mocks.loadPaymentSummary.mockResolvedValue({
      ...paidSummary,
      status: "processing",
      paidMinor: 0,
      dueMinor: 12_345,
      orderId: "order_new",
      paymentId: null,
    });
    mocks.fetchRazorpayOrderPayments.mockImplementation(async (orderId: string) => [{
      id: `pay_${orderId}`,
      order_id: orderId,
      amount: 12_345,
      currency: "INR",
      status: "authorized",
      captured: false,
    }]);
    mocks.recordRazorpayPayment.mockResolvedValue({
      ...paidSummary,
      status: "processing",
      paidMinor: 0,
      dueMinor: 12_345,
    });

    const response = await fetch(`${baseUrl}/bookings/8/razorpay/status`);
    expect(response.status).toBe(200);
    expect(mocks.fetchRazorpayOrderPayments).toHaveBeenCalledTimes(2);
    expect(mocks.fetchRazorpayOrderPayments).toHaveBeenCalledWith("order_new");
    expect(mocks.fetchRazorpayOrderPayments).toHaveBeenCalledWith("order_old");
  });

  it("polls historical attempts after paid to detect a duplicate capture", async () => {
    mocks.resolveUser.mockResolvedValue({ id: "user-1" });
    const paidOrder = { ...order, bookingId: 9, id: 31, externalOrderId: "order_paid" };
    const olderOrder = { ...order, bookingId: 9, id: 32, externalOrderId: "order_older" };
    queueSelect([{ ...booking, id: 9 }]);
    queueSelect([paidOrder, olderOrder]);
    mocks.loadPaymentSummary.mockResolvedValue({ ...paidSummary, status: "paid" });
    mocks.fetchRazorpayOrderPayments.mockImplementation(async (orderId: string) => [{
      id: orderId === "order_older" ? "pay_duplicate" : "pay_paid",
      order_id: orderId,
      amount: 12_345,
      currency: "INR",
      status: orderId === "order_older" ? "captured" : "authorized",
      captured: orderId === "order_older",
    }]);
    mocks.recordRazorpayPayment.mockResolvedValue({
      ...paidSummary,
      status: "refund_required",
      requiresRefund: true,
      paymentId: "pay_duplicate",
    });

    const response = await fetch(`${baseUrl}/bookings/9/razorpay/status`);
    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({
      status: "refund_required",
    });
    expect(mocks.fetchRazorpayOrderPayments).toHaveBeenCalledTimes(2);
  });
});

describe("raw Razorpay webhook route", () => {
  it("short-circuits duplicate processed events idempotently", async () => {
    const body = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_7"}}}}');
    mocks.verifyRazorpayWebhookSignature.mockReturnValue(true);
    queueSelect([{ eventId: "evt_1", status: "processed" }]);

    const response = await fetch(`${rawBaseUrl}/api/razorpay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "synthetic",
        "x-razorpay-event-id": "evt_1",
      },
      body,
    });
    expect(response.status).toBe(200);
    expect(mocks.fetchRazorpayPayment).not.toHaveBeenCalled();
  });

  it("passes exact raw bytes to signature validation before parsing", async () => {
    const body = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_7"}}}}');
    mocks.verifyRazorpayWebhookSignature.mockImplementation(
      (raw: Buffer) => Buffer.isBuffer(raw) && raw.equals(body),
    );

    const response = await fetch(`${rawBaseUrl}/api/razorpay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "synthetic",
      },
      body: Buffer.concat([body, Buffer.from(" ")]),
    });
    expect(response.status).toBe(400);
    expect(mocks.verifyRazorpayWebhookSignature).toHaveBeenCalledWith(
      expect.any(Buffer),
      "synthetic",
      "webhook-secret",
    );
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
});