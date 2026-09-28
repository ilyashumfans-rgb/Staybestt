import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const mocks = vi.hoisted(() => {
  const table = (name: string, columns: string[]) => ({
    __name: name,
    ...Object.fromEntries(columns.map((column) => [column, { __column: column }])),
  });
  const tables = {
    sessions: table("sessions", [
      "id", "userId", "bookingId", "capabilityHash", "checkoutTokenHash",
      "amountMinor", "currency", "mode", "capabilityExpiresAt",
      "capabilityConsumedAt", "checkoutIssuedAt", "checkoutExpiresAt",
      "completedAt", "revokedAt", "createdAt", "updatedAt",
    ]),
    users: table("users", ["id", "status"]),
    bookings: table("bookings", [
      "id", "userId", "status", "totalAmount", "bookingRef",
    ]),
    orders: table("orders", [
      "id", "bookingId", "externalOrderId", "amountMinor", "currency",
      "mode", "receipt", "attempt", "status", "createdAt", "updatedAt",
    ]),
    payments: table("payments", [
      "id", "bookingId", "orderId", "externalPaymentId", "externalOrderId",
      "amountMinor", "currency", "mode", "status", "refundRequired",
      "verifiedAt", "createdAt", "updatedAt",
    ]),
    invoicePayments: table("invoicePayments", ["id", "invoiceId", "method"]),
    invoices: table("invoices", ["id", "bookingId"]),
    webhooks: table("webhooks", ["eventId"]),
  };

  const state: {
    sessions: Row[];
    users: Row[];
    bookings: Row[];
    orders: Row[];
    payments: Row[];
    summaries: Map<number, Row | null>;
    nextSessionId: number;
  } = {
    sessions: [],
    users: [{ id: "owner-1", status: "active" }],
    bookings: [{
      id: 7,
      userId: "owner-1",
      status: "confirmed",
      totalAmount: 123.45,
      bookingRef: "SB-TEST7",
    }],
    orders: [],
    payments: [],
    summaries: new Map(),
    nextSessionId: 1,
  };

  const matches = (expression: any, row: Row): boolean => {
    if (!expression) return true;
    if (expression.type === "and") {
      return expression.conditions.every((condition: any) => matches(condition, row));
    }
    if (expression.type === "eq") {
      return row[expression.column.__column] === expression.value;
    }
    if (expression.type === "gt") {
      return row[expression.column.__column] > expression.value;
    }
    if (expression.type === "isNull") {
      return row[expression.column.__column] == null;
    }
    return true;
  };

  const rowsForTable = (source: any): Row[] => {
    if (source === tables.sessions) return state.sessions;
    if (source === tables.users) return state.users;
    if (source === tables.bookings) return state.bookings;
    if (source === tables.orders) return state.orders;
    if (source === tables.payments) return state.payments;
    if (source === tables.invoicePayments) return [];
    if (source === tables.invoices) return [];
    if (source === tables.webhooks) return [];
    return [];
  };

  const makeSelectQuery = (source: any) => {
    let filtered = rowsForTable(source);
    const query = {
      where: vi.fn((expression: any) => {
        filtered = filtered.filter((row) => matches(expression, row));
        return query;
      }),
      orderBy: vi.fn(() => query),
      limit: vi.fn((count: number) => {
        filtered = filtered.slice(0, count);
        return query;
      }),
      innerJoin: vi.fn(() => query),
      then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(filtered).then(resolve, reject),
    };
    return query;
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((source: any) => makeSelectQuery(source)),
    })),
    insert: vi.fn((source: any) => ({
      values: vi.fn((values: Row) => ({
        returning: vi.fn(async () => {
          if (source === tables.sessions) {
            const session = {
              id: state.nextSessionId++,
              ...values,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            state.sessions.push(session);
            return [session];
          }
          return [];
        }),
        onConflictDoNothing: vi.fn(async () => undefined),
      })),
    })),
    update: vi.fn((source: any) => {
      let values: Row = {};
      return {
        set: vi.fn((next: Row) => {
          values = next;
          return {
            where: vi.fn((expression: any) => ({
              returning: vi.fn(async () => {
                const rows = rowsForTable(source).filter((row) => matches(expression, row));
                rows.forEach((row) => Object.assign(row, values));
                return rows;
              }),
              then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            })),
          };
        }),
      };
    }),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
  };

  return {
    db,
    tables,
    state,
    createRazorpayOrder: vi.fn(),
    fetchRazorpayPayment: vi.fn(),
    fetchRazorpayOrderPayments: vi.fn(),
    getRazorpayConfig: vi.fn(),
    getRazorpayReadiness: vi.fn(),
    getRazorpayReadinessWithProbe: undefined,
    verifyRazorpayCheckoutSignature: vi.fn(),
    verifyRazorpayCredentials: vi.fn(),
    verifyRazorpayWebhookSignature: vi.fn(),
    recordRazorpayPayment: vi.fn(),
    loadPaymentSummary: vi.fn(),
    resolveUser: vi.fn(),
    RazorpayProviderError: class RazorpayProviderError extends Error {
      providerStatus: number | null = null;
    },
    RazorpayLedgerError: class RazorpayLedgerError extends Error {
      code = "order_mismatch";
    },
  };
});

