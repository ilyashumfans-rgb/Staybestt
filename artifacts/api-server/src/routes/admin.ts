import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { repointUserReferences, resolveUser } from "../lib/auth";
import { isValidTimeZone } from "../lib/cancellationPolicy";
import { lockBooking, lockInvoice, lockRoomAndBooking } from "../lib/advisoryLocks";
import { and, asc, eq, desc, sql, count, ilike, gte, lte, inArray } from "drizzle-orm";
import {
  db,
  cmsPagesTable,
  couponsTable,
  couponRedemptionsTable,
  propertiesTable,
  roomsTable,
  bookingsTable,
  reviewsTable,
  wishlistTable,
  offersTable,
  usersTable,
  employeesTable,
  vendorCredentialsTable,
  customerLoginsTable,
  locationsTable,
  promoBannersTable,
  commercialTermsTable,
  commissionLedgerTable,
  commissionLedgerEventsTable,
  promoBannerEventsTable,
  payoutsTable,
  agentLifecycleEventsTable,
  commercialTermEventsTable,
  propertyReviewEventsTable,
  bookingRefundsTable,
  invoicePaymentsTable,
  invoicesTable,
  razorpayPaymentsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  ListAdminUsersResponse,
  InviteUserBody,
  InviteUserResponse,
  ListAdminVendorsResponse,
  ListAdminPropertiesResponse,
  SetPropertyStatusParams,
  SetPropertyStatusBody,
  SetPropertyStatusResponse,
  CreateVendorLoginBody,
  ListVendorCredentialsResponse,
  SetVendorPasswordParams,
  SetVendorPasswordBody,
  SetVendorPasswordResponse,
  CreateVendorLoginResponse,
  ListAdminCustomersResponse,
  CreateCustomerBody,
  CreateCustomerResponse,
  UpdateCustomerParams,
  UpdateCustomerBody,
  UpdateCustomerResponse,
  SetCustomerStatusParams,
  SetCustomerStatusBody,
  SetCustomerStatusResponse,
  ListEmployeesResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  UpdateEmployeeResponse,
  DeleteEmployeeParams,
  DeleteEmployeeResponse,
  GetAdminReportsQueryParams,
  GetAdminReportsResponse,
  GetAdminBusinessReportsQueryParams,
  GetAdminBusinessReportsResponse,
  AssignPropertyOwnerParams,
  AssignPropertyOwnerBody,
  AssignPropertyOwnerResponse,
  DeleteAdminUserParams,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
  AdminLoginResponse,
  GetAdminStatsResponse,
  ListAdminBookingsQueryParams,
  ListAdminBookingsResponse,
  UpdateBookingStatusParams,
  UpdateBookingStatusBody,
  UpdateBookingStatusResponse,
  GetAdminBookingParams,
  GetAdminBookingResponse,
  CreatePropertyBody,
  CreatePropertyResponse,
  UpdatePropertyParams,
  UpdatePropertyBody,
  UpdatePropertyResponse,
  DeletePropertyParams,
  CreateRoomBody,
  CreateRoomResponse,
  UpdateRoomParams,
  UpdateRoomBody,
  UpdateRoomResponse,
  DeleteRoomParams,
  CreateOfferBody,
  CreateOfferResponse,
  UpdateOfferParams,
  UpdateOfferBody,
  UpdateOfferResponse,
  DeleteOfferParams,
  ListAdminOffersResponse,
  ListCmsPagesResponse,
  UpdateCmsPageParams,
  UpdateCmsPageBody,
  UpdateCmsPageResponse,
  ListAdminCouponsResponse,
  CreateCouponBody,
  CreateCouponResponse,
  UpdateCouponParams,
  UpdateCouponBody,
  UpdateCouponResponse,
  DeleteCouponParams,
  CreateLocationBody,
  CreateLocationResponse,
  UpdateLocationParams,
  UpdateLocationBody,
  UpdateLocationResponse,
  DeleteLocationParams,
  DeleteLocationResponse,
  ListAdminLocationsResponse,
  SetLocationApprovalParams,
  SetLocationApprovalBody,
  SetLocationApprovalResponse,
  ListPromoBannersResponse,
  CreatePromoBannerBody,
  CreatePromoBannerResponse,
  UpdatePromoBannerParams,
  UpdatePromoBannerBody,
  UpdatePromoBannerResponse,
  DeletePromoBannerParams,
  DeletePromoBannerResponse,
  ListAdminCommercialTermsResponse,
  UpsertAdminCommercialTermsParams,
  UpsertAdminCommercialTermsBody,
  UpsertAdminCommercialTermsResponse,
  ListAdminAgentsQueryParams,
  ListAdminAgentsResponse,
  GetAdminAgentParams,
  GetAdminAgentResponse,
  SetAdminAgentStatusParams,
  SetAdminAgentStatusBody,
  SetAdminAgentStatusResponse,
  SetAdminAgentApprovalParams,
  SetAdminAgentApprovalBody,
  SetAdminAgentApprovalResponse,
  ListAdminAgentBookingsParams,
  ListAdminAgentBookingsQueryParams,
  ListAdminAgentBookingsResponse,
  ListAdminAgentLedgerParams,
  ListAdminAgentLedgerQueryParams,
  ListAdminAgentLedgerResponse,
  ListAdminAgentPayoutsParams,
  ListAdminAgentPayoutsQueryParams,
  ListAdminAgentPayoutsResponse,
  ReviewAdminAgentPropertyParams,
  ReviewAdminAgentPropertyBody,
  ReviewAdminAgentPropertyResponse,
  GetAdminBookingRefundsParams,
  GetAdminBookingRefundsResponse,
  CreateAdminBookingRefundParams,
  CreateAdminBookingRefundBody,
  CreateAdminBookingRefundResponse,
} from "@workspace/api-zod";
import { ensureCmsPages } from "../lib/cmsDefaults";
import { currentBusinessDate, isInvoiceDate } from "../lib/billing";
import { toBookingDto, toRoomDto, toPropertySummary } from "../lib/mappers";
import { propertyLocationExistsInCatalog } from "../lib/locationCatalog";
import { clerkClient } from "@clerk/express";
import { loadBookingRefundSummary } from "../lib/refunds";
import { loadPaymentSummary } from "../lib/razorpay";

const router: IRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
// Fail closed in production: admin access requires explicitly configured credentials.
// The dev-only fallbacks let the user try the dashboard locally.
const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || (isProduction ? null : "admin");
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || (isProduction ? null : "staybest2026");

// Session token derived from the credentials + session secret, so it changes
// whenever the credentials change and is never the raw password.
const ADMIN_TOKEN =
  ADMIN_USERNAME && ADMIN_PASSWORD
    ? createHash("sha256")
        .update(
          `${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${process.env.SESSION_SECRET ?? "staybest"}`,
        )
        .digest("hex")
    : null;

export function hasAdminToken(req: Request): boolean {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return Boolean(ADMIN_TOKEN && token === ADMIN_TOKEN);
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Path 1: legacy admin key (admin dashboard login).
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
    next();
    return;
  }
  // Path 2: a signed-in Clerk user with the admin role.
  try {
    const user = await resolveUser(req);
    if (user?.role === "admin") {
      next();
      return;
    }
  } catch {
    // fall through to 401
  }
  if (!ADMIN_TOKEN) {
    res.status(503).json({
      message:
        "Admin access is disabled: set the ADMIN_USERNAME and ADMIN_PASSWORD secrets first.",
    });
    return;
  }
  res.status(401).json({ message: "Unauthorized" });
}

router.post("/admin/login", (req, res): void => {
  if (!ADMIN_TOKEN || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).json({
      message:
        "Admin access is disabled: set the ADMIN_USERNAME and ADMIN_PASSWORD secrets first.",
    });
    return;
  }
  const parsed = AdminLoginBody.safeParse(req.body);
  if (
    !parsed.success ||
    parsed.data.username !== ADMIN_USERNAME ||
    parsed.data.password !== ADMIN_PASSWORD
  ) {
    res.status(401).json({ message: "Invalid username or password" });
    return;
  }
  res.json(AdminLoginResponse.parse({ token: ADMIN_TOKEN }));
});

router.use("/admin", requireAdmin);

