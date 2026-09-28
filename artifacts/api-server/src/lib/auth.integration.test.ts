import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  bookingRefundsTable,
  bookingsTable,
  db,
  invoicePaymentsTable,
  invoicesTable,
  propertiesTable,
  razorpayMobileSessionsTable,
  roomsTable,
  usersTable,
  wishlistTable,
} from "@workspace/db";
import { AuthResolutionError, resolveUser } from "./auth";
import meRouter from "../routes/me";

const clerk = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  getAuth: clerk.getAuth,
  clerkClient: { users: { getUser: clerk.getUser } },
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const run = process.env.DATABASE_URL ? describe : describe.skip;
const runNamespace = randomUUID();
const fixturePrefix = `auth-integration-${runNamespace}`;
const createdUserIds: string[] = [];
const createdPropertyIds: number[] = [];
const createdRoomIds: number[] = [];
const createdBookingIds: number[] = [];
const createdInvoiceIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdRefundIds: number[] = [];
const createdMobileSessionIds: number[] = [];
const createdWishlistIds: number[] = [];

function userId(label: string) {
  const id = `${fixturePrefix}-${label}`;
  createdUserIds.push(id);
  return id;
}

function email(label: string) {
  return `${fixturePrefix}-${label}@example.test`;
}

function setIdentity(id: string, primaryEmail: string, claims: Record<string, unknown> | null = null) {
  clerk.getAuth.mockReturnValue({ userId: id, sessionClaims: claims });
  clerk.getUser.mockImplementation(async (requestedId: string) => {
    if (requestedId !== id) {
      const error = Object.assign(new Error("Clerk user not found"), {
        status: 404,
        errors: [{ code: "user_not_found" }],
      });
      throw error;
    }
    return {
      id,
      firstName: "Auth",
      lastName: "Fixture",
      primaryEmailAddress: {
        emailAddress: primaryEmail,
        verification: { status: "verified" },
      },
    };
  });
}

function setProviderFailure(id: string, primaryEmail: string, status = 503) {
  clerk.getAuth.mockReturnValue({ userId: id, sessionClaims: null });
  clerk.getUser.mockRejectedValue(Object.assign(new Error("provider unavailable"), { status }));
  return primaryEmail;
}

function requestWithLog() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).log = { warn() {} };
    next();
  });
  app.use(meRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AuthResolutionError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: "Unexpected test error" });
  });
  return app;
}