vi.mock("../lib/auth", () => ({ resolveUser: mocks.resolveUser }));
vi.mock("../lib/razorpayProvider", () => ({
  createRazorpayOrder: mocks.createRazorpayOrder,
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  fetchRazorpayOrderPayments: mocks.fetchRazorpayOrderPayments,
  getRazorpayConfig: mocks.getRazorpayConfig,
  getRazorpayReadiness: mocks.getRazorpayReadiness,
  getRazorpayReadinessWithProbe: mocks.getRazorpayReadinessWithProbe,
  verifyRazorpayCheckoutSignature: mocks.verifyRazorpayCheckoutSignature,
  verifyRazorpayCredentials: mocks.verifyRazorpayCredentials,
  verifyRazorpayWebhookSignature: mocks.verifyRazorpayWebhookSignature,
  RazorpayProviderError: mocks.RazorpayProviderError,
}));
vi.mock("../lib/razorpay", () => ({
  bookingTotalMinor: (amount: number) => Math.round(amount * 100),
  loadPaymentSummary: mocks.loadPaymentSummary,
  recordRazorpayPayment: mocks.recordRazorpayPayment,
  RazorpayLedgerError: mocks.RazorpayLedgerError,
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: any[]) => ({ type: "and", conditions }),
  desc: vi.fn(),
  eq: (column: any, value: any) => ({ type: "eq", column, value }),
  gt: (column: any, value: any) => ({ type: "gt", column, value }),
  inArray: vi.fn(),
  isNull: (column: any) => ({ type: "isNull", column }),
  sql: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: mocks.db,
  bookingsTable: mocks.tables.bookings,
  invoicePaymentsTable: mocks.tables.invoicePayments,
  invoicesTable: mocks.tables.invoices,
  razorpayMobileSessionsTable: mocks.tables.sessions,
  razorpayOrdersTable: mocks.tables.orders,
  razorpayPaymentsTable: mocks.tables.payments,
  razorpayWebhookEventsTable: mocks.tables.webhooks,
  usersTable: mocks.tables.users,
}));

import razorpayRouter from "./razorpay";

const providerConfig = {
  keyId: "rzp_test_mobile",
  keySecret: "test-secret",
  webhookSecret: null,
  mode: "test" as const,
};

const paidSummary = {
  status: "paid",
  provider: "razorpay",
  amountMinor: 12_345,
  paidMinor: 12_345,
  dueMinor: 0,
  currency: "INR",
  orderId: "order_mobile",
  paymentId: "pay_mobile",
  verifiedAt: new Date().toISOString(),
  requiresRefund: false,
};

let server: Server;
let baseUrl: string;

function resetState(): void {
  mocks.state.sessions.length = 0;
  mocks.state.orders.length = 0;
  mocks.state.payments.length = 0;
  mocks.state.summaries.clear();
  mocks.state.nextSessionId = 1;
  mocks.state.users.splice(0, mocks.state.users.length, { id: "owner-1", status: "active" });
  mocks.state.bookings.splice(0, mocks.state.bookings.length, {
    id: 7,
    userId: "owner-1",
    status: "confirmed",
    totalAmount: 123.45,
    bookingRef: "SB-TEST7",
  });
}

function mockSummary(bookingId: number): Row {
  return mocks.state.summaries.get(bookingId) ?? {
    ...paidSummary,
    status: "unpaid",
    paidMinor: 0,
    dueMinor: 12_345,
    paymentId: null,
  };
}

async function mint(): Promise<{ token: string; bookingId: number }> {
  mocks.resolveUser.mockResolvedValue({ id: "owner-1", status: "active" });
  const response = await fetch(`${baseUrl}/bookings/7/razorpay/mobile-session`, {
    method: "POST",
    headers: { authorization: "Bearer clerk-owner-token" },
  });
  expect(response.status).toBe(201);
  const payload = await response.json() as { token: string; bookingId: number; url?: string };
  expect(payload).not.toHaveProperty("url");
  expect(JSON.stringify(payload)).not.toContain("SB-TEST7");
  return payload;
}