// Credential-token administrators have no Clerk identity. Audit their action
// with a null actor rather than attempting Clerk resolution after auth passed.
async function resolveAdminActor(req: Request) {
  try {
    return await resolveUser(req);
  } catch {
    return null;
  }
}

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const [customers, props, rooms, bookings, occupancy, reviews] = await Promise.all([
    db
      .select({ n: count() })
      .from(usersTable)
      .where(sql`${usersTable.role} = 'customer' and ${usersTable.status} <> 'deleted'`),
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where status = 'active')::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      })
      .from(propertiesTable),
    db
      .select({
        n: sql<number>`coalesce(sum(${roomsTable.totalRooms}), 0)::int`,
      })
      .from(roomsTable)
      .innerJoin(propertiesTable, eq(roomsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.status, "active")),
    db
      .select({
        total: sql<number>`count(*) filter (where status not in ('pending_payment', 'expired'))::int`,
        confirmed: sql<number>`count(*) filter (where status = 'confirmed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
        upcoming: sql<number>`count(*) filter (where status = 'confirmed' and check_in >= ${today})::int`,
        revenue: sql<number>`coalesce(sum(total_amount) filter (where status in ('confirmed', 'completed')), 0)::float`,
        todayRevenue: sql<number>`coalesce(sum(total_amount) filter (
          where status in ('confirmed', 'completed')
          and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
        ), 0)::float`,
        monthlyRevenue: sql<number>`coalesce(sum(total_amount) filter (
           where status in ('confirmed', 'completed')
          and date_trunc('month', created_at at time zone 'Asia/Kolkata') =
              date_trunc('month', now() at time zone 'Asia/Kolkata')
        ), 0)::float`,
      })
      .from(bookingsTable),
    db
      .select({
        occupied: sql<number>`coalesce(sum(${bookingsTable.roomsCount}) filter (
          where ${bookingsTable.status} = 'confirmed'
          and ${bookingsTable.checkIn} <= ${today}
          and ${bookingsTable.checkOut} > ${today}
        ), 0)::int`,
      })
      .from(bookingsTable)
      .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
      .where(eq(propertiesTable.status, "active")),
    db
      .select({
        n: count(),
        avg: sql<number>`coalesce(round(avg(rating)::numeric, 1), 0)::float`,
      })
      .from(reviewsTable),
  ]);

  res.json(
    GetAdminStatsResponse.parse({
      totalCustomers: customers[0]!.n,
      totalProperties: props[0]!.total,
      activeProperties: props[0]!.active,
      pendingProperties: props[0]!.pending,
      totalRooms: rooms[0]!.n,
      totalBookings: bookings[0]!.total,
      confirmedBookings: bookings[0]!.confirmed,
      cancelledBookings: bookings[0]!.cancelled,
      upcomingCheckIns: bookings[0]!.upcoming,
      totalRevenue: bookings[0]!.revenue,
      todayRevenue: bookings[0]!.todayRevenue,
      monthlyRevenue: bookings[0]!.monthlyRevenue,
      refundRequests: bookings[0]!.cancelled,
      refundStatus: bookings[0]!.cancelled > 0 ? "Pending review" : "No pending refunds",
      occupiedRooms: occupancy[0]!.occupied,
      occupancyRate: rooms[0]!.n > 0
        ? Math.round((occupancy[0]!.occupied / rooms[0]!.n) * 1000) / 10
        : 0,
      totalReviews: reviews[0]!.n,
      averageRating: reviews[0]!.avg,
    }),
  );
});

router.get("/admin/bookings", async (req, res): Promise<void> => {
  const parsed = ListAdminBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  let rows = await db
    .select()
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .orderBy(desc(bookingsTable.createdAt));

  if (parsed.data.status) {
    rows = rows.filter((r) => r.bookings.status === parsed.data.status);
  }

  const bookings = await Promise.all(
    rows.map(async (r) => {
      const refundSummary = await loadBookingRefundSummary(r.bookings.id);
      const paymentSummary = await loadPaymentSummary(r.bookings.id);
      return toBookingDto(r.bookings, r.properties, r.rooms, refundSummary, paymentSummary);
    }),
  );
  res.json(ListAdminBookingsResponse.parse(bookings));
});

router.get("/admin/bookings/:id", async (req, res): Promise<void> => {
  const params = GetAdminBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid booking id" });
    return;
  }
  const [row] = await db
    .select()
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  res.json(
    GetAdminBookingResponse.parse(
      toBookingDto(
        row.bookings,
        row.properties,
        row.rooms,
        await loadBookingRefundSummary(row.bookings.id),
        await loadPaymentSummary(row.bookings.id),
      ),
    ),
  );
});

router.get("/admin/bookings/:id/refunds", async (req, res): Promise<void> => {
  const params = GetAdminBookingRefundsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid booking id" });
    return;
  }
  const summary = await loadBookingRefundSummary(params.data.id);
  if (!summary) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  res.json(GetAdminBookingRefundsResponse.parse(summary));
});

router.post("/admin/bookings/:id/refunds", async (req, res): Promise<void> => {
  const params = CreateAdminBookingRefundParams.safeParse(req.params);
  const body = CreateAdminBookingRefundBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid refund request" });
    return;
  }

  const data = body.data;
  if (!isInvoiceDate(data.refundDate) || data.reason.trim().length === 0) {
    res.status(400).json({ message: "Refund date must be valid YYYY-MM-DD and reason must be non-empty" });
    return;
  }
  const refundReason = data.reason.trim();
  const refundReference = data.reference?.trim() || null;
  const actor = await resolveAdminActor(req);
  type RefundResult =
    | "created"
    | "same"
    | "conflict"
    | "missing"
    | "unavailable"
    | "overrefund"
    | "future"
    | "beforePayment";
  const result = await db.transaction(async (tx): Promise<RefundResult> => {
    const [booking] = await tx
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));
    if (!booking) return "missing";

    // Serialize idempotency-key checks for a booking even when two keys point
    // at different invoice payment sources. Per-invoice locking below still
    // matches the payment route's balance guard.
    await lockBooking(tx, params.data.id);

    const [source] = await tx
      .select({
        paymentId: invoicePaymentsTable.id,
        invoiceId: invoicesTable.id,
        amountMinor: invoicePaymentsTable.amountMinor,
        paymentDate: invoicePaymentsTable.paymentDate,
      })
      .from(invoicePaymentsTable)
      .innerJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
      .where(
        and(
          eq(invoicePaymentsTable.id, data.invoicePaymentId),
          eq(invoicesTable.bookingId, params.data.id),
        ),
      );
    if (!source) return "unavailable";

    // Match the invoice advisory lock used by manual payment recording. This
    // serializes payment and refund balance checks for the same invoice.
    await lockInvoice(tx, source.invoiceId);
    if (data.refundDate > currentBusinessDate()) return "future";
    if (data.refundDate < source.paymentDate) return "beforePayment";

    const [existing] = await tx
      .select()
      .from(bookingRefundsTable)
      .where(
        and(
          eq(bookingRefundsTable.bookingId, params.data.id),
          eq(bookingRefundsTable.idempotencyKey, data.idempotencyKey),
        ),
      );
    if (existing) {
      const same =
        existing.invoicePaymentId === data.invoicePaymentId &&
        existing.amountMinor === data.amountMinor &&
        existing.refundDate === data.refundDate &&
        existing.reason === refundReason &&
        existing.method === data.method &&
        (existing.reference ?? null) === refundReference;
      return same ? "same" : "conflict";
    }

    const [refunded] = await tx
      .select({
        amountMinor: sql<number>`coalesce(sum(${bookingRefundsTable.amountMinor}), 0)::int`,
      })
      .from(bookingRefundsTable)
      .where(eq(bookingRefundsTable.invoicePaymentId, source.paymentId));
    const remainingMinor = source.amountMinor - Number(refunded?.amountMinor ?? 0);
    if (data.amountMinor > remainingMinor) return "overrefund";

    await tx.insert(bookingRefundsTable).values({
      bookingId: params.data.id,
      invoiceId: source.invoiceId,
      invoicePaymentId: source.paymentId,
      amountMinor: data.amountMinor,
      refundDate: data.refundDate,
      reason: refundReason,
      reference: refundReference,
      method: data.method,
      actorUserId: actor?.id ?? null,
      idempotencyKey: data.idempotencyKey,
    });
    return "created";
  });

  if (result === "missing") {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  if (result === "conflict") {
    res.status(409).json({ message: "This idempotency key was already used for different refund details" });
    return;
  }
  if (result === "unavailable") {
    res.status(409).json({
      message:
        "The selected payment is not a recorded payment linked to this booking; legacy bookings with no linked payments have 0 refundable amount",
    });
    return;
  }
  if (result === "overrefund") {
    res.status(409).json({ message: "Refund amount exceeds the remaining amount for this payment source" });
    return;
  }
  if (result === "future") {
    res.status(400).json({ message: "Refund date cannot be in the future in the Asia/Kolkata business timezone" });
    return;
  }
  if (result === "beforePayment") {
    res.status(400).json({ message: "Refund date cannot be before the recorded payment date" });
    return;
  }

  const summary = await loadBookingRefundSummary(params.data.id);
  if (!summary) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  res.status(201).json(CreateAdminBookingRefundResponse.parse(summary));
});

router.post("/admin/bookings/:id/status", async (req, res): Promise<void> => {
  const params = UpdateBookingStatusParams.safeParse(req.params);
  const body = UpdateBookingStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (body.data.status === "confirmed") {
    res.status(409).json({
      reason: "pending_payment_requires_capture",
      message: "A pending payment booking can only be confirmed after Razorpay reports a captured payment.",
    });
    return;
  }
  if (!["cancelled", "completed"].includes(body.data.status)) {
    res.status(409).json({
      message: "Bookings can only transition from confirmed to completed or cancelled",
    });
    return;
  }
  const actor = await resolveAdminActor(req);

  const [updated] = await db.transaction(async (tx) => {
    // Serialize terminal booking transitions with checkout/reconciliation.
    const [lockRow] = await tx
      .select({ roomId: bookingsTable.roomId })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));
    if (lockRow) await lockRoomAndBooking(tx, lockRow.roomId, params.data.id);
    else await lockBooking(tx, params.data.id);
    const [booking] = await tx
      .update(bookingsTable)
      .set({ status: body.data.status })
      .where(and(
        eq(bookingsTable.id, params.data.id),
        eq(bookingsTable.status, "confirmed"),
      ))
      .returning();
    if (!booking) return [booking];
    if (body.data.status === "cancelled") {
      // Refunds remain an explicit/manual operator action; this only flags
      // captured online money that can no longer belong to an active stay.
      await tx
        .update(razorpayPaymentsTable)
        .set({ refundRequired: true, updatedAt: new Date() })
        .where(
          and(
            eq(razorpayPaymentsTable.bookingId, booking.id),
            eq(razorpayPaymentsTable.status, "captured"),
          ),
        );
    }
    if (body.data.status === "completed") {
      const pendingEntries = await tx
        .select()
        .from(commissionLedgerTable)
        .where(and(
          eq(commissionLedgerTable.bookingId, booking.id),
          eq(commissionLedgerTable.status, "pending"),
        ));
      const transitioned: number[] = [];
      for (const entry of pendingEntries) {
        const [available] = await tx
          .update(commissionLedgerTable)
          .set({ status: "available" })
          .where(and(
            eq(commissionLedgerTable.id, entry.id),
            eq(commissionLedgerTable.status, "pending"),
          ))
          .returning();
        if (available) transitioned.push(entry.id);
      }
      if (transitioned.length) await tx.insert(commissionLedgerEventsTable).values(
        transitioned.map((ledgerId) => ({
          ledgerId,
          actorUserId: actor?.id ?? null,
          fromStatus: "pending",
          toStatus: "available",
          reason: "admin_completed",
        })),
      );
    } else if (body.data.status === "cancelled") {
      const entries = await tx
        .select()
        .from(commissionLedgerTable)
        .where(eq(commissionLedgerTable.bookingId, booking.id));
      const transitioned: { id: number; fromStatus: string }[] = [];
      for (const entry of entries) {
        if (entry.status === "paid" || entry.status === "voided") continue;
        const [voided] = await tx
          .update(commissionLedgerTable)
          .set({ status: "voided" })
          .where(and(
            eq(commissionLedgerTable.id, entry.id),
            eq(commissionLedgerTable.status, entry.status),
          ))
          .returning();
        if (voided) transitioned.push({ id: entry.id, fromStatus: entry.status });
      }
      if (transitioned.length) await tx.insert(commissionLedgerEventsTable).values(
        transitioned.map((entry) => ({
          ledgerId: entry.id,
          actorUserId: actor?.id ?? null,
          fromStatus: entry.fromStatus,
          toStatus: "voided",
          reason: "admin_cancelled",
        })),
      );
    }
    return [booking];
  });
  if (!updated) {
    const [existing] = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));
    res.status(existing ? 409 : 404).json({
      message: existing
        ? "Booking is already in a terminal state and cannot be changed"
        : "Booking not found",
    });
    return;
  }

  const [row] = await db
    .select()
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, updated.id));

  res.json(
    UpdateBookingStatusResponse.parse(
      toBookingDto(
        row!.bookings,
        row!.properties,
        row!.rooms,
        null,
        await loadPaymentSummary(row!.bookings.id),
      ),
    ),
  );
});

function toPropertyDetail(
  p: typeof propertiesTable.$inferSelect,
  rooms: (typeof roomsTable.$inferSelect)[],
) {
  return {
    ...toPropertySummary(p),
    address: p.address,
    images: p.images,
    policies: p.policies,
    timezone: p.timezone,
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    rooms: rooms.map(toRoomDto),
  };
}

router.get("/admin/locations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(locationsTable)
    .orderBy(
      asc(locationsTable.country),
      asc(locationsTable.state),
      asc(locationsTable.district),
      asc(locationsTable.city),
      asc(locationsTable.area),
    );
  res.json(ListAdminLocationsResponse.parse(rows));
});

router.post("/admin/locations", async (req, res): Promise<void> => {
  const parsed = CreateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const country = parsed.data.country.trim();
  const state = parsed.data.state.trim();
  const district = parsed.data.district?.trim() || null;
  const city = parsed.data.city.trim();
  const area = parsed.data.area.trim();
  const pincode = parsed.data.pincode.trim();
  if (!country || !state || !city || !area) {
    res.status(400).json({ message: "Country, state, city and area are required" });
    return;
  }
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" });
    return;
  }
  try {
    const [created] = await db
      .insert(locationsTable)
      .values({ country, state, district, city, area, pincode })
      .returning();
    res.status(201).json(CreateLocationResponse.parse(created!));
  } catch (err: any) {
    // Unique index on the normalized location hierarchy.
    const code = err?.code ?? err?.cause?.code;
    if (code === "23505") {
      res.status(409).json({ message: "This location already exists" });
      return;
    }
    throw err;
  }
});

router.put("/admin/locations/:id", async (req, res): Promise<void> => {
  const params = UpdateLocationParams.safeParse(req.params);
  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Invalid location" });
    return;
  }
  const country = parsed.data.country.trim();
  const state = parsed.data.state.trim();
  const district = parsed.data.district?.trim() || null;
  const city = parsed.data.city.trim();
  const area = parsed.data.area.trim();
  const pincode = parsed.data.pincode.trim();
  if (!country || !state || !city || !area) {
    res.status(400).json({ message: "Country, state, city and area are required" });
    return;
  }
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" });
    return;
  }
  const [existing] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ message: "Location not found" });
    return;
  }
  if (existing.postalDirectoryId !== null) {
    res.status(409).json({
      message:
        "Directory-linked locations cannot be edited here; update the postal directory row instead",
    });
    return;
  }
  try {
    const [updated] = await db
      .update(locationsTable)
        .set({ country, state, district, city, area, pincode })
      .where(eq(locationsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Location not found" });
      return;
    }
    res.json(UpdateLocationResponse.parse(updated));
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code;
    if (code === "23505") {
      res.status(409).json({ message: "This location already exists" });
      return;
    }
    throw err;
  }
});

router.post("/admin/locations/:id/approval", async (req, res): Promise<void> => {
  const params = SetLocationApprovalParams.safeParse(req.params);
  const body = SetLocationApprovalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid location approval request" });
    return;
  }
  const [existing] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ message: "Location not found" });
    return;
  }
  if (existing.postalDirectoryId !== null) {
    res.status(409).json({
      message:
        "Directory-linked locations must be approved from the postal directory",
    });
    return;
  }
  const [updated] = await db
    .update(locationsTable)
    .set({ approved: body.data.approved })
    .where(eq(locationsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Location not found" });
    return;
  }
  res.json(SetLocationApprovalResponse.parse(updated));
});

router.post("/admin/locations/:id/delete", async (req, res): Promise<void> => {
  const params = DeleteLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select({ postalDirectoryId: locationsTable.postalDirectoryId })
    .from(locationsTable)
    .where(eq(locationsTable.id, params.data.id));
  if (existing?.postalDirectoryId !== null && existing?.postalDirectoryId !== undefined) {
    res.status(409).json({
      message:
        "Directory-linked locations cannot be deleted; unapprove the directory row to preserve history",
    });
    return;
  }
  const deleted = await db
    .delete(locationsTable)
    .where(eq(locationsTable.id, params.data.id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ message: "Location not found" });
    return;
  }
  res.json(DeleteLocationResponse.parse({ message: "Location removed" }));
});

router.post("/admin/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const d = parsed.data;
  if (d.pincode !== undefined && d.pincode !== "" && !/^\d{6}$/.test(d.pincode.trim())) {
    res.status(400).json({ message: "Pincode must be exactly 6 digits" });
    return;
  }
  if (d.timezone !== undefined && !isValidTimeZone(d.timezone)) {
    res.status(400).json({
      message: "timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)",
    });
    return;
  }
  if (!d.country?.trim() || !d.state?.trim()) {
    res.status(400).json({ message: "Country and State are required" });
    return;
  }
  if (!(await propertyLocationExistsInCatalog({
    country: d.country,
    state: d.state,
    city: d.city,
    area: d.area,
    pincode: d.pincode,
  }))) {
    res.status(400).json({
      message: "Select a valid Country, State, City, Area and Pincode from Locations",
    });
    return;
  }
  const [created] = await db
    .insert(propertiesTable)
    .values({
      ...d,
      images: d.images ?? [d.imageUrl],
      amenities: d.amenities ?? [],
      policies: d.policies ?? [],
      checkInTime: d.checkInTime ?? "2:00 PM",
      checkOutTime: d.checkOutTime ?? "11:00 AM",
      status: "active",
    })
    .returning();
  res.status(201).json(CreatePropertyResponse.parse(toPropertyDetail(created!, [])));
});

router.put("/admin/properties/:id", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  const body = UpdatePropertyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
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
  const [existing] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  const country = body.data.country?.trim() || existing.country;
  const state = body.data.state?.trim() || existing.state;
  const pincode = body.data.pincode?.trim() ?? existing.pincode;
  const locationInput = {
    country,
    state,
    city: body.data.city,
    area: body.data.area,
    pincode,
  };
  const locationUnchanged =
    (existing.country ?? "").toLowerCase() === (country ?? "").toLowerCase() &&
    (existing.state ?? "").toLowerCase() === (state ?? "").toLowerCase() &&
    existing.city.toLowerCase() === body.data.city.toLowerCase() &&
    existing.area.toLowerCase() === body.data.area.toLowerCase() &&
    existing.pincode === pincode;
  if (
    !locationUnchanged &&
    (!country ||
      !state ||
      !(await propertyLocationExistsInCatalog({
        ...locationInput,
        country,
        state,
      })))
  ) {
    res.status(400).json({
      message: "Select a valid Country, State, City, Area and Pincode from Locations",
    });
    return;
  }
  const [updated] = await db
    .update(propertiesTable)
    .set({ ...body.data, country, state })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.propertyId, updated.id));
  res.json(UpdatePropertyResponse.parse(toPropertyDetail(updated, rooms)));
});

router.delete("/admin/properties/:id", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const id = params.data.id;
  const result = await db.transaction(async (tx) => {
    const [history] = await tx
      .select({ n: count() })
      .from(bookingsTable)
      .where(eq(bookingsTable.propertyId, id));
    if ((history?.n ?? 0) > 0) return "has_history";
    await tx.delete(wishlistTable).where(eq(wishlistTable.propertyId, id));
    await tx.delete(reviewsTable).where(eq(reviewsTable.propertyId, id));
    await tx.delete(roomsTable).where(eq(roomsTable.propertyId, id));
    const deleted = await tx.delete(propertiesTable).where(eq(propertiesTable.id, id)).returning();
    return deleted.length ? "deleted" : "missing";
  });
  if (result === "has_history") {
    res.status(409).json({
      message: "Property cannot be deleted because booking and commission history must be retained",
    });
    return;
  }
  if (result === "missing") {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  res.json({ message: "Property deleted" });
});

router.post("/admin/rooms", async (req, res): Promise<void> => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, parsed.data.propertyId));
  if (!property) {
    res.status(400).json({ message: "Property not found" });
    return;
  }
  const [created] = await db
    .insert(roomsTable)
    .values({ ...parsed.data, amenities: parsed.data.amenities ?? [] })
    .returning();
  res.status(201).json(CreateRoomResponse.parse(toRoomDto(created!)));
});

router.put("/admin/rooms/:id", async (req, res): Promise<void> => {
  const params = UpdateRoomParams.safeParse(req.params);
  const body = UpdateRoomBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [targetProperty] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, body.data.propertyId));
  if (!targetProperty) {
    res.status(400).json({ message: "Target property not found" });
    return;
  }
  const [updated] = await db
    .update(roomsTable)
    .set(body.data)
    .where(eq(roomsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  res.json(UpdateRoomResponse.parse(toRoomDto(updated)));
});

router.delete("/admin/rooms/:id", async (req, res): Promise<void> => {
  const params = DeleteRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ n: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.roomId, params.data.id));
  if ((existing?.n ?? 0) > 0) {
    res.status(400).json({
      message: "Cannot delete a room type that has bookings. Cancel them first.",
    });
    return;
  }
  await db.delete(roomsTable).where(eq(roomsTable.id, params.data.id));
  res.json({ message: "Room deleted" });
});

function toOfferDto(o: typeof offersTable.$inferSelect) {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    couponCode: o.couponCode,
    discountPercent: o.discountPercent,
    active: o.active,
  };
}

router.get("/admin/offers/list", async (_req, res): Promise<void> => {
  const rows = await db.select().from(offersTable).orderBy(desc(offersTable.id));
  res.json(ListAdminOffersResponse.parse(rows.map(toOfferDto)));
});

router.post("/admin/offers", async (req, res): Promise<void> => {
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const [created] = await db.insert(offersTable).values(parsed.data).returning();
  res.status(201).json(CreateOfferResponse.parse(toOfferDto(created!)));
});

router.put("/admin/offers/:id", async (req, res): Promise<void> => {
  const params = UpdateOfferParams.safeParse(req.params);
  const body = UpdateOfferBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(offersTable)
    .set(body.data)
    .where(eq(offersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Offer not found" });
    return;
  }
  res.json(UpdateOfferResponse.parse(toOfferDto(updated)));
});

router.delete("/admin/offers/:id", async (req, res): Promise<void> => {
  const params = DeleteOfferParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  await db.delete(offersTable).where(eq(offersTable.id, params.data.id));
  res.json({ message: "Offer deleted" });
});

function toPromoBannerDto(banner: typeof promoBannersTable.$inferSelect) {
  return {
    ...banner,
    startsAt: banner.startsAt?.toISOString() ?? null,
    endsAt: banner.endsAt?.toISOString() ?? null,
    createdAt: banner.createdAt.toISOString(),
    updatedAt: banner.updatedAt.toISOString(),
  };
}

function promoBannerValues(data: {
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  city?: string | null;
  placement?: string;
  audience?: string;
  sortOrder: number;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  return {
    title: data.title,
    subtitle: data.subtitle ?? null,
    imageUrl: data.imageUrl,
    linkUrl: data.linkUrl ?? null,
    city: data.city ?? null,
    placement: data.placement ?? "home",
    audience: data.audience ?? "all",
    sortOrder: data.sortOrder,
    active: data.active,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    updatedAt: new Date(),
  };
}

router.get("/admin/promo-banners", async (_req, res): Promise<void> => {
  const rows = await db.select().from(promoBannersTable).orderBy(promoBannersTable.sortOrder, desc(promoBannersTable.id));
  res.json(ListPromoBannersResponse.parse(rows.map(toPromoBannerDto)));
});

router.post("/admin/promo-banners", async (req, res): Promise<void> => {
  const parsed = CreatePromoBannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const values = promoBannerValues(parsed.data);
  if (Number.isNaN(values.startsAt?.getTime()) || Number.isNaN(values.endsAt?.getTime())) {
    res.status(400).json({ message: "Invalid banner schedule" });
    return;
  }
  const [created] = await db.insert(promoBannersTable).values(values).returning();
  res.status(201).json(CreatePromoBannerResponse.parse(toPromoBannerDto(created!)));
});

router.put("/admin/promo-banners/:id", async (req, res): Promise<void> => {
  const params = UpdatePromoBannerParams.safeParse(req.params);
  const body = UpdatePromoBannerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid banner request" });
    return;
  }
  const values = promoBannerValues(body.data);
  if (Number.isNaN(values.startsAt?.getTime()) || Number.isNaN(values.endsAt?.getTime())) {
    res.status(400).json({ message: "Invalid banner schedule" });
    return;
  }
  const [updated] = await db
    .update(promoBannersTable)
    .set(values)
    .where(eq(promoBannersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Promotional banner not found" });
    return;
  }
  res.json(UpdatePromoBannerResponse.parse(toPromoBannerDto(updated)));
});

router.delete("/admin/promo-banners/:id", async (req, res): Promise<void> => {
  const params = DeletePromoBannerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(promoBannerEventsTable).where(eq(promoBannerEventsTable.bannerId, params.data.id));
    await tx.delete(promoBannersTable).where(eq(promoBannersTable.id, params.data.id));
  });
  res.json(DeletePromoBannerResponse.parse({ message: "Promotional banner deleted" }));
});


function toCmsPageDto(p: {
  slug: string;
  title: string;
  content: string;
  updatedAt: Date;
}) {
  return {
    slug: p.slug,
    title: p.title,
    content: p.content,
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/admin/cms-pages", async (_req, res): Promise<void> => {
  await ensureCmsPages();
  const rows = await db.select().from(cmsPagesTable).orderBy(cmsPagesTable.id);
  res.json(ListCmsPagesResponse.parse(rows.map(toCmsPageDto)));
});

router.put("/admin/cms-pages/:slug", async (req, res): Promise<void> => {
  const params = UpdateCmsPageParams.safeParse(req.params);
  const body = UpdateCmsPageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  await ensureCmsPages();
  const [updated] = await db
    .update(cmsPagesTable)
    .set({ title: body.data.title, content: body.data.content, updatedAt: new Date() })
    .where(eq(cmsPagesTable.slug, params.data.slug))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Page not found" });
    return;
  }
  res.json(UpdateCmsPageResponse.parse(toCmsPageDto(updated)));
});

function toCouponDto(c: typeof couponsTable.$inferSelect, usedCount = 0) {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    minAmount: c.minAmount,
    expiresAt: c.expiresAt,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
    usedCount,
    remainingUses: c.totalUsageLimit == null ? null : Math.max(0, c.totalUsageLimit - usedCount),
  };
}

router.get("/admin/coupons", async (_req, res): Promise<void> => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.id));
  const usage = await db.select({ couponId: couponRedemptionsTable.couponId, used: sql<number>`count(*)::int` })
    .from(couponRedemptionsTable).where(eq(couponRedemptionsTable.status, "applied"))
    .groupBy(couponRedemptionsTable.couponId);
  const byCoupon = new Map(usage.map((row) => [row.couponId, row.used]));
  res.json(ListAdminCouponsResponse.parse(rows.map((row) => toCouponDto(row, byCoupon.get(row.id) ?? 0))));
});

router.post("/admin/coupons", async (req, res): Promise<void> => {
  const parsed = CreateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  const [existing] = await db
    .select({ id: couponsTable.id })
    .from(couponsTable)
    .where(eq(sql`upper(${couponsTable.code})`, code));
  if (existing) {
    res.status(400).json({ message: "A coupon with this code already exists" });
    return;
  }
  const [created] = await db
    .insert(couponsTable)
    .values({ ...parsed.data, code })
    .returning();
  res.status(201).json(CreateCouponResponse.parse(toCouponDto(created!)));
});

router.put("/admin/coupons/:id", async (req, res): Promise<void> => {
  const params = UpdateCouponParams.safeParse(req.params);
  const body = UpdateCouponBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(couponsTable)
    .set({ ...body.data, code: body.data.code.trim().toUpperCase() })
    .where(eq(couponsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Coupon not found" });
    return;
  }
  res.json(UpdateCouponResponse.parse(toCouponDto(updated)));
});

router.delete("/admin/coupons/:id", async (req, res): Promise<void> => {
  const params = DeleteCouponParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  await db.delete(couponsTable).where(eq(couponsTable.id, params.data.id));
  res.json({ message: "Coupon deleted" });
});

router.get("/admin/users", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.status} <> 'deleted'`)
    .orderBy(desc(usersTable.createdAt));
  res.json(
    ListAdminUsersResponse.parse(
      rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role })),
    ),
  );
});

