import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const resolveUserMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth", () => ({ resolveUser: resolveUserMock }));

import bookingsRouter from "./bookings";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(bookingsRouter);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("direct booking agent lifecycle enforcement", () => {
  it.each([
    { status: "active", approvalStatus: "pending" },
    { status: "active", approvalStatus: "rejected" },
    { status: "blocked", approvalStatus: "approved" },
  ])("denies an attributed booking for %o", async (agent) => {
    resolveUserMock.mockResolvedValueOnce({
      id: "agent-test",
      role: "agent",
      ...agent,
    });
    const response = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId: 1,
        roomId: 1,
        checkIn: "2030-01-01",
        checkOut: "2030-01-02",
        guests: 1,
        roomsCount: 1,
        guestName: "Guest",
        guestEmail: "guest@example.test",
      }),
    });
    expect(response.status).toBe(403);
  });
});