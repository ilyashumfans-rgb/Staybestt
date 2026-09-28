import { createHash } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agentLifecycleEventsTable,
  bookingsTable,
  commercialTermEventsTable,
  commercialTermsTable,
  commissionLedgerTable,
  db,
  propertiesTable,
  propertyReviewEventsTable,
  roomsTable,
  usersTable,
} from "@workspace/db";

// The admin router derives its credential token exactly once at module import.
// Set isolated test credentials before its dynamic import in beforeAll so this
// test never relies on deployment secrets or a development fallback.
process.env.ADMIN_USERNAME = "agent-management-test-admin";
process.env.ADMIN_PASSWORD = "agent-management-test-password";
process.env.SESSION_SECRET = "agent-management-test-session-secret";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const suffix = `${process.pid}-${Date.now()}`;
const agentId = `agent-management-${suffix}`;
const customerId = `agent-management-customer-${suffix}`;
const token = createHash("sha256")
  .update(
    `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}:${process.env.SESSION_SECRET}`,
  )
  .digest("hex");
let server: Server;
let baseUrl = "";
let propertyId = 0;
let roomId = 0;
let bookingId = 0;

async function request(path: string, init: RequestInit = {}, authenticated = true) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

run("admin agent management", () => {
  beforeAll(async () => {
    const { default: adminRouter } = await import("./admin");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).log = { info() {}, warn() {}, error() {} };
      next();
    });
    app.use(adminRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) throw error;
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;

    await db.insert(usersTable).values([
      {
        id: agentId,
        email: `${agentId}@example.test`,
        name: "Managed Agent",
        role: "agent",
        status: "active",
        approvalStatus: "approved",
      },
      {
        id: customerId,
        email: `${customerId}@example.test`,
        name: "Not Agent",
        role: "customer",
      },
    ]);
    const [property] = await db.insert(propertiesTable).values({
      ownerId: agentId,
      name: "Agent Test Property",
      category: "budget",
      city: "Test City",
      area: "Test Area",
      pincode: "000000",
      address: "Test address",
      description: "Test",
      imageUrl: "https://example.test/property.jpg",
      startingPrice: 100,
      status: "pending",
    }).returning();
    propertyId = property!.id;
    const [room] = await db.insert(roomsTable).values({
      propertyId,
      name: "Test Room",
      description: "Test",
      imageUrl: "https://example.test/room.jpg",
      pricePerNight: 100,
    }).returning();
    roomId = room!.id;
    const [booking] = await db.insert(bookingsTable).values({
      bookingRef: `TEST-${suffix}`,
      agentId,
      propertyId,
      roomId,
      checkIn: "2030-01-01",
      checkOut: "2030-01-02",
      guests: 1,
      roomsCount: 1,
      guestName: "Safe Customer",
      guestEmail: "private@example.test",
      guestPhone: "9999999999",
      totalAmount: 100,
    }).returning();
    bookingId = booking!.id;
    await db.insert(commercialTermsTable).values({
      userId: agentId,
      mode: "percentage",
      value: 10,
    });
    await db.insert(commissionLedgerTable).values({
      bookingId,
      recipientUserId: agentId,
      allocationType: "agent",
      termMode: "percentage",
      termValue: 10,
      amount: 10,
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.delete(propertyReviewEventsTable).where(eq(propertyReviewEventsTable.agentId, agentId));
    await db.delete(agentLifecycleEventsTable).where(eq(agentLifecycleEventsTable.agentId, agentId));
    await db.delete(commercialTermEventsTable).where(eq(commercialTermEventsTable.userId, agentId));
    await db.delete(commissionLedgerTable).where(eq(commissionLedgerTable.bookingId, bookingId));
    await db.delete(bookingsTable).where(eq(bookingsTable.id, bookingId));
    await db.delete(roomsTable).where(eq(roomsTable.id, roomId));
    await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
    await db.delete(commercialTermsTable).where(eq(commercialTermsTable.userId, agentId));
    await db.delete(usersTable).where(eq(usersTable.id, agentId));
    await db.delete(usersTable).where(eq(usersTable.id, customerId));
  });

  it("requires admin auth and rejects non-agent detail IDs", async () => {
    expect((await request("/admin/agents", {}, false)).status).toBe(401);
    expect((await request(`/admin/agents/${customerId}`)).status).toBe(404);
  });

  it("returns aggregate totals and guards status concurrency", async () => {
    const list = await request(`/admin/agents?query=${encodeURIComponent(agentId)}`);
    expect(list.status).toBe(200);
    const payload = await list.json() as any;
    expect(payload.items).toHaveLength(1);
    expect(payload.summary.attributedBookings).toBeGreaterThanOrEqual(1);
    expect(payload.summary.commissionPending).toBeGreaterThanOrEqual(10);

    const blocked = await request(`/admin/agents/${agentId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "blocked", expectedStatus: "active", reason: "integration test" }),
    });
    expect(blocked.status).toBe(200);
    const stale = await request(`/admin/agents/${agentId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "blocked", expectedStatus: "active", reason: "stale writer" }),
    });
    expect(stale.status).toBe(409);
  });

  it("guards property review concurrency and preserves old booking term snapshots", async () => {
    const approved = await request(`/admin/agents/${agentId}/properties/${propertyId}/review`, {
      method: "POST",
      body: JSON.stringify({ status: "approved", expectedStatus: "pending" }),
    });
    expect(approved.status).toBe(200);
    const stale = await request(`/admin/agents/${agentId}/properties/${propertyId}/review`, {
      method: "POST",
      body: JSON.stringify({ status: "rejected", expectedStatus: "pending", reason: "stale" }),
    });
    expect(stale.status).toBe(409);

    const detail = await request(`/admin/agents/${agentId}`);
    expect(detail.status).toBe(200);
    const currentTerms = (await detail.json() as any).commercialTerms;
    const changed = await request(`/admin/users/${agentId}/commercial-terms`, {
      method: "PUT",
      body: JSON.stringify({
        mode: "fixed",
        value: 25,
        reason: "new bookings only",
        expectedUpdatedAt: currentTerms.updatedAt,
      }),
    });
    expect(changed.status).toBe(200);
    const [snapshot] = await db.select().from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, bookingId));
    expect(snapshot).toMatchObject({ termMode: "percentage", termValue: 10, amount: 10 });
    const history = await db.select().from(commercialTermEventsTable)
      .where(eq(commercialTermEventsTable.userId, agentId));
    expect(history).toHaveLength(1);
  });

  it("accepts ISO date-string filters on each paginated activity endpoint", async () => {
    for (const path of [
      `/admin/agents/${agentId}/bookings?from=2000-01-01&to=2100-01-01`,
      `/admin/agents/${agentId}/ledger?from=2000-01-01&to=2100-01-01`,
      `/admin/agents/${agentId}/payouts?from=2000-01-01&to=2100-01-01`,
    ]) {
      const response = await request(path);
      expect(response.status).toBe(200);
    }
  });
});