const agentProfileDto = (user: typeof usersTable.$inferSelect) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  statusReason: user.statusReason,
  approvalStatus: user.approvalStatus,
  approvalReason: user.approvalReason,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

async function findAgent(id: string) {
  const [agent] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "agent"), sql`${usersTable.status} <> 'deleted'`));
  return agent;
}

const pageValues = (query: { page?: number; limit?: number }) => ({
  page: query.page ?? 1,
  limit: query.limit ?? 25,
});

function parseFilterDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) return null;
  return parsed;
}

const safeBookingDto = (
  booking: typeof bookingsTable.$inferSelect,
  propertyName: string,
) => ({
  id: booking.id,
  bookingRef: booking.bookingRef,
  propertyId: booking.propertyId,
  propertyName,
  checkIn: booking.checkIn,
  checkOut: booking.checkOut,
  guestName: booking.guestName,
  status: booking.status,
  totalAmount: booking.totalAmount,
  createdAt: booking.createdAt.toISOString(),
});

router.get("/admin/agents", async (req, res): Promise<void> => {
  const parsed = ListAdminAgentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const { page, limit } = pageValues(parsed.data);
  const filters = [
    eq(usersTable.role, "agent"),
    sql`${usersTable.status} <> 'deleted'`,
    parsed.data.query
      ? sql`(${ilike(usersTable.name, `%${parsed.data.query}%`)} or ${ilike(usersTable.email, `%${parsed.data.query}%`)})`
      : undefined,
    parsed.data.accountStatus ? eq(usersTable.status, parsed.data.accountStatus) : undefined,
    parsed.data.approvalStatus ? eq(usersTable.approvalStatus, parsed.data.approvalStatus) : undefined,
  ].filter(Boolean);
  const where = and(...filters);
  const [totalRow, agents, summary] = await Promise.all([
    db.select({ n: count() }).from(usersTable).where(where),
    db.select({
      user: usersTable,
      propertyCount: sql<number>`(select count(*)::int from properties p where p.owner_id = users.id)`,
      pendingProperties: sql<number>`(select count(*)::int from properties p where p.owner_id = users.id and p.status = 'pending')`,
      attributedBookings: sql<number>`(select count(*) filter (where b.status in ('confirmed', 'completed', 'cancelled'))::int from bookings b where b.agent_id = users.id)`,
      commissionPending: sql<number>`(select coalesce(sum(amount),0)::float from commission_ledger l where l.recipient_user_id = users.id and l.status = 'pending')`,
      commissionAvailable: sql<number>`(select coalesce(sum(amount),0)::float from commission_ledger l where l.recipient_user_id = users.id and l.status = 'available')`,
      commissionPaid: sql<number>`(select coalesce(sum(amount),0)::float from commission_ledger l where l.recipient_user_id = users.id and l.status = 'paid')`,
    }).from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${usersTable.status} = 'active')::int`,
      blocked: sql<number>`count(*) filter (where ${usersTable.status} = 'blocked')::int`,
      pendingApprovals: sql<number>`count(*) filter (where ${usersTable.approvalStatus} = 'pending')::int`,
      pendingProperties: sql<number>`(select count(*)::int from properties p join users u on u.id=p.owner_id where u.role='agent' and u.status <> 'deleted' and p.status='pending')`,
      attributedBookings: sql<number>`(select count(*) filter (where b.status in ('confirmed', 'completed', 'cancelled'))::int from bookings b join users u on u.id=b.agent_id where u.role='agent' and u.status <> 'deleted')`,
      commissionPending: sql<number>`(select coalesce(sum(l.amount),0)::float from commission_ledger l join users u on u.id=l.recipient_user_id where u.role='agent' and u.status <> 'deleted' and l.status='pending')`,
      commissionAvailable: sql<number>`(select coalesce(sum(l.amount),0)::float from commission_ledger l join users u on u.id=l.recipient_user_id where u.role='agent' and u.status <> 'deleted' and l.status='available')`,
      commissionPaid: sql<number>`(select coalesce(sum(l.amount),0)::float from commission_ledger l join users u on u.id=l.recipient_user_id where u.role='agent' and u.status <> 'deleted' and l.status='paid')`,
      payoutFailed: sql<number>`(select coalesce(sum(p.amount),0)::float from payouts p join users u on u.id=p.user_id where u.role='agent' and u.status <> 'deleted' and p.status='failed')`,
      payoutRequested: sql<number>`(select coalesce(sum(p.amount),0)::float from payouts p join users u on u.id=p.user_id where u.role='agent' and u.status <> 'deleted' and p.status='requested')`,
    }).from(usersTable).where(and(eq(usersTable.role, "agent"), sql`${usersTable.status} <> 'deleted'`)),
  ]);
  res.json(ListAdminAgentsResponse.parse({
    summary: summary[0],
    items: agents.map(({ user, ...totals }) => ({ ...agentProfileDto(user), ...totals })),
    pagination: { page, limit, total: totalRow[0]?.n ?? 0 },
  }));
});

router.post("/admin/agents/:id/status", async (req, res): Promise<void> => {
  const params = SetAdminAgentStatusParams.safeParse(req.params);
  const body = SetAdminAgentStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid status transition" });
    return;
  }
  const reason = body.data.reason?.trim() || null;
  if (body.data.status === body.data.expectedStatus) {
    res.status(409).json({ message: "Agent is already in that status" });
    return;
  }
  if (body.data.status === "blocked" && !reason) {
    res.status(400).json({ message: "A reason is required to block an agent" });
    return;
  }
  const actor = await resolveAdminActor(req);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(usersTable).set({
      status: body.data.status,
      statusReason: reason,
      updatedAt: new Date(),
    }).where(and(
      eq(usersTable.id, params.data.id),
      eq(usersTable.role, "agent"),
      eq(usersTable.status, body.data.expectedStatus),
    )).returning();
    if (!row) return null;
    await tx.insert(agentLifecycleEventsTable).values({
      agentId: row.id,
      actorUserId: actor?.id ?? null,
      kind: "account_status",
      fromStatus: body.data.expectedStatus,
      toStatus: body.data.status,
      reason,
    });
    return row;
  });
  if (!updated) {
    const agent = await findAgent(params.data.id);
    res.status(agent ? 409 : 404).json({ message: agent ? "Agent status changed; refresh and retry" : "Agent not found" });
    return;
  }
  res.json(SetAdminAgentStatusResponse.parse(agentProfileDto(updated)));
});

router.post("/admin/agents/:id/approval", async (req, res): Promise<void> => {
  const params = SetAdminAgentApprovalParams.safeParse(req.params);
  const body = SetAdminAgentApprovalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid approval transition" });
    return;
  }
  const reason = body.data.reason?.trim() || null;
  if (body.data.status === "rejected" && !reason) {
    res.status(400).json({ message: "A reason is required to reject an agent" });
    return;
  }
  const allowed = body.data.expectedStatus !== body.data.status &&
    (body.data.expectedStatus === "pending" || body.data.status === "pending");
  if (!allowed) {
    res.status(409).json({ message: "Approval must transition through pending" });
    return;
  }
  const actor = await resolveAdminActor(req);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(usersTable).set({
      approvalStatus: body.data.status,
      approvalReason: reason,
      updatedAt: new Date(),
    }).where(and(
      eq(usersTable.id, params.data.id),
      eq(usersTable.role, "agent"),
      eq(usersTable.approvalStatus, body.data.expectedStatus),
      sql`${usersTable.status} <> 'deleted'`,
    )).returning();
    if (!row) return null;
    await tx.insert(agentLifecycleEventsTable).values({
      agentId: row.id,
      actorUserId: actor?.id ?? null,
      kind: "approval_status",
      fromStatus: body.data.expectedStatus,
      toStatus: body.data.status,
      reason,
    });
    return row;
  });
  if (!updated) {
    const agent = await findAgent(params.data.id);
    res.status(agent ? 409 : 404).json({ message: agent ? "Agent approval changed; refresh and retry" : "Agent not found" });
    return;
  }
  res.json(SetAdminAgentApprovalResponse.parse(agentProfileDto(updated)));
});

router.get("/admin/agents/:id/bookings", async (req, res): Promise<void> => {
  const params = ListAdminAgentBookingsParams.safeParse(req.params);
  const query = ListAdminAgentBookingsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ message: "Invalid booking filters" });
    return;
  }
  if (!(await findAgent(params.data.id))) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const { page, limit } = pageValues(query.data);
  const from = parseFilterDate(query.data.from);
  const to = parseFilterDate(query.data.to, true);
  if ((query.data.from && !from) || (query.data.to && !to)) {
    res.status(400).json({ message: "Dates must be valid YYYY-MM-DD values" });
    return;
  }
  const where = and(
    eq(bookingsTable.agentId, params.data.id),
    query.data.status ? eq(bookingsTable.status, query.data.status) : undefined,
    from ? gte(bookingsTable.createdAt, from) : undefined,
    to ? lte(bookingsTable.createdAt, to) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db.select({ booking: bookingsTable, propertyName: propertiesTable.name })
      .from(bookingsTable)
      .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
      .where(where).orderBy(desc(bookingsTable.createdAt))
      .limit(limit).offset((page - 1) * limit),
    db.select({ n: count() }).from(bookingsTable).where(where),
  ]);
  res.json(ListAdminAgentBookingsResponse.parse({
    items: rows.map(({ booking, propertyName }) => safeBookingDto(booking, propertyName)),
    pagination: { page, limit, total: totals[0]?.n ?? 0 },
  }));
});

router.get("/admin/agents/:id/ledger", async (req, res): Promise<void> => {
  const params = ListAdminAgentLedgerParams.safeParse(req.params);
  const query = ListAdminAgentLedgerQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ message: "Invalid ledger filters" });
    return;
  }
  if (!(await findAgent(params.data.id))) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const { page, limit } = pageValues(query.data);
  const from = parseFilterDate(query.data.from);
  const to = parseFilterDate(query.data.to, true);
  if ((query.data.from && !from) || (query.data.to && !to)) {
    res.status(400).json({ message: "Dates must be valid YYYY-MM-DD values" });
    return;
  }
  const where = and(
    eq(commissionLedgerTable.recipientUserId, params.data.id),
    eq(commissionLedgerTable.allocationType, "agent"),
    sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
    query.data.status ? eq(commissionLedgerTable.status, query.data.status) : undefined,
    from ? gte(commissionLedgerTable.createdAt, from) : undefined,
    to ? lte(commissionLedgerTable.createdAt, to) : undefined,
  );
  const [rows, totals, balances] = await Promise.all([
    db.select({ entry: commissionLedgerTable, bookingRef: bookingsTable.bookingRef })
      .from(commissionLedgerTable)
      .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
      .where(where).orderBy(desc(commissionLedgerTable.createdAt))
      .limit(limit).offset((page - 1) * limit),
    db.select({ n: count() })
      .from(commissionLedgerTable)
      .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
      .where(where),
    db.select({
      pending: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='pending'),0)::float`,
      available: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='available'),0)::float`,
      paid: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='paid'),0)::float`,
      voided: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='voided'),0)::float`,
    })
      .from(commissionLedgerTable)
      .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
      .where(where),
  ]);
  const ids = rows.map(({ entry }) => entry.id);
  const events = ids.length
    ? await db.select().from(commissionLedgerEventsTable)
        .where(inArray(commissionLedgerEventsTable.ledgerId, ids))
        .orderBy(commissionLedgerEventsTable.createdAt)
    : [];
  res.json(ListAdminAgentLedgerResponse.parse({
    items: rows.map(({ entry, bookingRef }) => ({
      ...entry,
      bookingRef,
      createdAt: entry.createdAt.toISOString(),
      events: events.filter((event) => event.ledgerId === entry.id).map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    })),
    balances: balances[0],
    pagination: { page, limit, total: totals[0]?.n ?? 0 },
  }));
});

router.get("/admin/agents/:id/payouts", async (req, res): Promise<void> => {
  const params = ListAdminAgentPayoutsParams.safeParse(req.params);
  const query = ListAdminAgentPayoutsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ message: "Invalid payout filters" });
    return;
  }
  if (!(await findAgent(params.data.id))) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const { page, limit } = pageValues(query.data);
  const from = parseFilterDate(query.data.from);
  const to = parseFilterDate(query.data.to, true);
  if ((query.data.from && !from) || (query.data.to && !to)) {
    res.status(400).json({ message: "Dates must be valid YYYY-MM-DD values" });
    return;
  }
  const where = and(
    eq(payoutsTable.userId, params.data.id),
    query.data.status ? eq(payoutsTable.status, query.data.status) : undefined,
    from ? gte(payoutsTable.createdAt, from) : undefined,
    to ? lte(payoutsTable.createdAt, to) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db.select().from(payoutsTable).where(where).orderBy(desc(payoutsTable.createdAt))
      .limit(limit).offset((page - 1) * limit),
    db.select({ n: count() }).from(payoutsTable).where(where),
  ]);
  res.json(ListAdminAgentPayoutsResponse.parse({
    items: rows.map((payout) => ({ ...payout, createdAt: payout.createdAt.toISOString() })),
    pagination: { page, limit, total: totals[0]?.n ?? 0 },
  }));
});

router.post("/admin/agents/:agentId/properties/:propertyId/review", async (req, res): Promise<void> => {
  const params = ReviewAdminAgentPropertyParams.safeParse(req.params);
  const body = ReviewAdminAgentPropertyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid property review" });
    return;
  }
  const reason = body.data.reason?.trim() || null;
  if (body.data.status === "rejected" && !reason) {
    res.status(400).json({ message: "A reason is required to reject a property" });
    return;
  }
  const allowed =
    (body.data.expectedStatus === "pending" && ["approved", "rejected"].includes(body.data.status)) ||
    (body.data.expectedStatus === "approved" && ["active", "rejected"].includes(body.data.status)) ||
    (body.data.expectedStatus === "rejected" && body.data.status === "approved");
  if (!allowed) {
    res.status(409).json({ message: "Invalid property review transition" });
    return;
  }
  const agent = await findAgent(params.data.agentId);
  if (!agent) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const actor = await resolveAdminActor(req);
  const updated = await db.transaction(async (tx) => {
    const [property] = await tx.update(propertiesTable).set({
      status: body.data.status,
      reviewReason: reason,
      reviewedBy: actor?.id ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(propertiesTable.id, params.data.propertyId),
      eq(propertiesTable.ownerId, agent.id),
      eq(propertiesTable.status, body.data.expectedStatus),
    )).returning();
    if (!property) return null;
    await tx.insert(propertyReviewEventsTable).values({
      propertyId: property.id,
      agentId: agent.id,
      actorUserId: actor?.id ?? null,
      fromStatus: body.data.expectedStatus,
      toStatus: body.data.status,
      reason,
    });
    return property;
  });
  if (!updated) {
    const [property] = await db.select({ ownerId: propertiesTable.ownerId, status: propertiesTable.status })
      .from(propertiesTable).where(eq(propertiesTable.id, params.data.propertyId));
    res.status(!property || property.ownerId !== agent.id ? 404 : 409).json({
      message: !property || property.ownerId !== agent.id
        ? "Agent-owned property not found"
        : "Property status changed; refresh and retry",
    });
    return;
  }
  res.json(ReviewAdminAgentPropertyResponse.parse(toPropertySummary(updated)));
});

router.get("/admin/agents/:id", async (req, res): Promise<void> => {
  const params = GetAdminAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const agent = await findAgent(params.data.id);
  if (!agent) {
    res.status(404).json({ message: "Agent not found" });
    return;
  }
  const [lifecycle, terms, termHistory, properties, propertyReviewHistory, bookingRows, ledgerRows, balances, payouts] =
    await Promise.all([
      db.select().from(agentLifecycleEventsTable)
        .where(eq(agentLifecycleEventsTable.agentId, agent.id))
        .orderBy(desc(agentLifecycleEventsTable.createdAt)),
      db.select().from(commercialTermsTable)
        .where(eq(commercialTermsTable.userId, agent.id)).limit(1),
      db.select().from(commercialTermEventsTable)
        .where(eq(commercialTermEventsTable.userId, agent.id))
        .orderBy(desc(commercialTermEventsTable.createdAt)),
      db.select().from(propertiesTable)
        .where(eq(propertiesTable.ownerId, agent.id)).orderBy(desc(propertiesTable.createdAt)),
      db.select({ event: propertyReviewEventsTable, propertyName: propertiesTable.name })
        .from(propertyReviewEventsTable)
        .innerJoin(propertiesTable, eq(propertyReviewEventsTable.propertyId, propertiesTable.id))
        .where(eq(propertyReviewEventsTable.agentId, agent.id))
        .orderBy(desc(propertyReviewEventsTable.createdAt)),
      db.select({ booking: bookingsTable, propertyName: propertiesTable.name })
        .from(bookingsTable).innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
        .where(eq(bookingsTable.agentId, agent.id)).orderBy(desc(bookingsTable.createdAt)).limit(100),
      db.select({ entry: commissionLedgerTable, bookingRef: bookingsTable.bookingRef })
        .from(commissionLedgerTable).innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
        .where(and(
          eq(commissionLedgerTable.recipientUserId, agent.id),
          eq(commissionLedgerTable.allocationType, "agent"),
          sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
        ))
        .orderBy(desc(commissionLedgerTable.createdAt)).limit(100),
      db.select({
        pending: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='pending'),0)::float`,
        available: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='available'),0)::float`,
        paid: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='paid'),0)::float`,
        voided: sql<number>`coalesce(sum(${commissionLedgerTable.amount}) filter (where ${commissionLedgerTable.status}='voided'),0)::float`,
      })
        .from(commissionLedgerTable)
        .innerJoin(bookingsTable, eq(commissionLedgerTable.bookingId, bookingsTable.id))
        .where(and(
          eq(commissionLedgerTable.recipientUserId, agent.id),
          eq(commissionLedgerTable.allocationType, "agent"),
          sql`${bookingsTable.status} not in ('pending_payment', 'expired')`,
        )),
      db.select().from(payoutsTable).where(eq(payoutsTable.userId, agent.id))
        .orderBy(desc(payoutsTable.createdAt)).limit(100),
    ]);
  const ledgerIds = ledgerRows.map(({ entry }) => entry.id);
  const ledgerEvents = ledgerIds.length
    ? await db.select().from(commissionLedgerEventsTable)
        .where(inArray(commissionLedgerEventsTable.ledgerId, ledgerIds))
        .orderBy(commissionLedgerEventsTable.createdAt)
    : [];
  res.json(GetAdminAgentResponse.parse({
    profile: agentProfileDto(agent),
    lifecycleHistory: lifecycle.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    commercialTerms: terms[0] ? {
      mode: terms[0].mode,
      value: terms[0].value,
      updatedAt: terms[0].updatedAt.toISOString(),
    } : null,
    commercialTermHistory: termHistory.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    properties: properties.map(toPropertySummary),
    propertyReviewHistory: propertyReviewHistory.map(({ event, propertyName }) => ({
      ...event,
      propertyName,
      createdAt: event.createdAt.toISOString(),
    })),
    bookings: bookingRows.map(({ booking, propertyName }) => safeBookingDto(booking, propertyName)),
    ledger: ledgerRows.map(({ entry, bookingRef }) => ({
      ...entry,
      bookingRef,
      createdAt: entry.createdAt.toISOString(),
      events: ledgerEvents.filter((event) => event.ledgerId === entry.id)
        .map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    })),
    balances: balances[0],
    payouts: payouts.map((payout) => ({ ...payout, createdAt: payout.createdAt.toISOString() })),
  }));
});