async function exchange(token: string): Promise<Response> {
  return fetch(`${baseUrl}/razorpay/mobile/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

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
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  resetState();
  mocks.resolveUser.mockReset();
  mocks.getRazorpayConfig.mockReset().mockReturnValue(providerConfig);
  mocks.getRazorpayReadiness.mockReset().mockReturnValue({
    configured: true,
    mode: "test",
    webhookConfigured: false,
  });
  mocks.verifyRazorpayCheckoutSignature.mockReset().mockReturnValue(true);
  mocks.fetchRazorpayPayment.mockReset().mockResolvedValue({
    id: "pay_mobile",
    order_id: "order_mobile",
    amount: 12_345,
    currency: "INR",
    status: "captured",
    captured: true,
  });
  mocks.fetchRazorpayOrderPayments.mockReset().mockResolvedValue([]);
  mocks.createRazorpayOrder.mockReset().mockResolvedValue({
    id: "order_mobile",
    amount: 12_345,
    currency: "INR",
    receipt: "SB-TEST7-1",
    status: "created",
  });
  mocks.recordRazorpayPayment.mockReset().mockResolvedValue(paidSummary);
  mocks.loadPaymentSummary.mockReset().mockImplementation(async (bookingId: number) => mockSummary(bookingId));
});

describe("secure hosted Razorpay mobile handoff", () => {
  it("mints only for the active owner and persists hashes, not token plaintext or URL PII", async () => {
    const minted = await mint();
    expect(minted.token).toHaveLength(43);
    expect(minted.bookingId).toBe(7);
    expect(mocks.state.sessions).toHaveLength(1);
    const session = mocks.state.sessions[0];
    expect(session.capabilityHash).not.toBe(minted.token);
    expect(session.checkoutTokenHash).toBeUndefined();

    mocks.resolveUser.mockResolvedValue({ id: "other-user", status: "active" });
    const denied = await fetch(`${baseUrl}/bookings/7/razorpay/mobile-session`, {
      method: "POST",
    });
    expect(denied.status).toBe(404);
    expect((await denied.text())).not.toContain("SB-TEST7");
  });

  it("exchanges once, rejects wrong/expired/replayed capability, and emits no-cache errors", async () => {
    const minted = await mint();
    const first = await exchange(minted.token);
    expect(first.status).toBe(200);
    const exchanged = (await first.json()) as { checkoutToken: string };
    expect(exchanged.checkoutToken).toHaveLength(43);
    expect(mocks.state.sessions[0].checkoutTokenHash).not.toBe(exchanged.checkoutToken);
    expect(mocks.state.sessions[0].checkoutTokenHash).not.toBe(mocks.state.sessions[0].capabilityHash);

    const replay = await exchange(minted.token);
    expect(replay.status).toBe(401);
    expect(replay.headers.get("cache-control")).toContain("no-store");
    const wrong = await exchange("wrong-capability");
    expect(wrong.status).toBe(401);
    expect((await wrong.text())).not.toContain("clerk-owner-token");
    const invalidHeader = await fetch(`${baseUrl}/razorpay/mobile/status`, {
      headers: { "X-Mobile-Checkout-Token": "not-a-checkout-token" },
    });
    expect(invalidHeader.status).toBe(401);
    expect(invalidHeader.headers.get("cache-control")).toContain("no-store");
    expect((await invalidHeader.text())).not.toContain("rzp_test_mobile");

    const concurrent = await mint();
    const [firstRace, secondRace] = await Promise.all([
      exchange(concurrent.token),
      exchange(concurrent.token),
    ]);
    expect([firstRace.status, secondRace.status].sort()).toEqual([200, 401]);

    resetState();
    const expired = await mint();
    mocks.state.sessions[0].capabilityExpiresAt = new Date(Date.now() - 1);
    expect((await exchange(expired.token)).status).toBe(401);
  });

  it("revalidates active user, ownership, amount, and mode before scoped access", async () => {
    const minted = await mint();
    const exchangeResponse = await exchange(minted.token);
    const { checkoutToken } = (await exchangeResponse.json()) as { checkoutToken: string };

    mocks.state.users[0].status = "blocked";
    const inactive = await fetch(`${baseUrl}/razorpay/mobile/status`, {
      headers: { "X-Mobile-Checkout-Token": checkoutToken },
    });
    expect(inactive.status).toBe(401);
    expect(mocks.fetchRazorpayOrderPayments).not.toHaveBeenCalled();

    mocks.state.users[0].status = "active";
    mocks.state.bookings[0].totalAmount = 999;
    const amountChanged = await fetch(`${baseUrl}/razorpay/mobile/status`, {
      headers: { authorization: `Bearer ${checkoutToken}` },
    });
    expect(amountChanged.status).toBe(401);

    mocks.state.bookings[0].totalAmount = 123.45;
    mocks.getRazorpayConfig.mockReturnValue({ ...providerConfig, mode: "live" });
    const modeChanged = await fetch(`${baseUrl}/razorpay/mobile/status`, {
      headers: { "X-Mobile-Checkout-Token": checkoutToken },
    });
    expect(modeChanged.status).toBe(409);
  });

  it("keeps scoped endpoints bound to the session booking and disallows canceled new orders", async () => {
    const minted = await mint();
    const exchanged = (await (await exchange(minted.token)).json()) as { checkoutToken: string };
    mocks.state.bookings[0].status = "cancelled";
    mocks.state.sessions[0].revokedAt = new Date();

    const order = await fetch(`${baseUrl}/razorpay/mobile/order?bookingId=999`, {
      method: "POST",
      headers: { "X-Mobile-Checkout-Token": exchanged.checkoutToken },
    });
    expect(order.status).toBe(409);
    expect(mocks.createRazorpayOrder).not.toHaveBeenCalled();

    mocks.state.orders.push({
      id: 1,
      bookingId: 7,
      externalOrderId: "order_mobile",
      amountMinor: 12_345,
      currency: "INR",
      mode: "test",
      status: "created",
      createdAt: new Date(),
    });
    mocks.loadPaymentSummary.mockImplementation(async () => ({
      ...paidSummary,
      status: "refund_required",
      requiresRefund: true,
    }));
    const lateCaptureSummary = {
      ...paidSummary,
      status: "refund_required",
      requiresRefund: true,
    };
    let invoiceWrites = 0;
    const seenPaymentIds = new Set<string>();
    mocks.recordRazorpayPayment.mockImplementation(async (input: { externalPaymentId: string }) => {
      if (!seenPaymentIds.has(input.externalPaymentId)) {
        seenPaymentIds.add(input.externalPaymentId);
        invoiceWrites += 1;
      }
      return lateCaptureSummary;
    });
    const verify = await fetch(`${baseUrl}/razorpay/mobile/verify`, {
      method: "POST",
      headers: {
        "X-Mobile-Checkout-Token": exchanged.checkoutToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        razorpayOrderId: "order_mobile",
        razorpayPaymentId: "pay_late",
        razorpaySignature: "valid",
      }),
    });
    expect(verify.status).toBe(200);
    expect((await verify.json() as { status: string }).status).toBe("refund_required");
    expect(mocks.recordRazorpayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 7, externalPaymentId: "pay_mobile" }),
    );
    mocks.fetchRazorpayOrderPayments.mockResolvedValue([{
      id: "pay_mobile",
      order_id: "order_mobile",
      amount: 12_345,
      currency: "INR",
      status: "captured",
      captured: true,
    }]);
    const status = await fetch(`${baseUrl}/razorpay/mobile/status?bookingId=999`, {
      headers: { authorization: `Bearer ${exchanged.checkoutToken}` },
    });
    expect(status.status).toBe(200);
    expect((await status.json() as { bookingId: number; status: string })).toMatchObject({
      bookingId: 7,
      status: "refund_required",
    });
    expect(invoiceWrites).toBe(1);
  });

  it("uses the shared ledger path for repeated verify callbacks without provider charges", async () => {
    const minted = await mint();
    const exchanged = (await (await exchange(minted.token)).json()) as { checkoutToken: string };
    mocks.state.orders.push({
      id: 1,
      bookingId: 7,
      externalOrderId: "order_mobile",
      amountMinor: 12_345,
      currency: "INR",
      mode: "test",
      status: "created",
      createdAt: new Date(),
    });
    let invoiceWrites = 0;
    const seenPaymentIds = new Set<string>();
    mocks.recordRazorpayPayment.mockImplementation(async (input: { externalPaymentId: string }) => {
      if (!seenPaymentIds.has(input.externalPaymentId)) {
        seenPaymentIds.add(input.externalPaymentId);
        invoiceWrites += 1;
      }
      return paidSummary;
    });
    const body = JSON.stringify({
      razorpayOrderId: "order_mobile",
      razorpayPaymentId: "pay_mobile",
      razorpaySignature: "valid",
    });
    const verifyRequest = () => fetch(`${baseUrl}/razorpay/mobile/verify`, {
      method: "POST",
      headers: {
        "X-Mobile-Checkout-Token": exchanged.checkoutToken,
        "content-type": "application/json",
      },
      body,
    });
    expect((await verifyRequest()).status).toBe(200);
    expect((await verifyRequest()).status).toBe(200);
    expect(mocks.fetchRazorpayPayment).toHaveBeenCalledTimes(2);
    expect(invoiceWrites).toBe(1);
    expect(mocks.createRazorpayOrder).not.toHaveBeenCalled();
  });
});