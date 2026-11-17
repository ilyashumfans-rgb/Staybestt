import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { db, propertiesTable, usersTable, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBookingResponse, GetDayOutQuoteResponse } from "@workspace/api-zod";

const auth = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth", () => ({ resolveUser: auth }));
vi.mock("../lib/razorpayProvider", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/razorpayProvider")>(),
  getRazorpayConfig: () => ({ mode: "test" }),
  getRazorpayReadiness: () => ({ configured: true, paymentAllowed: true, mode: "test" }),
  getRazorpayReadinessWithProbe: async () => ({ configured: true, paymentAllowed: true, mode: "test" }),
}));
import availability from "./availability";
import bookings from "./bookings";

const userId = `dayout-test-${randomUUID()}`;
let propertyId: number;
let server: Server;
let base: string;
const draft = () => ({
  propertyId, roomId: null, checkIn: "2030-06-10", checkOut: "2030-06-10",
  guests: 3, adults: 3, children: 0, roomsCount: 0, guestName: "Day Out Test",
  guestEmail: `${userId}@example.test`,
});
beforeAll(async () => {
  const [user] = await db.insert(usersTable).values({ id: userId, name: "Day Out Test", email: `${userId}@example.test`, role: "customer", status: "active" }).returning();
  auth.mockResolvedValue(user);
  const [property] = await db.insert(propertiesTable).values({
    name: "Day Out Test", category: "day-out", city: "Test", area: "Test", pincode: "000000",
    address: "Test", description: "Isolated Day Out test", imageUrl: "", startingPrice: 500, status: "active",
  }).returning();
  propertyId = property.id;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} } as any; next(); });
  app.use(availability); app.use(bookings);
  server = app.listen(0);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await db.delete(bookingsTable).where(eq(bookingsTable.userId, userId));
  await db.delete(propertiesTable).where(eq(propertiesTable.id, propertyId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});
async function post(data: ReturnType<typeof draft>, key?: string) {
  return fetch(`${base}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(data) });
}
it("quotes per person, then creates and replays a same-day room-free hold", async () => {
  const quoteResponse = await fetch(`${base}/day-out/quote?propertyId=${propertyId}&date=2030-06-10&guests=3`);
  expect(quoteResponse.status).toBe(200);
  const quote = GetDayOutQuoteResponse.parse(await quoteResponse.json());
  expect(quote.baseTotalPrice).toBe(1500);
  expect(quote.pricePerPerson).toBe(500);
  const first = await post(draft(), userId);
  expect(first.status).toBe(201);
  const created = CreateBookingResponse.parse(await first.json());
  expect(created).toMatchObject({ roomId: null, bookingType: "day_out", roomsCount: 0, nights: 0, status: "pending_payment", totalAmount: quote.totalPrice });
  const replay = await post(draft(), userId);
  expect(replay.status).toBe(201);
  expect(CreateBookingResponse.parse(await replay.json()).id).toBe(created.id);
  const detail = await fetch(`${base}/bookings/${created.id}`);
  expect(detail.status).toBe(200);
  const cancelled = await fetch(`${base}/bookings/${created.id}/cancel`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: draft().guestEmail, bookingRef: null }),
  });
  expect(cancelled.status).toBe(200);
  expect(CreateBookingResponse.parse(await cancelled.json()).status).toBe("cancelled");
});
it("rejects rooms, overnight dates, past visits and oversized groups", async () => {
  for (const patch of [
    { roomId: 1 }, { roomsCount: 1 }, { checkOut: "2030-06-11" },
    { checkIn: "2020-01-01", checkOut: "2020-01-01" }, { guests: 101, adults: 101 },
  ]) {
    expect((await post({ ...draft(), ...patch } as ReturnType<typeof draft>)).status).toBe(400);
  }
});
it("does not allow a hotel to be booked without rooms", async () => {
  await db.update(propertiesTable).set({ category: "hotel" }).where(eq(propertiesTable.id, propertyId));
  expect((await post(draft())).status).toBe(400);
  expect((await fetch(`${base}/day-out/quote?propertyId=${propertyId}&date=2030-06-10&guests=3`)).status).toBe(400);
});