router.get("/admin/commercial-terms", async (req, res): Promise<void> => {
  const rows = await db
    .select({ user: usersTable, terms: commercialTermsTable })
    .from(usersTable)
    .leftJoin(commercialTermsTable, eq(commercialTermsTable.userId, usersTable.id))
    .where(sql`${usersTable.status} <> 'deleted' and ${usersTable.role} in ('agent', 'partner')`)
    .orderBy(desc(usersTable.createdAt));
  req.log.info({ count: rows.length }, "Listed commercial terms");
  res.json(ListAdminCommercialTermsResponse.parse(rows.map(({ user, terms }) => ({
    userId: user.id, email: user.email, name: user.name, role: user.role,
    mode: terms?.mode ?? "percentage", value: terms?.value ?? 0,
    updatedAt: terms?.updatedAt.toISOString() ?? null,
  }))));
});

router.put("/admin/users/:userId/commercial-terms", async (req, res): Promise<void> => {
  const params = UpsertAdminCommercialTermsParams.safeParse(req.params);
  const body = UpsertAdminCommercialTermsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    req.log.warn("Invalid commercial terms update");
    res.status(400).json({ message: "Invalid commercial terms input" }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!user || !["agent", "partner"].includes(user.role)) {
    res.status(404).json({ message: "Agent or partner not found" }); return;
  }
  // A percentage cannot exceed the booking value; fixed terms are bounded at
  // allocation time by the booking amount.
  if (body.data.mode === "percentage" && body.data.value > 100) {
    res.status(400).json({ message: "Percentage terms cannot exceed 100" }); return;
  }
  const actor = await resolveAdminActor(req);
  const terms = await db.transaction(async (tx) => {
    const [previous] = await tx.select().from(commercialTermsTable)
      .where(eq(commercialTermsTable.userId, user.id));
    const values = {
      mode: body.data.mode,
      value: body.data.value,
      updatedBy: actor?.id ?? null,
      updatedAt: new Date(),
    };
    let saved: typeof commercialTermsTable.$inferSelect | undefined;
    if (previous) {
      if (!body.data.expectedUpdatedAt) return null;
      const expectedUpdatedAt = new Date(body.data.expectedUpdatedAt);
      if (Number.isNaN(expectedUpdatedAt.getTime())) return null;
      [saved] = await tx.update(commercialTermsTable).set(values).where(and(
        eq(commercialTermsTable.userId, user.id),
        // API timestamps are ISO milliseconds while PostgreSQL can retain
        // microseconds; compare at the representation precision clients see.
        sql`date_trunc('milliseconds', ${commercialTermsTable.updatedAt}) = ${expectedUpdatedAt}`,
      )).returning();
    } else {
      if (body.data.expectedUpdatedAt) return null;
      [saved] = await tx.insert(commercialTermsTable).values({ userId: user.id, ...values })
        .onConflictDoNothing().returning();
    }
    if (!saved) return null;
    await tx.insert(commercialTermEventsTable).values({
      userId: user.id,
      actorUserId: actor?.id ?? null,
      fromMode: previous?.mode ?? null,
      fromValue: previous?.value ?? null,
      toMode: body.data.mode,
      toValue: body.data.value,
      reason: body.data.reason?.trim() || null,
    });
    return saved;
  });
  if (!terms) {
    res.status(409).json({ message: "Commercial terms changed; refresh and retry" });
    return;
  }
  req.log.info({ userId: user.id, mode: terms!.mode, value: terms!.value }, "Upserted commercial terms");
  res.json(UpsertAdminCommercialTermsResponse.parse({
    userId: user.id, email: user.email, name: user.name, role: user.role,
    mode: terms!.mode, value: terms!.value, updatedAt: terms!.updatedAt.toISOString(),
  }));
});