async function createReferenceFixture(oldId: string, fixtureEmail: string) {
  const [property] = await db.insert(propertiesTable).values({
    ownerId: oldId,
    reviewedBy: oldId,
    name: `${fixturePrefix} property`,
    category: "budget",
    city: "Test City",
    area: "Test Area",
    pincode: "000000",
    address: "Test address",
    description: "Auth migration fixture",
    imageUrl: "https://example.test/property.jpg",
    startingPrice: 100,
  }).returning({ id: propertiesTable.id });
  createdPropertyIds.push(property!.id);

  const [room] = await db.insert(roomsTable).values({
    propertyId: property!.id,
    name: "Fixture room",
    description: "Auth migration fixture",
    imageUrl: "https://example.test/room.jpg",
    pricePerNight: 100,
  }).returning({ id: roomsTable.id });
  createdRoomIds.push(room!.id);

  const [booking] = await db.insert(bookingsTable).values({
    bookingRef: `${fixturePrefix}-booking-${createdBookingIds.length}`,
    userId: oldId,
    agentId: oldId,
    propertyId: property!.id,
    roomId: room!.id,
    checkIn: "2030-01-01",
    checkOut: "2030-01-02",
    guests: 1,
    guestName: "Fixture Guest",
    guestEmail: fixtureEmail,
    guestPhone: "9999999999",
    totalAmount: 100,
  }).returning({ id: bookingsTable.id });
  createdBookingIds.push(booking!.id);

  const [wishlist] = await db.insert(wishlistTable).values({
    email: fixtureEmail,
    userId: oldId,
    propertyId: property!.id,
  }).returning({ id: wishlistTable.id });
  createdWishlistIds.push(wishlist!.id);

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber: `${fixturePrefix}-invoice-${createdInvoiceIds.length}`,
    bookingId: booking!.id,
    customerName: "Fixture Guest",
    customerEmail: fixtureEmail,
    issueDate: "2030-01-01",
    dueDate: "2030-01-01",
    subtotalMinor: 10000,
    taxMinor: 0,
    totalMinor: 10000,
  }).returning({ id: invoicesTable.id });
  createdInvoiceIds.push(invoice!.id);

  const [payment] = await db.insert(invoicePaymentsTable).values({
    invoiceId: invoice!.id,
    amountMinor: 10000,
    paymentDate: "2030-01-01",
    method: "test",
    idempotencyKey: `${fixturePrefix}-payment-${createdPaymentIds.length}`,
  }).returning({ id: invoicePaymentsTable.id });
  createdPaymentIds.push(payment!.id);

  const [refund] = await db.insert(bookingRefundsTable).values({
    bookingId: booking!.id,
    invoiceId: invoice!.id,
    invoicePaymentId: payment!.id,
    amountMinor: 100,
    refundDate: "2030-01-02",
    reason: "fixture",
    method: "test",
    actorUserId: oldId,
    idempotencyKey: `${fixturePrefix}-refund-${createdRefundIds.length}`,
  }).returning({ id: bookingRefundsTable.id });
  createdRefundIds.push(refund!.id);

  const [mobileSession] = await db.insert(razorpayMobileSessionsTable).values({
    userId: oldId,
    bookingId: booking!.id,
    capabilityHash: `${fixturePrefix}-capability-${createdMobileSessionIds.length}`,
    amountMinor: 10000,
    mode: "test",
    capabilityExpiresAt: new Date("2030-01-01T00:00:00Z"),
  }).returning({ id: razorpayMobileSessionsTable.id });
  createdMobileSessionIds.push(mobileSession!.id);

  return { propertyId: property!.id, bookingId: booking!.id };
}

