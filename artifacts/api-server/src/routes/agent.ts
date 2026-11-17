import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, bookingsTable, commissionLedgerTable, payoutsTable, propertiesTable,
  roomsTable,
} from "@workspace/db";
import {
  GetAgentStatsResponse, ListAgentPropertiesResponse,
  ListAgentSubmittedPropertiesResponse, SubmitAgentPropertyBody,
  SubmitAgentPropertyResponse, ListAgentBookingsResponse,
  ListAgentLedgerResponse, ListAgentPayoutsResponse, InitiateAgentPayoutBody,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { toBookingDto, toPropertySummary } from "../lib/mappers";
import { propertyLocationExistsInCatalog } from "../lib/locationCatalog";
import { isValidTimeZone } from "../lib/cancellationPolicy";
import { validateSubcategories } from "../lib/subcategories";
import { validateRoomSubcategories } from "../lib/subcategories";
import { CreateAgentRoomBody, UpdateAgentRoomBody, UpdateAgentRoomParams, ListAgentPropertyRoomsParams, ListAgentPropertyRoomsResponse, CreateAgentRoomResponse, UpdateAgentRoomResponse } from "@workspace/api-zod";
import { toRoomDto } from "../lib/mappers";

const router: IRouter = Router();
router.use("/agent", requireRole("agent", "admin"));

router.get("/agent/submitted-properties/:id/rooms", async (req, res): Promise<void> => {
  const params = ListAgentPropertyRoomsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Invalid property" }); return; }
  const [property] = await db.select().from(propertiesTable).where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.currentUser!.id)));
  if (!property) { res.status(403).json({ message: "You do not own this property" }); return; }
  const rooms = await db.select().from(roomsTable).where(eq(roomsTable.propertyId, property.id));
  res.json(ListAgentPropertyRoomsResponse.parse(rooms.map(toRoomDto)));
});

router.post("/agent/rooms", async (req, res): Promise<void> => {
  const body = CreateAgentRoomBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: "Invalid room details" }); return; }
  const [property] = await db.select().from(propertiesTable).where(and(eq(propertiesTable.id, body.data.propertyId), eq(propertiesTable.ownerId, req.currentUser!.id)));
  if (!property) { res.status(403).json({ message: "You do not own this property" }); return; }
  if (!(await validateRoomSubcategories(property.id, body.data.subcategories))) {
    res.status(400).json({ message: "Select subcategories belonging to this property's category" }); return;
  }
  const [room] = await db.insert(roomsTable).values(body.data).returning();
  res.status(201).json(CreateAgentRoomResponse.parse(toRoomDto(room!)));
});

router.put("/agent/rooms/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentRoomParams.safeParse(req.params);
  const body = UpdateAgentRoomBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ message: "Invalid room details" }); return; }
  const [owned] = await db.select({ room: roomsTable }).from(roomsTable)
    .innerJoin(propertiesTable, eq(propertiesTable.id, roomsTable.propertyId))
    .where(and(eq(roomsTable.id, params.data.id), eq(propertiesTable.ownerId, req.currentUser!.id)));
  if (!owned) { res.status(403).json({ message: "You do not own this room" }); return; }
  if (owned.room.propertyId !== body.data.propertyId || !(await validateRoomSubcategories(owned.room.propertyId, body.data.subcategories ?? owned.room.subcategories))) {
    res.status(400).json({ message: "Room property and subcategories must match" }); return;
  }
  const [room] = await db.update(roomsTable).set(body.data).where(eq(roomsTable.id, owned.room.id)).returning();
  res.json(UpdateAgentRoomResponse.parse(toRoomDto(room!)));
});

router.get("/agent/stats", async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const [bookings] = await db.select({
    total: sql<number>`count(*) filter (where ${bookingsTable.status} in ('confirmed', 'completed', 'cancelled'))::int`,
    confirmed: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed')::int`,
  }).from(bookingsTable).where(eq(bookingsTable.agentId, userId));
  const [ledger] = await db.select({
    available: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status} = 'available'), 0)::float`,
    paid: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status} = 'paid'), 0)::float`,
  }).from(commissionLedgerTable)
    .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
    .where(and(
      eq(commissionLedgerTable.recipientUserId, userId),
      sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
    ));
  req.log.info({ userId }, "Retrieved agent dashboard statistics");
  res.json(GetAgentStatsResponse.parse({
    attributedBookings: bookings?.total ?? 0, confirmedBookings: bookings?.confirmed ?? 0,
    commissionAvailable: ledger?.available ?? 0, commissionPaid: ledger?.paid ?? 0,
  }));
});

router.get("/agent/properties", async (req, res): Promise<void> => {
  const rows = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.status, "active")).orderBy(desc(propertiesTable.createdAt));
  req.log.info({ count: rows.length }, "Listed agent-bookable properties");
  res.json(ListAgentPropertiesResponse.parse(rows.map(toPropertySummary)));
});

