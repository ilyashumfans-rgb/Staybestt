import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql, gte } from "drizzle-orm";
import {
  db,
  propertiesTable,
  roomsTable,
  bookingsTable,
  seasonalRatesTable,
  partnerProfilesTable,
  usersTable,
  vendorCredentialsTable,
  commissionLedgerTable,
  commercialTermsTable,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import {
  GetPartnerStatsResponse,
  ListPartnerPropertiesResponse,
  UpdatePartnerPropertyParams,
  UpdatePartnerPropertyBody,
  UpdatePartnerPropertyResponse,
  ListPartnerBookingsQueryParams,
  ListPartnerBookingsResponse,
  CreatePartnerRoomBody,
  CreatePartnerRoomResponse,
  UpdatePartnerRoomParams,
  UpdatePartnerRoomBody,
  UpdatePartnerRoomResponse,
  DeletePartnerRoomParams,
  RegisterPartnerPropertyBody,
  RegisterPartnerPropertyResponse,
  ListSeasonalRatesParams,
  ListSeasonalRatesResponse,
  CreateSeasonalRateBody,
  CreateSeasonalRateResponse,
  DeleteSeasonalRateParams,
  GetPartnerFinanceResponse,
  GetPartnerProfileResponse,
  UpdatePartnerProfileBody,
  UpdatePartnerProfileResponse,
  ChangePartnerPasswordBody,
  PartnerPasswordLoginBody,
  PartnerPasswordLoginResponse,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { isValidTimeZone } from "../lib/cancellationPolicy";
import { toPropertySummary, toPropertyDetail, toRoomDto, toBookingDto } from "../lib/mappers";
import { propertyLocationExistsInCatalog } from "../lib/locationCatalog";

const router: IRouter = Router();

// Public: exchange a partner username/password for a one-time Clerk sign-in
// ticket. This avoids Clerk's Device Trust email-code step, which admin-created
// logins (with non-mailbox @partner.staybest.com addresses) can never complete.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
  if (loginAttempts.size > 10000) {
    for (const [k, v] of loginAttempts) if (v.resetAt < now) loginAttempts.delete(k);
  }
}

router.post("/partner/login", async (req, res): Promise<void> => {
  const parsed = PartnerPasswordLoginBody.safeParse(req.body);
  if (!parsed.success || parsed.data.login.length > 254 || parsed.data.password.length > 128) {
    res.status(401).json({ message: "Wrong username or password" });
    return;
  }
  const id = parsed.data.login.trim().toLowerCase();
  const rateKey = `${req.ip}|${id}`;
  if (loginRateLimited(rateKey)) {
    res.status(401).json({ message: "Wrong username or password" });
    return;
  }
  const email = id.includes("@") ? id : `${id}@partner.staybest.com`;
  const rows = await db
    .select({ userId: usersTable.id, password: vendorCredentialsTable.password })
    .from(usersTable)
    .innerJoin(vendorCredentialsTable, eq(vendorCredentialsTable.userId, usersTable.id))
    .where(
      and(
        sql`lower(${usersTable.email}) = ${email}`,
        eq(usersTable.role, "partner"),
        eq(usersTable.status, "active"),
      ),
    )
    .limit(1);
  const match = rows[0];
  if (!match || match.password !== parsed.data.password) {
    recordLoginFailure(rateKey);
    // Small delay to slow down guessing.
    await new Promise((r) => setTimeout(r, 500));
    res.status(401).json({ message: "Wrong username or password" });
    return;
  }
  const token = await clerkClient.signInTokens.createSignInToken({
    userId: match.userId,
    expiresInSeconds: 300,
  });
  res.json(PartnerPasswordLoginResponse.parse({ ticket: token.token }));
});

router.use("/partner", requireRole("partner", "admin"));

async function ownedPropertyIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.ownerId, userId));
  return rows.map((r) => r.id);
}