run("Clerk auth resolution integration", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
  });

  beforeEach(() => {
    clerk.getAuth.mockReset();
    clerk.getUser.mockReset();
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

    if (createdRefundIds.length) {
      await cleanup(() => db.delete(bookingRefundsTable).where(inArray(bookingRefundsTable.id, createdRefundIds)));
    }
    if (createdMobileSessionIds.length) {
      await cleanup(() => db.delete(razorpayMobileSessionsTable).where(inArray(razorpayMobileSessionsTable.id, createdMobileSessionIds)));
    }
    if (createdPaymentIds.length) {
      await cleanup(() => db.delete(invoicePaymentsTable).where(inArray(invoicePaymentsTable.id, createdPaymentIds)));
    }
    if (createdInvoiceIds.length) {
      await cleanup(() => db.delete(invoicesTable).where(inArray(invoicesTable.id, createdInvoiceIds)));
    }
    if (createdWishlistIds.length) {
      await cleanup(() => db.delete(wishlistTable).where(inArray(wishlistTable.id, createdWishlistIds)));
    }
    if (createdBookingIds.length) {
      await cleanup(() => db.delete(bookingsTable).where(inArray(bookingsTable.id, createdBookingIds)));
    }
    if (createdRoomIds.length) {
      await cleanup(() => db.delete(roomsTable).where(inArray(roomsTable.id, createdRoomIds)));
    }
    if (createdPropertyIds.length) {
      await cleanup(() => db.delete(propertiesTable).where(inArray(propertiesTable.id, createdPropertyIds)));
    }
    if (createdUserIds.length) {
      await cleanup(() => db.delete(usersTable).where(inArray(usersTable.id, createdUserIds)));
    }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Auth integration fixture cleanup failed");
    }
    if (createdUserIds.length) {
      expect(await db.select({ id: usersTable.id }).from(usersTable)
        .where(inArray(usersTable.id, createdUserIds))).toEqual([]);
    }
  });

  it("documents the old duplicate-email failure, then migrates a verified active customer only when old Clerk identity is absent", async () => {
    const oldId = userId("legacy-customer");
    const newId = userId("managed-customer");
    const fixtureEmail = email("duplicate");
    await db.insert(usersTable).values({
      id: oldId,
      email: fixtureEmail,
      name: "Legacy Guest",
      role: "customer",
      status: "active",
      approvalStatus: "approved",
    });

    const oldAlgorithmInsert = await db.insert(usersTable).values({
      id: newId,
      email: fixtureEmail,
      name: "New Clerk Guest",
    }).onConflictDoNothing().returning();
    expect(oldAlgorithmInsert).toHaveLength(0);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, newId))).toHaveLength(0);

    await createReferenceFixture(oldId, fixtureEmail);
    setIdentity(newId, fixtureEmail);
    const migrated = await resolveUser({ headers: {}, log: { warn() {} } } as any);

    expect(migrated).toMatchObject({ id: newId, email: fixtureEmail, role: "customer" });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, oldId))).toHaveLength(0);
    const [property] = await db.select().from(propertiesTable).where(inArray(propertiesTable.id, createdPropertyIds));
    const [booking] = await db.select().from(bookingsTable).where(inArray(bookingsTable.id, createdBookingIds));
    const [wishlist] = await db.select().from(wishlistTable).where(inArray(wishlistTable.id, createdWishlistIds));
    const [refund] = await db.select().from(bookingRefundsTable).where(inArray(bookingRefundsTable.id, createdRefundIds));
    const [mobile] = await db.select().from(razorpayMobileSessionsTable).where(inArray(razorpayMobileSessionsTable.id, createdMobileSessionIds));
    expect(property).toMatchObject({ ownerId: newId, reviewedBy: newId });
    expect(booking).toMatchObject({ userId: newId, agentId: newId });
    expect(wishlist).toMatchObject({ userId: newId });
    expect(refund).toMatchObject({ actorUserId: newId });
    expect(mobile).toMatchObject({ userId: newId });
  });

  it("uses canonical managed claims first and falls back to auth.userId for normal existing sign-in", async () => {
    const existingId = userId("existing");
    const fixtureEmail = email("existing");
    await db.insert(usersTable).values({ id: existingId, email: fixtureEmail, name: "Existing" });

    setIdentity("unused-claim-id", fixtureEmail, { userId: existingId });
    const fromManagedClaim = await resolveUser({ headers: {}, log: { warn() {} } } as any);
    expect(fromManagedClaim?.id).toBe(existingId);

    setIdentity(existingId, fixtureEmail, null);
    const fromFallback = await resolveUser({ headers: {}, log: { warn() {} } } as any);
    expect(fromFallback?.id).toBe(existingId);
  });

  it("is idempotent for repeated and concurrent resolution of the same Clerk id", async () => {
    const id = userId("same-id");
    const fixtureEmail = email("same-id");
    setIdentity(id, fixtureEmail);
    const first = await resolveUser({ headers: {}, log: { warn() {} } } as any);
    const [repeated, concurrent] = await Promise.all([
      resolveUser({ headers: {}, log: { warn() {} } } as any),
      resolveUser({ headers: {}, log: { warn() {} } } as any),
    ]);
    expect(first?.id).toBe(id);
    expect(repeated?.id).toBe(id);
    expect(concurrent?.id).toBe(id);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, id))).toHaveLength(1);
  });

  it("accepts the same identity provisioned while its provider lookup is in flight", async () => {
    const id = userId("provisioning-race");
    const fixtureEmail = email("provisioning-race");
    setIdentity(id, fixtureEmail);
    clerk.getUser.mockImplementationOnce(async () => {
      await db.insert(usersTable).values({ id, email: fixtureEmail, name: "Concurrent account" });
      return {
        id,
        primaryEmailAddress: {
          emailAddress: fixtureEmail,
          verification: { status: "verified" },
        },
      };
    });
    const user = await resolveUser({ headers: {}, log: { warn() {} } } as any);
    expect(user?.id).toBe(id);
    expect(clerk.getUser).toHaveBeenCalledTimes(1);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, id))).toHaveLength(1);
  });

  it.each([
    ["partner", "active", "approved"],
    ["customer", "blocked", "approved"],
    ["customer", "deleted", "approved"],
    ["customer", "active", "pending"],
  ])("refuses implicit migration of %s/%s/%s legacy accounts", async (role, status, approvalStatus) => {
    const oldId = userId(`refused-${role}-${status}-${approvalStatus}`);
    const newId = userId(`refused-new-${role}-${status}-${approvalStatus}`);
    const fixtureEmail = email(`refused-${role}-${status}-${approvalStatus}`);
    await db.insert(usersTable).values({
      id: oldId,
      email: fixtureEmail,
      role,
      status,
      approvalStatus,
    });
    setIdentity(newId, fixtureEmail);

    await expect(resolveUser({ headers: {}, log: { warn() {} } } as any)).rejects.toMatchObject({
      statusCode: 409,
      reason: "account_link_required",
    });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, oldId))).toHaveLength(1);
    expect(await db.select().from(usersTable).where(eq(usersTable.id, newId))).toHaveLength(0);
  });

  it("refuses migration when the old Clerk identity is still valid", async () => {
    const oldId = userId("live-old");
    const newId = userId("live-new");
    const fixtureEmail = email("live-old");
    await db.insert(usersTable).values({ id: oldId, email: fixtureEmail });
    clerk.getAuth.mockReturnValue({ userId: newId, sessionClaims: null });
    clerk.getUser.mockImplementation(async (requestedId: string) => ({
      id: requestedId,
      primaryEmailAddress: {
        emailAddress: fixtureEmail,
        verification: { status: "verified" },
      },
    }));

    await expect(resolveUser({ headers: {}, log: { warn() {} } } as any)).rejects.toMatchObject({
      statusCode: 409,
      reason: "account_link_required",
    });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, oldId))).toHaveLength(1);
  });

  it("claims invitations without creating a duplicate and preserves blocked, pending, and deleted lifecycle states", async () => {
    for (const [status, approvalStatus] of [
      ["blocked", "approved"],
      ["active", "pending"],
      ["deleted", "approved"],
    ]) {
      const invitedId = userId(`invited-${status}`);
      const managedId = userId(`claimed-${status}`);
      const fixtureEmail = email(`invited-${status}`);
      createdUserIds.push(`invited:${invitedId}`);
      await db.insert(usersTable).values({
        id: `invited:${invitedId}`,
        email: fixtureEmail,
        role: "customer",
        status,
        approvalStatus,
        statusReason: `fixture-${status}`,
      });
      if (status === "blocked") {
        await createReferenceFixture(`invited:${invitedId}`, fixtureEmail);
      }
      setIdentity(managedId, fixtureEmail);

      const claimed = await resolveUser({ headers: {}, log: { warn() {} } } as any);
      if (status === "deleted") {
        expect(claimed).toBeNull();
      } else {
        expect(claimed).toMatchObject({ id: managedId, email: fixtureEmail, status, approvalStatus });
      }
      const rows = await db.select().from(usersTable).where(
        and(eq(usersTable.email, fixtureEmail), sql`${usersTable.id} like 'invited:%'`),
      );
      expect(rows).toHaveLength(0);
      const [claimedRow] = await db.select().from(usersTable).where(eq(usersTable.id, managedId));
      expect(claimedRow).toMatchObject({ status, approvalStatus });
      if (status === "blocked") {
        const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, createdPropertyIds.slice(-1)[0]!));
        const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, createdBookingIds.slice(-1)[0]!));
        const [refund] = await db.select().from(bookingRefundsTable).where(eq(bookingRefundsTable.id, createdRefundIds.slice(-1)[0]!));
        const [mobile] = await db.select().from(razorpayMobileSessionsTable).where(eq(razorpayMobileSessionsTable.id, createdMobileSessionIds.slice(-1)[0]!));
        expect(property).toMatchObject({ ownerId: managedId, reviewedBy: managedId });
        expect(booking).toMatchObject({ userId: managedId, agentId: managedId });
        expect(refund).toMatchObject({ actorUserId: managedId });
        expect(mobile).toMatchObject({ userId: managedId });
      }
    }
  });

  it("rejects an unverified primary email without creating a local row", async () => {
    const id = userId("unverified");
    const fixtureEmail = email("unverified");
    clerk.getAuth.mockReturnValue({ userId: id, sessionClaims: null });
    clerk.getUser.mockResolvedValue({
      id,
      primaryEmailAddress: {
        emailAddress: fixtureEmail,
        verification: { status: "unverified" },
      },
    });

    await expect(resolveUser({ headers: {}, log: { warn() {} } } as any)).rejects.toMatchObject({
      statusCode: 401,
      reason: "primary_email_unverified",
    });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, id))).toHaveLength(0);
  });

  it("returns provider errors as 503 and does not leave an empty guest row", async () => {
    const id = userId("provider-error");
    const fixtureEmail = email("provider-error");
    setProviderFailure(id, fixtureEmail);
    await expect(resolveUser({ headers: {}, log: { warn() {} } } as any)).rejects.toMatchObject({
      statusCode: 503,
      reason: "clerk_lookup_failed",
    });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, id))).toHaveLength(0);
    expect(await db.select().from(usersTable).where(eq(usersTable.email, ""))).toHaveLength(0);
  });

  it("rolls back a concurrent same-email uniqueness conflict without losing the old account", async () => {
    const oldId = userId("rollback-old");
    const firstNewId = userId("rollback-first");
    const secondNewId = userId("rollback-second");
    const fixtureEmail = email("rollback");
    await db.insert(usersTable).values({ id: oldId, email: fixtureEmail });
    clerk.getAuth.mockImplementation((req: any) => ({
      userId: req.headers["x-user-id"],
      sessionClaims: null,
    }));
    clerk.getUser.mockImplementation(async (requestedId: string) => {
      if (requestedId === oldId) {
        throw Object.assign(new Error("old identity absent"), {
          status: 404,
          errors: [{ code: "user_not_found" }],
        });
      }
      return {
        id: requestedId,
        firstName: "Concurrent",
        primaryEmailAddress: {
          emailAddress: fixtureEmail,
          verification: { status: "verified" },
        },
      };
    });

    const [firstResult, secondResult] = await Promise.allSettled([
      resolveUser({ headers: { "x-user-id": firstNewId }, log: { warn() {} } } as any),
      resolveUser({ headers: { "x-user-id": secondNewId }, log: { warn() {} } } as any),
    ]);
    const rejected = firstResult.status === "rejected" ? firstResult : secondResult;
    expect(rejected.status).toBe("rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
      reason: "account_link_required",
    });
    const [winner] = await db.select().from(usersTable).where(
      inArray(usersTable.id, [firstNewId, secondNewId]),
    );
    expect(winner).toMatchObject({ email: fixtureEmail });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, oldId))).toHaveLength(0);
    const losers = await db.select().from(usersTable).where(
      inArray(usersTable.id, [firstNewId, secondNewId]),
    );
    expect(losers).toHaveLength(1);
  });

  it("serializes AuthResolutionError correctly at the real Express /me endpoint", async () => {
    const id = userId("endpoint-provider-error");
    setProviderFailure(id, email("endpoint-provider-error"));
    const server = requestWithLog().listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Auth endpoint test server did not bind");
      const response = await fetch(`http://127.0.0.1:${address.port}/me`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: "Authentication provider unavailable" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});