router.get("/agent/submitted-properties", async (req, res): Promise<void> => {
  const rows = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.ownerId, req.currentUser!.id)).orderBy(desc(propertiesTable.createdAt));
  req.log.info({ count: rows.length }, "Listed agent submitted properties");
  res.json(ListAgentSubmittedPropertiesResponse.parse(rows.map(toPropertySummary)));
});

router.post("/agent/submitted-properties", async (req, res): Promise<void> => {
  const body = SubmitAgentPropertyBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid agent property submission");
    res.status(400).json({ message: body.error.message }); return;
  }
  const d = body.data;
  if (!(await validateSubcategories(d.category, d.subcategories))) {
    res.status(400).json({ message: "Select subcategories belonging to this category" }); return;
  }
  if (!/^\d{6}$/.test(d.pincode.trim())) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" }); return;
  }
  if (!(await propertyLocationExistsInCatalog(d))) {
    res.status(400).json({ message: "Select a valid Country, State, City, Area and Pincode from Locations" }); return;
  }
  if (d.timezone !== undefined && !isValidTimeZone(d.timezone)) {
    res.status(400).json({ message: "timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)" }); return;
  }
  const [created] = await db.insert(propertiesTable).values({
    ownerId: req.currentUser!.id, name: d.name.trim(), category: d.category,
    subcategories: d.subcategories ?? [],
    country: d.country.trim(), state: d.state.trim(), city: d.city.trim(), area: d.area.trim(),
    pincode: d.pincode.trim(), address: d.address.trim(), description: d.description.trim(),
    imageUrl: d.imageUrl.trim(), images: d.images ?? [d.imageUrl.trim()],
    landmark: d.landmark ?? null, youtubeUrl: d.youtubeUrl ?? null,
    amenities: d.amenities ?? [], policies: d.policies ?? [],
    timezone: d.timezone ?? "Asia/Kolkata", checkInTime: d.checkInTime ?? "2:00 PM",
    checkOutTime: d.checkOutTime ?? "11:00 AM", contactPhone: d.contactPhone ?? null,
    contactEmail: d.contactEmail ?? null, freeCancellation: d.freeCancellation ?? false,
    breakfastIncluded: d.breakfastIncluded ?? false, latitude: d.latitude ?? null,
    longitude: d.longitude ?? null, startingPrice: d.startingPrice, status: "pending",
  }).returning();
  req.log.info({ propertyId: created!.id }, "Agent submitted property");
  res.status(201).json(SubmitAgentPropertyResponse.parse(toPropertySummary(created!)));
});

router.get("/agent/bookings", async (req, res): Promise<void> => {
  const rows = await db.select().from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .leftJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.agentId, req.currentUser!.id)).orderBy(desc(bookingsTable.createdAt));
  req.log.info({ count: rows.length }, "Listed agent attributed bookings");
  res.json(ListAgentBookingsResponse.parse(rows.map((r) => toBookingDto(r.bookings, r.properties, r.rooms))));
});

router.get("/agent/ledger", async (req, res): Promise<void> => {
  const rows = await db.select({ entry: commissionLedgerTable, bookingRef: bookingsTable.bookingRef })
    .from(commissionLedgerTable).innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
    .where(and(
      eq(commissionLedgerTable.recipientUserId, req.currentUser!.id),
      sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
    )).orderBy(desc(commissionLedgerTable.createdAt));
  req.log.info({ count: rows.length }, "Listed agent commission ledger");
  res.json(ListAgentLedgerResponse.parse(rows.map(({ entry, bookingRef }) => ({
    ...entry, bookingRef, createdAt: entry.createdAt.toISOString(),
  }))));
});

router.get("/agent/payouts", async (req, res): Promise<void> => {
  const rows = await db.select().from(payoutsTable).where(eq(payoutsTable.userId, req.currentUser!.id))
    .orderBy(desc(payoutsTable.createdAt));
  req.log.info({ count: rows.length }, "Listed agent payout history");
  res.json(ListAgentPayoutsResponse.parse(rows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))));
});

router.post("/agent/payouts", async (req, res): Promise<void> => {
  const body = InitiateAgentPayoutBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: body.error.message }); return; }
  const [balance] = await db.select({
    amount: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status} = 'available'), 0)::float`,
  }).from(commissionLedgerTable)
    .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
    .where(and(
      eq(commissionLedgerTable.recipientUserId, req.currentUser!.id),
      sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
    ));
  if (body.data.amount > (balance?.amount ?? 0)) {
    req.log.warn({ amount: body.data.amount, available: balance?.amount ?? 0 }, "Payout exceeds available balance");
    res.status(400).json({ message: "Requested payout exceeds available balance" }); return;
  }
  // No payment provider is configured. Do not write a paid/requested record or
  // mutate commission balances: callers get an explicit, auditable failure.
  await db.insert(payoutsTable).values({
    userId: req.currentUser!.id, amount: body.data.amount, status: "failed",
    failureCode: "provider_not_configured",
  });
  req.log.warn({ amount: body.data.amount }, "Payout rejected: provider not configured");
  res.status(503).json({ message: "provider_not_configured" });
});

export default router;