router.get("/admin/properties", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(propertiesTable)
    .orderBy(desc(propertiesTable.createdAt));
  res.json(ListAdminPropertiesResponse.parse(rows.map(toPropertySummary)));
});

router.post("/admin/properties/:id/status", async (req, res): Promise<void> => {
  const params = SetPropertyStatusParams.safeParse(req.params);
  const body = SetPropertyStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(propertiesTable)
    .set({ status: body.data.status })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  res.json(
    SetPropertyStatusResponse.parse({
      message: `Property is now ${body.data.status}`,
    }),
  );
});

router.post("/admin/vendors/create", async (req, res): Promise<void> => {
  const body = CreateVendorLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const rawUsername = (body.data.username ?? "").trim().toLowerCase();
  if (rawUsername && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(rawUsername)) {
    res.status(400).json({
      message: "Username must be 3-30 characters: letters, numbers, dots, dashes or underscores",
    });
    return;
  }
  const email = rawUsername
    ? `${rawUsername}@partner.staybest.com`
    : (body.data.email ?? "").trim().toLowerCase();
  if (!email || email.length < 3) {
    res.status(400).json({ message: "Provide an email or a username" });
    return;
  }
  const name = (body.data.name ?? "").trim() || email.split("@")[0]!;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);
  if (existing) {
    res.status(409).json({ message: "A user with this email already exists" });
    return;
  }
  // Generate a strong, readable temporary password.
  const rand = () => Math.random().toString(36).slice(2, 6);
  const password = `SB-${rand()}-${rand()}-${rand()}`.toUpperCase();
  let clerkUserId: string;
  try {
    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      firstName: name,
      skipPasswordChecks: true,
    });
    clerkUserId = created.id;
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Could not create login";
    res.status(err?.status === 422 ? 409 : 500).json({ message: msg });
    return;
  }
  await db.insert(usersTable).values({
    id: clerkUserId,
    email,
    name,
    role: "partner",
  });
  await db.insert(vendorCredentialsTable).values({ userId: clerkUserId, password });
  res.status(201).json(
    CreateVendorLoginResponse.parse({
      email,
      username: rawUsername || undefined,
      password,
      name,
    }),
  );
});

