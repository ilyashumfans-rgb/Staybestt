import { expect, it } from "vitest";
import { db, bookingsTable, invoicesTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";

// Read-only integration check: never creates, cancels, or charges a booking.
it.skipIf(process.env.RUN_CUSTOMER_INVOICE_TEST !== "1")("rejects invoice access without ownership", async () => {
  const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).limit(1);
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api/bookings/${booking?.id ?? 2147483647}/invoice`;
  for (const suffix of ["", "?email=wrong%40example.com&bookingRef=WRONG"]) {
    expect((await fetch(base + suffix)).status).toBe(404);
  }
});

it.skipIf(process.env.RUN_CUSTOMER_INVOICE_TEST !== "1")("downloads an issued invoice PDF for its owner", async (context) => {
  const [booking] = await db.select({
    id: bookingsTable.id, email: bookingsTable.guestEmail, ref: bookingsTable.bookingRef,
  }).from(bookingsTable).innerJoin(invoicesTable, eq(invoicesTable.bookingId, bookingsTable.id))
    .where(isNotNull(bookingsTable.bookingRef)).limit(1);
  if (!booking) {
    context.skip();
    return;
  }
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api/bookings/${booking.id}/invoice`;
  for (const suffix of ["", "?email=wrong%40example.com&bookingRef=WRONG"]) {
    expect((await fetch(base + suffix)).status).toBe(404);
  }
  const response = await fetch(`${base}?${new URLSearchParams({ email: booking.email, bookingRef: booking.ref! })}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/pdf");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
}, 30000);