router.get("/partner/stats", async (req, res): Promise<void> => {
  const ids = await ownedPropertyIds(req.currentUser!.id);
  if (ids.length === 0) {
    res.json(
      GetPartnerStatsResponse.parse({
        totalProperties: 0,
        totalRooms: 0,
        totalBookings: 0,
        confirmedBookings: 0,
        upcomingCheckIns: 0,
        totalRevenue: 0,
        averageRating: 0,
        todaysCheckIns: 0,
        occupancyPct: 0,
        pendingProperties: 0,
      }),
    );
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const [roomsCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(roomsTable)
    .where(inArray(roomsTable.propertyId, ids));
  const [bookingAgg] = await db
    .select({
       total: sql<number>`count(*) filter (where ${bookingsTable.status} not in ('pending_payment', 'expired'))::int`,
      confirmed: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed')::int`,
      upcoming: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed' and ${bookingsTable.checkIn} >= ${today})::int`,
      todays: sql<number>`count(*) filter (where ${bookingsTable.status} = 'confirmed' and ${bookingsTable.checkIn} = ${today})::int`,
      occupiedRooms: sql<number>`coalesce(sum(${bookingsTable.roomsCount}) filter (where ${bookingsTable.status} = 'confirmed' and ${bookingsTable.checkIn} <= ${today} and ${bookingsTable.checkOut} > ${today}), 0)::int`,
       revenue: sql<number>`coalesce(sum(${bookingsTable.totalAmount}) filter (where ${bookingsTable.status} in ('confirmed', 'completed')), 0)::float`,
    })
    .from(bookingsTable)
    .where(inArray(bookingsTable.propertyId, ids));
  const [ratingAgg] = await db
    .select({
      avg: sql<number>`coalesce(avg(${propertiesTable.rating}) filter (where ${propertiesTable.reviewCount} > 0), 0)::float`,
      pending: sql<number>`count(*) filter (where ${propertiesTable.status} = 'pending')::int`,
    })
    .from(propertiesTable)
    .where(inArray(propertiesTable.id, ids));
  const [totalRoomUnits] = await db
    .select({ n: sql<number>`coalesce(sum(${roomsTable.totalRooms}), 0)::int` })
    .from(roomsTable)
    .where(inArray(roomsTable.propertyId, ids));

  res.json(
    GetPartnerStatsResponse.parse({
      totalProperties: ids.length,
      totalRooms: roomsCount?.n ?? 0,
      totalBookings: bookingAgg?.total ?? 0,
      confirmedBookings: bookingAgg?.confirmed ?? 0,
      upcomingCheckIns: bookingAgg?.upcoming ?? 0,
      totalRevenue: Math.round(bookingAgg?.revenue ?? 0),
      averageRating: Math.round((ratingAgg?.avg ?? 0) * 10) / 10,
      todaysCheckIns: bookingAgg?.todays ?? 0,
      occupancyPct:
        (totalRoomUnits?.n ?? 0) > 0
          ? Math.min(100, Math.round(((bookingAgg?.occupiedRooms ?? 0) / totalRoomUnits!.n) * 100))
          : 0,
      pendingProperties: ratingAgg?.pending ?? 0,
    }),
  );
});

async function assertOwnsRoom(userId: string, roomId: number) {
  const [row] = await db
    .select({ roomId: roomsTable.id, ownerId: propertiesTable.ownerId })
    .from(roomsTable)
    .innerJoin(propertiesTable, eq(propertiesTable.id, roomsTable.propertyId))
    .where(eq(roomsTable.id, roomId));
  return row && row.ownerId === userId ? row : null;
}

router.get("/partner/rooms/:id/seasonal-rates", async (req, res): Promise<void> => {
  const params = ListSeasonalRatesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid room id" });
    return;
  }
  const owned = await assertOwnsRoom(req.currentUser!.id, params.data.id);
  if (!owned && req.currentUser!.role !== "admin") {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  const rows = await db
    .select()
    .from(seasonalRatesTable)
    .where(eq(seasonalRatesTable.roomId, params.data.id))
    .orderBy(seasonalRatesTable.startDate);
  res.json(ListSeasonalRatesResponse.parse(rows));
});

router.post("/partner/seasonal-rates", async (req, res): Promise<void> => {
  const body = CreateSeasonalRateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const d = body.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate) || d.endDate < d.startDate) {
    res.status(400).json({ message: "Invalid date range (use YYYY-MM-DD, end after start)" });
    return;
  }
  const owned = await assertOwnsRoom(req.currentUser!.id, d.roomId);
  if (!owned && req.currentUser!.role !== "admin") {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  const [overlap] = await db
    .select({ id: seasonalRatesTable.id, name: seasonalRatesTable.name })
    .from(seasonalRatesTable)
    .where(
      and(
        eq(seasonalRatesTable.roomId, d.roomId),
        sql`${seasonalRatesTable.startDate} <= ${d.endDate}`,
        sql`${seasonalRatesTable.endDate} >= ${d.startDate}`,
      ),
    );
  if (overlap) {
    res.status(400).json({
      message: `These dates overlap the existing "${overlap.name}" rate. Delete it first or choose different dates.`,
    });
    return;
  }
  const [created] = await db
    .insert(seasonalRatesTable)
    .values({
      roomId: d.roomId,
      name: d.name.trim(),
      startDate: d.startDate,
      endDate: d.endDate,
      pricePerNight: Math.round(d.pricePerNight),
    })
    .returning();
  res.status(201).json(CreateSeasonalRateResponse.parse(created));
});

router.post("/partner/seasonal-rates/:id/delete", async (req, res): Promise<void> => {
  const params = DeleteSeasonalRateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const [rate] = await db
    .select()
    .from(seasonalRatesTable)
    .where(eq(seasonalRatesTable.id, params.data.id));
  if (!rate) {
    res.status(404).json({ message: "Rate not found" });
    return;
  }
  const owned = await assertOwnsRoom(req.currentUser!.id, rate.roomId);
  if (!owned && req.currentUser!.role !== "admin") {
    res.status(404).json({ message: "Rate not found" });
    return;
  }
  await db.delete(seasonalRatesTable).where(eq(seasonalRatesTable.id, params.data.id));
  res.json({ message: "Deleted" });
});

router.get("/partner/finance", async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const [configuredTerms] = await db.select().from(commercialTermsTable)
    .where(eq(commercialTermsTable.userId, userId));
  const commissionPct = configuredTerms?.mode === "percentage" ? configuredTerms.value : 0;
  const ids = await ownedPropertyIds(userId);
  const empty = {
    totalEarnings: 0,
    commissionPct,
    totalCommission: 0,
    netPayable: 0,
    completedBookings: 0,
    upcomingRevenue: 0,
    settlements: [],
    payments: [],
  };
  if (ids.length === 0) {
    res.json(GetPartnerFinanceResponse.parse(empty));
    return;
  }
  // Finance is driven by immutable per-booking allocation snapshots, never
  // recalculated from today's terms. This preserves historic commercial terms.
  const entries = await db.select({ entry: commissionLedgerTable, booking: bookingsTable, property: propertiesTable })
    .from(commissionLedgerTable)
    .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .where(and(
      eq(commissionLedgerTable.recipientUserId, userId),
      eq(commissionLedgerTable.allocationType, "partner"),
      sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
    ))
    .orderBy(desc(bookingsTable.checkOut));
  const settled = entries.filter((r) => r.entry.status === "available" || r.entry.status === "paid");
  const gross = settled.reduce((sum, r) => sum + r.booking.totalAmount, 0);
  const totalCommission = settled.reduce((sum, r) => sum + r.entry.amount, 0);
  const upcomingRevenue = entries.filter((r) => r.entry.status === "pending" && r.booking.status === "confirmed")
    .reduce((sum, r) => sum + r.booking.totalAmount, 0);
  const settlementMap = new Map<string, { bookings: number; gross: number; commission: number }>();
  for (const r of settled) {
    const key = r.booking.checkOut.slice(0, 7);
    const current = settlementMap.get(key) ?? { bookings: 0, gross: 0, commission: 0 };
    current.bookings += 1; current.gross += r.booking.totalAmount; current.commission += r.entry.amount;
    settlementMap.set(key, current);
  }
  res.json(
    GetPartnerFinanceResponse.parse({
      totalEarnings: Math.round(gross),
      commissionPct, totalCommission: Math.round(totalCommission),
      netPayable: Math.round(gross) - totalCommission,
      completedBookings: settled.length, upcomingRevenue: Math.round(upcomingRevenue),
      settlements: [...settlementMap.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, m]) => {
        return {
          period: new Date(`${key}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
          bookings: m.bookings,
          gross: Math.round(m.gross),
          commission: Math.round(m.commission),
          net: Math.round(m.gross) - Math.round(m.commission),
        };
      }),
      payments: entries.filter((r) => r.entry.status !== "voided").slice(0, 100).map((r) => ({
        bookingRef: r.booking.bookingRef, date: r.booking.checkOut, guestName: r.booking.guestName,
        propertyName: r.property.name, amount: r.booking.totalAmount,
        status: r.entry.status === "pending" ? "upcoming" : "settled",
      })),
    }),
  );
});

router.get("/partner/profile", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(partnerProfilesTable)
    .where(eq(partnerProfilesTable.userId, req.currentUser!.id));
  res.json(
    GetPartnerProfileResponse.parse({
      businessName: row?.businessName ?? "",
      gstNumber: row?.gstNumber ?? "",
      address: row?.address ?? "",
      contactPhone: row?.contactPhone ?? "",
      bankAccountName: row?.bankAccountName ?? "",
      bankAccountNumber: row?.bankAccountNumber ?? "",
      bankIfsc: row?.bankIfsc ?? "",
      bankName: row?.bankName ?? "",
    }),
  );
});

router.post("/partner/profile", async (req, res): Promise<void> => {
  const body = UpdatePartnerProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const d = body.data;
  const values = {
    businessName: (d.businessName ?? "").trim(),
    gstNumber: (d.gstNumber ?? "").trim(),
    address: (d.address ?? "").trim(),
    contactPhone: (d.contactPhone ?? "").trim(),
    bankAccountName: (d.bankAccountName ?? "").trim(),
    bankAccountNumber: (d.bankAccountNumber ?? "").trim(),
    bankIfsc: (d.bankIfsc ?? "").trim(),
    bankName: (d.bankName ?? "").trim(),
    updatedAt: new Date(),
  };
  const [saved] = await db
    .insert(partnerProfilesTable)
    .values({ userId: req.currentUser!.id, ...values })
    .onConflictDoUpdate({ target: partnerProfilesTable.userId, set: values })
    .returning();
  res.json(UpdatePartnerProfileResponse.parse({
    businessName: saved!.businessName,
    gstNumber: saved!.gstNumber,
    address: saved!.address,
    contactPhone: saved!.contactPhone,
    bankAccountName: saved!.bankAccountName,
    bankAccountNumber: saved!.bankAccountNumber,
    bankIfsc: saved!.bankIfsc,
    bankName: saved!.bankName,
  }));
});

router.post("/partner/password", async (req, res): Promise<void> => {
  const body = ChangePartnerPasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "New password must be at least 8 characters" });
    return;
  }
  const userId = req.currentUser!.id;
  try {
    await clerkClient.users.verifyPassword({
      userId,
      password: body.data.currentPassword,
    });
  } catch {
    res.status(400).json({ message: "Current password is incorrect" });
    return;
  }
  try {
    await clerkClient.users.updateUser(userId, {
      password: body.data.newPassword,
      skipPasswordChecks: false,
    });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Could not change password";
    res.status(400).json({ message: msg });
    return;
  }
  // Keep the admin-visible credential in sync so username+password login
  // keeps working with the new password (and the old one stops working).
  await db
    .update(vendorCredentialsTable)
    .set({ password: body.data.newPassword, updatedAt: new Date() })
    .where(eq(vendorCredentialsTable.userId, userId));
  res.json({ message: "Password changed" });
});

router.post("/partner/properties/register", async (req, res): Promise<void> => {
  const body = RegisterPartnerPropertyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const d = body.data;
  if (d.pincode !== undefined && d.pincode !== "" && !/^\d{6}$/.test(d.pincode.trim())) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" });
    return;
  }
  if (!(await propertyLocationExistsInCatalog(d))) {
    res.status(400).json({
      message: "Select a valid Country, State, City, Area and Pincode from Locations",
    });
    return;
  }
  await db.insert(propertiesTable).values({
    ownerId: req.currentUser!.id,
    name: d.name.trim(),
    category: d.category,
    country: d.country.trim(),
    state: d.state.trim(),
    city: d.city.trim(),
    area: d.area.trim(),
    landmark: d.landmark ?? null,
    address: d.address.trim(),
    description: d.description.trim(),
    imageUrl: d.imageUrl.trim(),
    images: d.images ?? [d.imageUrl.trim()],
    youtubeUrl: d.youtubeUrl ?? null,
    amenities: d.amenities ?? [],
    policies: d.policies ?? [],
    startingPrice: d.startingPrice,
    freeCancellation: d.freeCancellation ?? false,
    breakfastIncluded: d.breakfastIncluded ?? false,
    contactPhone: d.contactPhone ?? null,
    contactEmail: d.contactEmail ?? null,
    pincode: (d.pincode ?? "").trim(),
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    status: "pending",
  });
  res.status(201).json(
    RegisterPartnerPropertyResponse.parse({
      message: "Property submitted for admin approval",
    }),
  );
});

router.get("/partner/properties", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.ownerId, req.currentUser!.id))
    .orderBy(desc(propertiesTable.createdAt));
  res.json(ListPartnerPropertiesResponse.parse(rows.map(toPropertySummary)));
});

router.put("/partner/properties/:id", async (req, res): Promise<void> => {
  const params = UpdatePartnerPropertyParams.safeParse(req.params);
  const body = UpdatePartnerPropertyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  if (!property) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  if (property.ownerId !== req.currentUser!.id) {
    res.status(403).json({ message: "You do not own this property" });
    return;
  }
  if (body.data.pincode !== undefined && body.data.pincode !== "" && !/^\d{6}$/.test(body.data.pincode.trim())) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" });
    return;
  }
  if (body.data.timezone !== undefined && !isValidTimeZone(body.data.timezone)) {
    res.status(400).json({
      message: "timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)",
    });
    return;
  }
  const country = body.data.country?.trim() || property.country;
  const state = body.data.state?.trim() || property.state;
  const pincode = body.data.pincode?.trim() ?? property.pincode;
  const locationUnchanged =
    (property.country ?? "").toLowerCase() === (country ?? "").toLowerCase() &&
    (property.state ?? "").toLowerCase() === (state ?? "").toLowerCase() &&
    property.city.toLowerCase() === body.data.city.toLowerCase() &&
    property.area.toLowerCase() === body.data.area.toLowerCase() &&
    property.pincode === pincode;
  if (
    !locationUnchanged &&
    (!country ||
      !state ||
      !(await propertyLocationExistsInCatalog({
        country,
        state,
        city: body.data.city,
        area: body.data.area,
        pincode,
      })))
  ) {
    res.status(400).json({
      message: "Select a valid Country, State, City, Area and Pincode from Locations",
    });
    return;
  }
  // Partners cannot reassign ownership
  const { ownerId: _ignored, ...updates } = body.data;
  const [updated] = await db
    .update(propertiesTable)
    .set({ ...updates, country, state })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.propertyId, updated.id));
  res.json(UpdatePartnerPropertyResponse.parse(toPropertyDetail(updated, rooms)));
});

router.get("/partner/bookings", async (req, res): Promise<void> => {
  const query = ListPartnerBookingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Invalid query" });
    return;
  }
  const ids = await ownedPropertyIds(req.currentUser!.id);
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const conditions = [inArray(bookingsTable.propertyId, ids)];
  if (query.data.status) {
    conditions.push(eq(bookingsTable.status, query.data.status));
  }
  const rows = await db
    .select({
      booking: bookingsTable,
      property: propertiesTable,
      room: roomsTable,
    })
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(and(...conditions))
    .orderBy(desc(bookingsTable.createdAt));
  res.json(
    ListPartnerBookingsResponse.parse(
      rows.map((r) => toBookingDto(r.booking, r.property, r.room)),
    ),
  );
});

async function assertRoomOwnership(
  userId: string,
  propertyId: number,
): Promise<boolean> {
  const [property] = await db
    .select({ ownerId: propertiesTable.ownerId })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, propertyId));
  return !!property && property.ownerId === userId;
}

router.post("/partner/rooms", async (req, res): Promise<void> => {
  const body = CreatePartnerRoomBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  if (!(await assertRoomOwnership(req.currentUser!.id, body.data.propertyId))) {
    res.status(403).json({ message: "You do not own this property" });
    return;
  }
  const [created] = await db.insert(roomsTable).values(body.data).returning();
  res.status(201).json(CreatePartnerRoomResponse.parse(toRoomDto(created)));
});

router.put("/partner/rooms/:id", async (req, res): Promise<void> => {
  const params = UpdatePartnerRoomParams.safeParse(req.params);
  const body = UpdatePartnerRoomBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, params.data.id));
  if (!room) {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  if (!(await assertRoomOwnership(req.currentUser!.id, room.propertyId))) {
    res.status(403).json({ message: "You do not own this property" });
    return;
  }
  // Rooms stay attached to their property in the partner flow
  const { propertyId: _ignored, ...updates } = body.data;
  const [updated] = await db
    .update(roomsTable)
    .set(updates)
    .where(eq(roomsTable.id, params.data.id))
    .returning();
  res.json(UpdatePartnerRoomResponse.parse(toRoomDto(updated)));
});

router.delete("/partner/rooms/:id", async (req, res): Promise<void> => {
  const params = DeletePartnerRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, params.data.id));
  if (!room) {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  if (!(await assertRoomOwnership(req.currentUser!.id, room.propertyId))) {
    res.status(403).json({ message: "You do not own this property" });
    return;
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(eq(bookingsTable.roomId, params.data.id));
  if (n > 0) {
    res.status(400).json({ message: "Cannot delete a room that has bookings" });
    return;
  }
  await db.delete(roomsTable).where(eq(roomsTable.id, params.data.id));
  res.json({ message: "Room deleted" });
});

export default router;