router.get("/admin/vendors/credentials", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      password: vendorCredentialsTable.password,
      updatedAt: vendorCredentialsTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(vendorCredentialsTable, eq(vendorCredentialsTable.userId, usersTable.id))
    .where(eq(usersTable.role, "partner"))
    .orderBy(usersTable.email);
  res.json(
    ListVendorCredentialsResponse.parse(
      rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        name: r.name,
        password: r.password ?? null,
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      })),
    ),
  );
});

router.post("/admin/vendors/:id/password", async (req, res): Promise<void> => {
  const params = SetVendorPasswordParams.safeParse(req.params);
  const body = SetVendorPasswordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input (password must be at least 8 characters)" });
    return;
  }
  const [vendor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!vendor || vendor.role !== "partner") {
    res.status(404).json({ message: "Vendor not found" });
    return;
  }
  if (vendor.id.startsWith("invited:")) {
    res.status(400).json({
      message: "This vendor has not signed in yet, so there is no login to update. Use Create Vendor Login instead.",
    });
    return;
  }
  const rand = () => Math.random().toString(36).slice(2, 6);
  const password = body.data.password ?? `SB-${rand()}-${rand()}-${rand()}`.toUpperCase();
  try {
    await clerkClient.users.updateUser(vendor.id, {
      password,
      skipPasswordChecks: true,
    });
  } catch (err: any) {
    const msg =
      err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Could not update password";
    res.status(500).json({ message: msg });
    return;
  }
  await db
    .insert(vendorCredentialsTable)
    .values({ userId: vendor.id, password, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: vendorCredentialsTable.userId,
      set: { password, updatedAt: new Date() },
    });
  res.json(
    SetVendorPasswordResponse.parse({ email: vendor.email, password, name: vendor.name }),
  );
});

router.get("/admin/customers", async (_req, res): Promise<void> => {
  const customers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "customer"))
    .orderBy(desc(usersTable.createdAt));
  const stats = await db
    .select({
      userId: bookingsTable.userId,
      bookingsCount: sql<number>`count(*) filter (where ${bookingsTable.status} in ('confirmed', 'completed', 'cancelled'))::int`,
      totalSpent: sql<number>`coalesce(sum(${bookingsTable.totalAmount}) filter (where ${bookingsTable.status} in ('confirmed', 'completed')), 0)::float`,
      lastBookingAt: sql<string | null>`max(${bookingsTable.createdAt}) filter (where ${bookingsTable.status} in ('confirmed', 'completed', 'cancelled'))::text`,
    })
    .from(bookingsTable)
    .groupBy(bookingsTable.userId);
  const byUser = new Map(stats.map((r) => [r.userId, r]));
  const logins = await db.select().from(customerLoginsTable);
  const byLogin = new Map(logins.map((login) => [login.userId, login.username]));
  res.json(
    ListAdminCustomersResponse.parse(
      customers.map((c) => {
        const st = byUser.get(c.id);
        return {
          id: c.id,
          email: c.email,
          name: c.name,
          username: byLogin.get(c.id) ?? null,
          status: c.status,
          bookingsCount: st?.bookingsCount ?? 0,
          totalSpent: st?.totalSpent ?? 0,
          lastBookingAt: st?.lastBookingAt ?? null,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    ),
  );
});

router.post("/admin/customers", async (req, res): Promise<void> => {
  const body = CreateCustomerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Enter a valid customer name and email address" });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const name = body.data.name.trim();
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  if (username && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    res.status(400).json({ message: "Username must be 3–30 letters, numbers, dots, dashes or underscores" });
    return;
  }
  const givenPassword = req.body?.password;
  if (givenPassword !== undefined && (typeof givenPassword !== "string" || givenPassword.length < 8 || givenPassword.length > 128)) {
    res.status(400).json({ message: "Password must be 8–128 characters" });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);
  if (existing) {
    res.status(409).json({ message: "A customer with this email already exists" });
    return;
  }
  if (username) {
    const [duplicate] = await db.select().from(customerLoginsTable).where(eq(customerLoginsTable.username, username));
    if (duplicate) { res.status(409).json({ message: "Username is already taken" }); return; }
    const password = givenPassword ?? `SB-${randomBytes(18).toString("base64url")}`;
    let created: Awaited<ReturnType<typeof clerkClient.users.createUser>>;
    try {
      created = await clerkClient.users.createUser({ emailAddress: [email], password, firstName: name });
    } catch (error: any) {
      res.status(error?.status === 422 ? 409 : 503).json({ message: "Could not create customer login; check the email and password" });
      return;
    }
    try {
      await db.transaction(async (tx) => {
        await tx.insert(usersTable).values({ id: created.id, email, name, role: "customer", status: "active" });
        await tx.insert(customerLoginsTable).values({ userId: created.id, username });
      });
    } catch (error) {
      try { await clerkClient.users.deleteUser(created.id); } catch { req.log?.error({ reason: "customer_login_cleanup_failed" }, "Customer account cleanup needed"); }
      res.status(409).json({ message: "Could not save customer login. Email or username may already exist." });
      return;
    }
    res.status(201).json({ message: "Customer login created", username, password });
    return;
  }
  try {
    await db.insert(usersTable).values({
      id: `invited:${randomUUID()}`,
      email,
      name,
      role: "customer",
      status: "active",
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      (("code" in err && (err as { code?: string }).code === "23505") ||
        ("cause" in err &&
          (err as { cause?: { code?: string } }).cause?.code === "23505"))
    ) {
      res.status(409).json({ message: "A customer with this email already exists" });
      return;
    }
    throw err;
  }
  res.status(201).json(CreateCustomerResponse.parse({ message: "Customer added" }));
});

router.post("/admin/customers/:id/login", async (req, res): Promise<void> => {
  const id = req.params.id;
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const supplied = req.body?.password;
  if (!id || !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) ||
    (supplied !== undefined && (typeof supplied !== "string" || supplied.length < 8 || supplied.length > 128))) {
    res.status(400).json({ message: "Provide a valid username and password (8–128 characters)" });
    return;
  }
  const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!customer || customer.role !== "customer" || customer.status === "deleted") {
    res.status(404).json({ message: "Customer not found" }); return;
  }
  const [duplicate] = await db.select().from(customerLoginsTable).where(eq(customerLoginsTable.username, username));
  if (duplicate && duplicate.userId !== id) {
    res.status(409).json({ message: "Username is already taken" }); return;
  }
  const password = supplied ?? `SB-${randomBytes(18).toString("base64url")}`;
  if (id.startsWith("invited:")) {
    let created: Awaited<ReturnType<typeof clerkClient.users.createUser>>;
    try {
      created = await clerkClient.users.createUser({ emailAddress: [customer.email], password, firstName: customer.name });
    } catch {
      res.status(409).json({ message: "This email already has a sign-in account or cannot be registered. Ask the customer to sign in with email first." });
      return;
    }
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${customer.email.toLowerCase()}, 0))`);
        const [invited] = await tx.select().from(usersTable).where(eq(usersTable.id, id));
        if (!invited || invited.email.toLowerCase() !== customer.email.toLowerCase()) throw new Error("Invitation changed");
        await tx.update(usersTable).set({ email: "" }).where(eq(usersTable.id, id));
        await tx.insert(usersTable).values({
          id: created.id, email: customer.email, name: customer.name, role: "customer",
          status: customer.status, statusReason: customer.statusReason,
          approvalStatus: customer.approvalStatus, approvalReason: customer.approvalReason,
          preferences: customer.preferences, createdAt: customer.createdAt,
        });
        await repointUserReferences(tx, id, created.id);
        await tx.delete(usersTable).where(eq(usersTable.id, id));
        await tx.insert(customerLoginsTable).values({ userId: created.id, username });
      });
    } catch {
      try { await clerkClient.users.deleteUser(created.id); } catch { req.log?.error({ reason: "customer_login_cleanup_failed" }, "Customer account cleanup needed"); }
      res.status(409).json({ message: "Could not create login. Username may already exist." });
      return;
    }
    res.json({ message: "Customer login created. Password shown once.", username, password });
    return;
  }
  try {
    await clerkClient.users.updateUser(id, { password });
  } catch {
    res.status(503).json({ message: "Could not set password with authentication provider" }); return;
  }
  try {
    await db.insert(customerLoginsTable).values({ userId: id, username }).onConflictDoUpdate({
      target: customerLoginsTable.userId, set: { username, updatedAt: new Date() },
    });
  } catch {
    // Clerk's password was updated; tell the admin to retry, rather than
    // reporting success for an unusable username.
    res.status(409).json({ message: "Password changed but username could not be saved. Retry with a different username." });
    return;
  }
  res.json({ message: "Customer login set. Password shown once.", username, password });
});

router.put("/admin/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  const body = UpdateCustomerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Enter a valid customer name and email address" });
    return;
  }
  const [customer] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!customer || customer.role !== "customer") {
    res.status(404).json({ message: "Customer not found" });
    return;
  }
  const email = body.data.email.trim().toLowerCase();
  const name = body.data.name.trim();
  if (!customer.id.startsWith("invited:") && email !== customer.email.toLowerCase()) {
    res.status(400).json({
      message: "The email for a registered customer is managed by their sign-in account",
    });
    return;
  }
  const [duplicate] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email} and ${usersTable.id} <> ${customer.id}`);
  if (duplicate) {
    res.status(409).json({ message: "A customer with this email already exists" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ name, email })
      .where(eq(usersTable.id, customer.id));
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      (("code" in err && (err as { code?: string }).code === "23505") ||
        ("cause" in err &&
          (err as { cause?: { code?: string } }).cause?.code === "23505"))
    ) {
      res.status(409).json({ message: "A customer with this email already exists" });
      return;
    }
    throw err;
  }
  res.json(UpdateCustomerResponse.parse({ message: "Customer updated" }));
});

router.post("/admin/customers/:id/status", async (req, res): Promise<void> => {
  const params = SetCustomerStatusParams.safeParse(req.params);
  const body = SetCustomerStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  if (user.role === "admin") {
    res.status(400).json({ message: "Cannot block an admin" });
    return;
  }
  await db
    .update(usersTable)
    .set({ status: body.data.status })
    .where(eq(usersTable.id, params.data.id));
  res.json(
    SetCustomerStatusResponse.parse({
      message: body.data.status === "blocked" ? "Customer blocked" : "Customer activated",
    }),
  );
});

const employeeToDto = (e: typeof employeesTable.$inferSelect) => ({
  id: e.id,
  employeeCode: e.employeeCode,
  name: e.name,
  email: e.email,
  phone: e.phone,
  designation: e.designation,
  department: e.department,
  joiningDate: e.joiningDate,
  exitDate: e.exitDate,
  ctcAnnual: e.ctcAnnual,
  insuranceDetails: e.insuranceDetails,
  notes: e.notes,
  createdAt: e.createdAt.toISOString(),
});

router.get("/admin/employees", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(employeesTable)
    .orderBy(employeesTable.employeeCode);
  res.json(ListEmployeesResponse.parse(rows.map(employeeToDto)));
});

router.post("/admin/employees", async (req, res): Promise<void> => {
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  // Employee codes are allocated with a retry loop: concurrent creates may
  // compute the same next code, in which case the unique constraint rejects
  // one insert and we recompute.
  let created: typeof employeesTable.$inferSelect | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const [{ maxCode }] = await db
      .select({
        maxCode: sql<number>`coalesce(max(substring(${employeesTable.employeeCode} from '^SB-([0-9]+)$')::int), 0)`,
      })
      .from(employeesTable);
    const employeeCode = `SB-${String((maxCode ?? 0) + 1).padStart(4, "0")}`;
    try {
      [created] = await db
        .insert(employeesTable)
        .values({
          employeeCode,
          name: body.data.name.trim(),
          email: body.data.email.trim().toLowerCase(),
          phone: body.data.phone ?? null,
          designation: body.data.designation ?? "",
          department: body.data.department ?? "",
          joiningDate: body.data.joiningDate ?? null,
          exitDate: body.data.exitDate ?? null,
          ctcAnnual: body.data.ctcAnnual ?? null,
          insuranceDetails: body.data.insuranceDetails ?? null,
          notes: body.data.notes ?? null,
        })
        .returning();
    } catch (err: any) {
      if (err?.code !== "23505") throw err;
    }
  }
  if (!created) {
    res.status(500).json({ message: "Could not allocate an employee code, try again" });
    return;
  }
  res.status(201).json(CreateEmployeeResponse.parse(employeeToDto(created)));
});

router.post("/admin/employees/:id/update", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(employeesTable)
    .set({
      name: body.data.name.trim(),
      email: body.data.email.trim().toLowerCase(),
      phone: body.data.phone ?? null,
      designation: body.data.designation ?? "",
      department: body.data.department ?? "",
      joiningDate: body.data.joiningDate ?? null,
      exitDate: body.data.exitDate ?? null,
      ctcAnnual: body.data.ctcAnnual ?? null,
      insuranceDetails: body.data.insuranceDetails ?? null,
      notes: body.data.notes ?? null,
    })
    .where(eq(employeesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }
  res.json(UpdateEmployeeResponse.parse(employeeToDto(updated)));
});

router.post("/admin/employees/:id/delete", async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [deleted] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }
  res.json(DeleteEmployeeResponse.parse({ message: "Employee record deleted" }));
});

router.get("/admin/reports", async (req, res): Promise<void> => {
  const parsed = GetAdminReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid period" });
    return;
  }
  const trunc = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[
    parsed.data.period
  ];
  const fmt = {
    daily: "YYYY-MM-DD",
    weekly: '"Week of" YYYY-MM-DD',
    monthly: "YYYY-MM",
    yearly: "YYYY",
  }[parsed.data.period];
  const rows = await db
    .select({
      period: sql<string>`to_char(date_trunc(${sql.raw(`'${trunc}'`)}, ${bookingsTable.createdAt}), ${sql.raw(`'${fmt}'`)})`,
      bookings: sql<number>`count(*) filter (where ${bookingsTable.status} in ('confirmed', 'completed', 'cancelled'))::int`,
      cancelled: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
      revenue: sql<number>`coalesce(sum(${bookingsTable.totalAmount}) filter (where ${bookingsTable.status} in ('confirmed', 'completed')), 0)::float`,
      roomsSold: sql<number>`coalesce(sum(${bookingsTable.roomsCount}) filter (where ${bookingsTable.status} in ('confirmed', 'completed')), 0)::int`,
    })
    .from(bookingsTable)
    .where(sql`${bookingsTable.status} not in ('pending_payment', 'expired')`)
    .groupBy(sql`date_trunc(${sql.raw(`'${trunc}'`)}, ${bookingsTable.createdAt})`)
    .orderBy(sql`date_trunc(${sql.raw(`'${trunc}'`)}, ${bookingsTable.createdAt}) desc`)
    .limit(60);
  res.json(GetAdminReportsResponse.parse(rows));
});

router.get("/admin/business-reports", async (req, res): Promise<void> => {
  const parsed = GetAdminBusinessReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid report filters" });
    return;
  }

  const { period, from, to, propertyId, bookingStatus, customer, department } = parsed.data;
  const customerQuery = customer?.trim().toLowerCase() ?? "";
  const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
  if (
    (fromDate && Number.isNaN(fromDate.getTime())) ||
    (toDate && Number.isNaN(toDate.getTime())) ||
    (fromDate && toDate && fromDate > toDate)
  ) {
    res.status(400).json({ message: "Invalid date range" });
    return;
  }

  const [properties, rooms, bookingJoins, customers, employees, refundJoins] = await Promise.all([
    db.select().from(propertiesTable).orderBy(propertiesTable.name),
    db.select().from(roomsTable),
    db
      .select()
      .from(bookingsTable)
      .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
      .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
      .orderBy(desc(bookingsTable.createdAt)),
    db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "customer"))
      .orderBy(desc(usersTable.createdAt)),
    db.select().from(employeesTable).orderBy(employeesTable.employeeCode),
    db
      .select()
      .from(bookingRefundsTable)
      .innerJoin(bookingsTable, eq(bookingRefundsTable.bookingId, bookingsTable.id))
      .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
      .orderBy(desc(bookingRefundsTable.refundDate), desc(bookingRefundsTable.id)),
  ]);

  const isInRange = (date: Date) =>
    (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  const filteredBookings = bookingJoins.filter((row) => {
    const booking = row.bookings;
    return (
      isInRange(booking.createdAt) &&
      (!propertyId || booking.propertyId === propertyId) &&
      booking.status !== "pending_payment" &&
      booking.status !== "expired" &&
      (!bookingStatus || booking.status === bookingStatus)
    );
  });
  const nonCancelled = filteredBookings.filter((row) => row.bookings.status !== "cancelled");

  const periodKey = (date: Date) => {
    const d = new Date(date);
    if (period === "daily") return d.toISOString().slice(0, 10);
    if (period === "yearly") return String(d.getUTCFullYear());
    if (period === "monthly") {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return `Week of ${d.toISOString().slice(0, 10)}`;
  };

  const revenueByPeriod = new Map<
    string,
    { period: string; bookings: number; cancelled: number; revenue: number; roomsSold: number }
  >();
  for (const row of filteredBookings) {
    const booking = row.bookings;
    const key = periodKey(booking.createdAt);
    const current = revenueByPeriod.get(key) ?? {
      period: key,
      bookings: 0,
      cancelled: 0,
      revenue: 0,
      roomsSold: 0,
    };
    current.bookings += 1;
    if (booking.status === "cancelled") current.cancelled += 1;
    else {
      current.revenue += booking.totalAmount;
      current.roomsSold += booking.roomsCount;
    }
    revenueByPeriod.set(key, current);
  }
  const revenueRows = [...revenueByPeriod.values()].sort((a, b) =>
    b.period.localeCompare(a.period),
  );

  const propertyRows = properties
    .filter((property) => !propertyId || property.id === propertyId)
    .map((property) => {
      const propertyRooms = rooms.filter((room) => room.propertyId === property.id);
      const propertyBookings = nonCancelled.filter(
        (row) => row.bookings.propertyId === property.id,
      );
      return {
        id: property.id,
        name: property.name,
        location: [property.area, property.city, property.state, property.country]
          .filter(Boolean)
          .join(", "),
        category: property.category,
        status: property.status,
        roomTypes: propertyRooms.length,
        roomInventory: propertyRooms.reduce((sum, room) => sum + room.totalRooms, 0),
        bookings: propertyBookings.length,
        roomsSold: propertyBookings.reduce(
          (sum, row) => sum + row.bookings.roomsCount,
          0,
        ),
        bookingValue: propertyBookings.reduce(
          (sum, row) => sum + row.bookings.totalAmount,
          0,
        ),
      };
    })
    .sort((a, b) => b.bookingValue - a.bookingValue || a.name.localeCompare(b.name));

  const customerRows = customers
    .map((user) => {
      const userBookings = nonCancelled.filter(
        (row) =>
          row.bookings.userId === user.id ||
          (!row.bookings.userId &&
            row.bookings.guestEmail.toLowerCase() === user.email.toLowerCase()),
      );
      const latest = userBookings[0]?.bookings.createdAt ?? null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        joinedAt: user.createdAt.toISOString(),
        bookings: userBookings.length,
        bookingValue: userBookings.reduce(
          (sum, row) => sum + row.bookings.totalAmount,
          0,
        ),
        lastBookingAt: latest?.toISOString() ?? null,
        includedByDate: isInRange(user.createdAt) || userBookings.length > 0,
      };
    })
    .filter(
      (row) =>
        row.includedByDate &&
        (!customerQuery ||
          row.name.toLowerCase().includes(customerQuery) ||
          row.email.toLowerCase().includes(customerQuery)),
    )
    .map(({ includedByDate: _includedByDate, ...row }) => row)
    .sort((a, b) => b.bookingValue - a.bookingValue || a.name.localeCompare(b.name));

  const bookingRows = filteredBookings.map((row) => ({
    id: row.bookings.id,
    bookingRef: row.bookings.bookingRef,
    bookedAt: row.bookings.createdAt.toISOString(),
    guestName: row.bookings.guestName,
    guestEmail: row.bookings.guestEmail,
    propertyId: row.properties.id,
    propertyName: row.properties.name,
    roomName: row.rooms.name,
    checkIn: row.bookings.checkIn,
    checkOut: row.bookings.checkOut,
    roomsCount: row.bookings.roomsCount,
    status: row.bookings.status,
    bookingValue: row.bookings.totalAmount,
  }));

  // Refund dates are the report's date dimension. Property, booking status,
  // and customer filters resolve through the linked booking.
  const filteredRefunds = refundJoins.filter((row) => {
    const refund = row.booking_refunds;
    const booking = row.bookings;
    const guestMatches =
      !customerQuery ||
      booking.guestName.toLowerCase().includes(customerQuery) ||
      booking.guestEmail.toLowerCase().includes(customerQuery);
    return (
      (!from || refund.refundDate >= from) &&
      (!to || refund.refundDate <= to) &&
      (!propertyId || booking.propertyId === propertyId) &&
      booking.status !== "pending_payment" &&
      booking.status !== "expired" &&
      (!bookingStatus || booking.status === bookingStatus) &&
      guestMatches
    );
  });
  const refundBreakdown = new Map<
    string,
    {
      period: string;
      refundedTransactions: number;
      bookingIds: Set<number>;
      refundedAmountMinor: number;
    }
  >();
  for (const row of filteredRefunds) {
    const key = periodKey(new Date(`${row.booking_refunds.refundDate}T00:00:00.000Z`));
    const current = refundBreakdown.get(key) ?? {
      period: key,
      refundedTransactions: 0,
      bookingIds: new Set<number>(),
      refundedAmountMinor: 0,
    };
    current.refundedTransactions += 1;
    current.bookingIds.add(row.booking_refunds.bookingId);
    current.refundedAmountMinor += row.booking_refunds.amountMinor;
    refundBreakdown.set(key, current);
  }
  const refundRows = filteredRefunds.map((row) => ({
    id: row.booking_refunds.id,
    refundDate: row.booking_refunds.refundDate,
    bookingId: row.booking_refunds.bookingId,
    bookingRef: row.bookings.bookingRef,
    invoiceId: row.booking_refunds.invoiceId,
    invoicePaymentId: row.booking_refunds.invoicePaymentId,
    propertyId: row.bookings.propertyId,
    propertyName: row.properties.name,
    guestName: row.bookings.guestName,
    guestEmail: row.bookings.guestEmail,
    bookingStatus: row.bookings.status,
    amountMinor: row.booking_refunds.amountMinor,
    method: row.booking_refunds.method,
    reason: row.booking_refunds.reason,
    reference: row.booking_refunds.reference,
    actorUserId: row.booking_refunds.actorUserId,
    createdAt: row.booking_refunds.createdAt.toISOString(),
  }));
  const refundedBookingIds = new Set(
    filteredRefunds.map((row) => row.booking_refunds.bookingId),
  );

  const normalizedDepartment = department?.trim().toLowerCase() ?? "";
  const employeeRows = employees
    .filter(
      (employee) =>
        !normalizedDepartment ||
        employee.department.toLowerCase() === normalizedDepartment,
    )
    .map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      designation: employee.designation,
      department: employee.department,
      joiningDate: employee.joiningDate,
      exitDate: employee.exitDate,
      status: employee.exitDate ? "exited" : "active",
      ctcAnnual: employee.ctcAnnual,
    }));
  const annualCtc = employeeRows.reduce(
    (sum, employee) => sum + (employee.ctcAnnual ?? 0),
    0,
  );

  res.json(
    GetAdminBusinessReportsResponse.parse({
      filters: {
        properties: properties.map(({ id, name }) => ({ id, name })),
        departments: [
          ...new Set(employees.map((employee) => employee.department).filter(Boolean)),
        ].sort(),
      },
      revenue: {
        summary: {
          bookingValue: nonCancelled.reduce(
            (sum, row) => sum + row.bookings.totalAmount,
            0,
          ),
          bookings: filteredBookings.length,
          cancelled: filteredBookings.length - nonCancelled.length,
          roomsSold: nonCancelled.reduce(
            (sum, row) => sum + row.bookings.roomsCount,
            0,
          ),
        },
        rows: revenueRows,
      },
      properties: {
        summary: {
          properties: propertyRows.length,
          activeProperties: propertyRows.filter((property) => property.status === "active")
            .length,
          bookings: propertyRows.reduce((sum, property) => sum + property.bookings, 0),
          bookingValue: propertyRows.reduce(
            (sum, property) => sum + property.bookingValue,
            0,
          ),
        },
        rows: propertyRows,
      },
      customers: {
        summary: {
          customers: customerRows.length,
          activeCustomers: customerRows.filter((row) => row.status === "active").length,
          bookings: customerRows.reduce((sum, row) => sum + row.bookings, 0),
          bookingValue: customerRows.reduce((sum, row) => sum + row.bookingValue, 0),
        },
        rows: customerRows,
      },
      bookings: {
        summary: {
          bookings: bookingRows.length,
          confirmed: bookingRows.filter((row) => row.status === "confirmed").length,
          completed: bookingRows.filter((row) => row.status === "completed").length,
          cancelled: bookingRows.filter((row) => row.status === "cancelled").length,
          bookingValue: nonCancelled.reduce(
            (sum, row) => sum + row.bookings.totalAmount,
            0,
          ),
        },
        rows: bookingRows,
      },
      employees: {
        summary: {
          employees: employeeRows.length,
          activeEmployees: employeeRows.filter((row) => row.status === "active").length,
          exitedEmployees: employeeRows.filter((row) => row.status === "exited").length,
          annualCtc,
          averageCtc: employeeRows.length ? annualCtc / employeeRows.length : 0,
        },
        rows: employeeRows,
      },
      refunds: {
        summary: {
          refundedTransactions: filteredRefunds.length,
          distinctBookings: refundedBookingIds.size,
          refundedAmountMinor: filteredRefunds.reduce(
            (sum, row) => sum + row.booking_refunds.amountMinor,
            0,
          ),
        },
        breakdown: [...refundBreakdown.values()]
          .map((row) => ({
            period: row.period,
            refundedTransactions: row.refundedTransactions,
            distinctBookings: row.bookingIds.size,
            refundedAmountMinor: row.refundedAmountMinor,
          }))
          .sort((a, b) => b.period.localeCompare(a.period)),
        rows: refundRows,
      },
    }),
  );
});

router.get("/admin/vendors", async (_req, res): Promise<void> => {
  const partners = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "partner"))
    .orderBy(usersTable.name);
  const props = await db
    .select({
      id: propertiesTable.id,
      name: propertiesTable.name,
      city: propertiesTable.city,
      category: propertiesTable.category,
      ownerId: propertiesTable.ownerId,
    })
    .from(propertiesTable)
    .orderBy(propertiesTable.name);

  const vendors = partners.map((v) => ({
    id: v.id,
    email: v.email,
    name: v.name,
    properties: props
      .filter((pr) => pr.ownerId === v.id)
      .map(({ ownerId: _o, ...rest }) => rest),
  }));
  const partnerIds = new Set(partners.map((v) => v.id));
  const unassignedProperties = props
    .filter((pr) => !pr.ownerId || !partnerIds.has(pr.ownerId))
    .map(({ ownerId: _o, ...rest }) => rest);

  res.json(ListAdminVendorsResponse.parse({ vendors, unassignedProperties }));
});

router.post("/admin/properties/:id/owner", async (req, res): Promise<void> => {
  const params = AssignPropertyOwnerParams.safeParse(req.params);
  const body = AssignPropertyOwnerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const ownerId = body.data.ownerId;
  if (ownerId) {
    const [owner] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, ownerId));
    if (!owner || owner.role !== "partner") {
      res.status(400).json({ message: "Owner must be an existing vendor (partner)" });
      return;
    }
  }
  const [updated] = await db
    .update(propertiesTable)
    .set({ ownerId: ownerId ?? null })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Property not found" });
    return;
  }
  res.json(
    AssignPropertyOwnerResponse.parse({
      message: ownerId ? "Property assigned to vendor" : "Property unassigned",
    }),
  );
});

router.post("/admin/users/invite", async (req, res): Promise<void> => {
  const body = InviteUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const email = body.data.email.toLowerCase();
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ message: "A user with this email already exists" });
    return;
  }
  let created;
  try {
    [created] = await db
      .insert(usersTable)
      .values({
        id: `invited:${randomUUID()}`,
        email,
        name: body.data.name ?? email.split("@")[0] ?? "",
        role: body.data.role,
        approvalStatus: body.data.role === "agent" ? "pending" : "approved",
      })
      .returning();
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      res.status(409).json({ message: "A user with this email already exists" });
      return;
    }
    throw err;
  }
  res.status(201).json(
    InviteUserResponse.parse({
      id: created!.id,
      email: created!.email,
      name: created!.name,
      role: created!.role,
    }),
  );
});

router.post("/admin/users/:id/delete", async (req, res): Promise<void> => {
  const params = DeleteAdminUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  const id = params.data.id;
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  // Remove the Clerk account so they can no longer sign in (invited: rows
  // have no Clerk account). If Clerk deletion fails for any reason other than
  // "already gone", abort — otherwise the user could still sign in.
  if (!id.startsWith("invited:")) {
    try {
      await clerkClient.users.deleteUser(id);
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status !== 404) {
        res.status(502).json({ message: "Could not delete the sign-in account. Please try again." });
        return;
      }
    }
  }
  // Remove dependent rows that should not outlive the account.
  await db.delete(vendorCredentialsTable).where(eq(vendorCredentialsTable.userId, id));
  await db.execute(sql`delete from partner_profiles where user_id = ${id}`);
  await db.execute(sql`delete from wishlist where user_id = ${id}`);
  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ message: "User deleted" });
  } catch {
    // The user still has bookings, reviews, or properties we must keep for
    // records. Deactivate the account instead and free up the email.
    await db
      .update(usersTable)
      .set({ status: "deleted", email: "", name: existing[0].name })
      .where(eq(usersTable.id, id));
    res.json({ message: "User deleted (booking history kept for records)" });
  }
});

router.post("/admin/users/:id/role", async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  const body = UpdateUserRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      role: body.data.role,
      approvalStatus: body.data.role === "agent" ? "pending" : "approved",
      approvalReason: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.json(
    UpdateUserRoleResponse.parse({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
    }),
  );
});

export default router;
