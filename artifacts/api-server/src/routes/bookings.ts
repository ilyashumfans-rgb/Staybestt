import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db, bookingsTable, propertiesTable, roomsTable, couponRedemptionsTable,
  commissionLedgerTable, commissionLedgerEventsTable,
  razorpayPaymentsTable,
  razorpayMobileSessionsTable,
} from "@workspace/db";
import {
  CreateBookingBody,
  CreateBookingResponse,
  ListBookingsQueryParams,
  ListBookingsResponse,
  GetBookingByIdParams,
  GetBookingByIdResponse,
  CancelBookingParams,
  CancelBookingBody,
  CancelBookingResponse,
  ValidateCouponBody,
  ValidateCouponResponse,
} from "@workspace/api-zod";
import { bookedRoomsCount } from "../lib/availability";
import { stayPriceForRoom } from "../lib/pricing";
import { checkCoupon } from "../lib/coupons";
import { resolveUser } from "../lib/auth";
import { toBookingDto, nightsBetween, isValidDateString } from "../lib/mappers";
import { evaluateCancellation } from "../lib/cancellationPolicy";
import { loadPaymentSummary } from "../lib/razorpay";
import {
  getRazorpayConfig,
  getRazorpayReadiness,
  getRazorpayReadinessWithProbe,
} from "../lib/razorpayProvider";
import { lockBooking, lockRoom, lockRoomAndBooking } from "../lib/advisoryLocks";

const router: IRouter = Router();

async function authoritativeReadiness() {
  const syncReadiness = getRazorpayReadiness();
  const probe = getRazorpayReadinessWithProbe as unknown as
    | (() => Promise<typeof syncReadiness>)
    | undefined;
  return probe ? await probe() : syncReadiness;
}

class IdempotencyConflictError extends Error {
  constructor() {
    super("This Idempotency-Key was already used for different booking details");
    this.name = "IdempotencyConflictError";
  }
}

function bookingRequestFingerprint(data: {
  propertyId: number;
  roomId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  adults?: number;
  children?: number;
  roomsCount: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  specialRequests?: string | null;
  couponCode?: string | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      data.propertyId,
      data.roomId,
      data.checkIn,
      data.checkOut,
      data.guests,
      data.adults ?? null,
      data.children ?? null,
      data.roomsCount,
      data.guestName,
      data.guestEmail.trim().toLowerCase(),
      data.guestPhone ?? null,
      data.specialRequests ?? null,
      data.couponCode?.trim().toUpperCase() ?? null,
    ]))
    .digest("hex");
}

function createBookingResponseDto(
  booking: typeof bookingsTable.$inferSelect,
  property: typeof propertiesTable.$inferSelect,
  room: typeof roomsTable.$inferSelect,
  paymentAllowed: boolean,
) {
  return {
    ...toBookingDto(booking, property, room),
    // The create flow already performed the authoritative readiness probe.
    // Use that result instead of the synchronous cache so a newly-created hold
    // accurately tells the client whether checkout can proceed.
    paymentAllowed,
  };
}

async function sweepExpiredPaymentHolds(): Promise<void> {
  // Keep expired holds for audit, but release them explicitly whenever the
  // booking surface is read. Availability itself also ignores them lazily.
  const rows = await db
    .select({ id: bookingsTable.id, roomId: bookingsTable.roomId })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "pending_payment"),
      sql`${bookingsTable.paymentHoldExpiresAt} <= now()`,
    ));
  for (const row of rows) {
    await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, row.roomId, row.id);
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, row.id),
          eq(bookingsTable.status, "pending_payment"),
          sql`${bookingsTable.paymentHoldExpiresAt} <= now()`,
        ));
    });
  }
}

router.post("/coupons/validate", async (req, res): Promise<void> => {
  const parsed = ValidateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const user = await resolveUser(req);
  const check = await checkCoupon(parsed.data.code, parsed.data.amount, user);
  if (!check.ok) {
    res.status(400).json({ message: check.message });
    return;
  }
  res.json(
    ValidateCouponResponse.parse({
      code: check.coupon.code,
      type: check.coupon.type,
      value: check.coupon.value,
      discountAmount: check.discountAmount,
    }),
  );
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const authUser = await resolveUser(req);
  // New reservations always create a payment hold. Anonymous guest bookings
  // cannot complete the required owner-scoped Razorpay checkout.
  if (!authUser) {
    res.status(401).json({
      message: "Sign in is required to hold a room and complete online payment.",
    });
    return;
  }
  const rawIdempotencyKey = req.header("Idempotency-Key")?.trim() ?? "";
  if (rawIdempotencyKey.length > 255) {
    res.status(400).json({ message: "Idempotency-Key must be at most 255 characters" });
    return;
  }
  const idempotencyKey = rawIdempotencyKey || null;
  const idempotencyFingerprint = bookingRequestFingerprint(data);
  if (authUser && authUser.status === "blocked") {
    res.status(403).json({ message: "Your account is blocked. Contact support." });
    return;
  }
  if (authUser.status !== "active") {
    res.status(403).json({ message: "Your account is not active. Contact support before booking." });
    return;
  }
  // Attribution is only valid for fully enabled agents. Customers and partners
  // retain their existing booking behavior because they are never attributed.
  if (
    authUser?.role === "agent" &&
    (authUser.status !== "active" || authUser.approvalStatus !== "approved")
  ) {
    res.status(403).json({ message: "Your agent account is not approved or is blocked." });
    return;
  }
  const razorpayConfig = getRazorpayConfig();
  const readiness = await authoritativeReadiness();
  const paymentAllowed = Object.prototype.hasOwnProperty.call(readiness, "paymentAllowed")
    ? readiness.paymentAllowed
    : readiness.configured &&
      !(process.env.NODE_ENV !== "production" && readiness.mode === "live");
  if (!razorpayConfig || !paymentAllowed) {
    res.status(503).json({
      message:
        process.env.NODE_ENV === "production"
          ? "Online payments are not ready yet. Please try again after Razorpay test/live credentials and webhook settings are configured."
          : "Online bookings require Razorpay test keys in development. Configure test credentials before creating a booking.",
    });
    return;
  }
  if (razorpayConfig.mode === "live" && process.env.NODE_ENV !== "production") {
    res.status(503).json({
      message:
        "Live Razorpay charges are disabled in development. Configure Razorpay test keys before creating a booking.",
    });
    return;
  }

  if (idempotencyKey) {
    const existing = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(bookingsTable)
        .where(and(
          eq(bookingsTable.userId, authUser.id),
          eq(bookingsTable.idempotencyKey, idempotencyKey),
        ));
      if (!row) return null;
      await lockRoomAndBooking(tx, row.roomId, row.id);
      const [locked] = await tx
        .select()
        .from(bookingsTable)
        .where(eq(bookingsTable.id, row.id));
      return locked ?? row;
    });
    if (existing) {
      if (existing.idempotencyFingerprint !== idempotencyFingerprint) {
        res.status(409).json({
          reason: "idempotency_key_conflict",
          message: new IdempotencyConflictError().message,
        });
        return;
      }
      const [existingProperty] = await db
        .select()
        .from(propertiesTable)
        .where(eq(propertiesTable.id, existing.propertyId));
      const [existingRoom] = await db
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.id, existing.roomId));
      if (!existingProperty || !existingRoom) {
        res.status(500).json({ message: "Booking references missing data" });
        return;
      }
      res.status(201).json(
        CreateBookingResponse.parse(
          createBookingResponseDto(existing, existingProperty, existingRoom, paymentAllowed),
        ),
      );
      return;
    }
  }

  if (!isValidDateString(data.checkIn) || !isValidDateString(data.checkOut)) {
    res.status(400).json({ message: "Dates must be in YYYY-MM-DD format" });
    return;
  }
  const nights = nightsBetween(data.checkIn, data.checkOut);
  if (nights <= 0) {
    res.status(400).json({ message: "Check-out must be after check-in" });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, data.propertyId));
  if (!property || property.status !== "active") {
    res.status(400).json({ message: "Property not found" });
    return;
  }

  const [room] = await db
    .select()
    .from(roomsTable)
    .where(
      and(
        eq(roomsTable.id, data.roomId),
        eq(roomsTable.propertyId, data.propertyId),
      ),
    );
  if (!room) {
    res.status(400).json({ message: "Room not found for this property" });
    return;
  }
  if (idempotencyKey) {
    const existing = await db.transaction(async (tx) => {
      await lockRoom(tx, room.id);
      const [row] = await tx
        .select()
        .from(bookingsTable)
        .where(and(
          eq(bookingsTable.userId, authUser.id),
          eq(bookingsTable.idempotencyKey, idempotencyKey),
        ));
      if (row) await lockBooking(tx, row.id);
      return row ?? null;
    });
    if (existing) {
      if (existing.idempotencyFingerprint !== idempotencyFingerprint) {
        res.status(409).json({
          reason: "idempotency_key_conflict",
          message: new IdempotencyConflictError().message,
        });
        return;
      }
      const [existingProperty] = await db
        .select()
        .from(propertiesTable)
        .where(eq(propertiesTable.id, existing.propertyId));
      const [existingRoom] = await db
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.id, existing.roomId));
      if (!existingProperty || !existingRoom) {
        res.status(500).json({ message: "Booking references missing data" });
        return;
      }
      res.status(201).json(
        CreateBookingResponse.parse(
          createBookingResponseDto(existing, existingProperty, existingRoom, paymentAllowed),
        ),
      );
      return;
    }
  }
  if (room.isAvailable === false) {
    res.status(400).json({ message: "This room is currently unavailable for booking" });
    return;
  }
  const adults = data.adults ?? data.guests;
  const children = data.children ?? 0;
  const totalGuests = adults + children;
  if (adults < 1 || children < 0 || totalGuests !== data.guests) {
    res.status(400).json({ message: "Guest counts are invalid" });
    return;
  }
  if (totalGuests > room.maxGuests * data.roomsCount) {
    res.status(400).json({
      message: `This selection allows up to ${room.maxGuests * data.roomsCount} guests`,
    });
    return;
  }

  // Seasonal pricing: price each night individually (shared helper, also
  // used by /availability so the customer sees the same total).
  const stayTotalPerRoom = await stayPriceForRoom(room.id, room.pricePerNight, data.checkIn, nights);

  // Re-validate the coupon server-side; never trust a client-computed discount.
  const subtotal = stayTotalPerRoom * data.roomsCount;
  let couponCode: string | null = null;
  let discountAmount = 0;
  if (data.couponCode && data.couponCode.trim()) {
    const check = await checkCoupon(data.couponCode, subtotal, authUser);
    if (!check.ok) {
      res.status(400).json({ message: check.message });
      return;
    }
    couponCode = check.coupon.code;
    discountAmount = check.discountAmount;
  }

  // Server-side availability validation to prevent double booking
  let created: typeof bookingsTable.$inferSelect | null;
  try {
    created = await db.transaction(async (tx) => {
      // Lock existing bookings for this room to serialize concurrent booking attempts
      await lockRoom(tx, room.id);
      if (idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(bookingsTable)
          .where(and(
            eq(bookingsTable.userId, authUser.id),
            eq(bookingsTable.idempotencyKey, idempotencyKey),
          ));
        if (existing) {
          await lockBooking(tx, existing.id);
          const [lockedExisting] = await tx
            .select()
            .from(bookingsTable)
            .where(eq(bookingsTable.id, existing.id));
          const currentExisting = lockedExisting ?? existing;
          if (currentExisting.idempotencyFingerprint !== idempotencyFingerprint) {
            throw new IdempotencyConflictError();
          }
          return currentExisting;
        }
      }
      const booked = await bookedRoomsCount(room.id, data.checkIn, data.checkOut, tx);
      const available = room.totalRooms - booked;
      if (available < data.roomsCount) {
        return null;
      }
      const [booking] = await tx
        .insert(bookingsTable)
        .values({
          bookingRef: null,
          idempotencyKey,
          idempotencyFingerprint,
          userId: authUser.id,
          // Never accept attribution from the request body: only the authenticated
          // agent who created this booking can be attributed.
          agentId: authUser?.role === "agent" ? authUser.id : null,
          propertyId: data.propertyId,
          roomId: data.roomId,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          guests: totalGuests,
          adults,
          children,
          roomsCount: data.roomsCount,
          guestName: data.guestName,
          guestEmail: (authUser.email ?? data.guestEmail).toLowerCase(),
          guestPhone: data.guestPhone ?? null,
          specialRequests: data.specialRequests ?? null,
          status: "pending_payment",
          totalAmount: subtotal - discountAmount,
          couponCode,
          discountAmount: discountAmount > 0 ? discountAmount : null,
          paymentHoldExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .onConflictDoNothing({
          target: [bookingsTable.userId, bookingsTable.idempotencyKey],
        })
        .returning();
      if (!booking && idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(bookingsTable)
          .where(and(
            eq(bookingsTable.userId, authUser.id),
            eq(bookingsTable.idempotencyKey, idempotencyKey),
          ));
        if (existing) {
          await lockBooking(tx, existing.id);
          const [lockedExisting] = await tx
            .select()
            .from(bookingsTable)
            .where(eq(bookingsTable.id, existing.id));
          const currentExisting = lockedExisting ?? existing;
          if (currentExisting.idempotencyFingerprint !== idempotencyFingerprint) {
            throw new IdempotencyConflictError();
          }
          return currentExisting;
        }
        return null;
      }
      return booking;
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({
        reason: "idempotency_key_conflict",
        message: error.message,
      });
      return;
    }
    throw error;
  }

  if (!created) {
    res.status(409).json({
      message: "Not enough rooms available for the selected dates",
    });
    return;
  }

  req.log.info({ bookingId: created.id }, "Payment-hold booking created");
  res
    .status(201)
    .json(CreateBookingResponse.parse(createBookingResponseDto(created, property, room, paymentAllowed)));
});

router.get("/bookings", async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const authUser = await resolveUser(req);
  await sweepExpiredPaymentHolds();
  // Booking history is never discoverable by email alone. Agents have their
  // own attributed-bookings endpoint and customers see only their userId rows.
  const filter = authUser ? eq(bookingsTable.userId, authUser.id) : null;
  if (!filter) {
    res.status(401).json({ message: "Sign in to view bookings" });
    return;
  }

  const rows = await db
    .select()
    .from(bookingsTable)
    .innerJoin(
      propertiesTable,
      eq(bookingsTable.propertyId, propertiesTable.id),
    )
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(filter)
    .orderBy(desc(bookingsTable.createdAt));

  res.json(
      ListBookingsResponse.parse(
        await Promise.all(
          rows.map(async (r) =>
            toBookingDto(
              r.bookings,
              r.properties,
              r.rooms,
              null,
              await loadPaymentSummary(r.bookings.id),
            ),
          ),
        ),
      ),
  );
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const params = GetBookingByIdParams.safeParse({ ...req.params, ...req.query });
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  await sweepExpiredPaymentHolds();

  const [row] = await db
    .select()
    .from(bookingsTable)
    .innerJoin(
      propertiesTable,
      eq(bookingsTable.propertyId, propertiesTable.id),
    )
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }

  // Ownership check: signed-in owner (by userId or email), or a guest
  // presenting the booking's email via ?email. Never expose PII to others.
  const authUser = await resolveUser(req);
  const queryEmail = typeof req.query.email === "string" ? req.query.email.toLowerCase() : null;
  const queryRef = typeof req.query.bookingRef === "string" ? req.query.bookingRef.trim().toUpperCase() : null;
  const isOwner =
    (authUser &&
      (row.bookings.userId === authUser.id ||
        row.bookings.guestEmail === authUser.email.toLowerCase())) ||
    (queryEmail !== null &&
      queryRef !== null &&
      row.bookings.bookingRef !== null &&
      row.bookings.guestEmail === queryEmail &&
      row.bookings.bookingRef.toUpperCase() === queryRef);
  if (!isOwner) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }

  res.json(
    GetBookingByIdResponse.parse(
      toBookingDto(
        row.bookings,
        row.properties,
        row.rooms,
        null,
        await loadPaymentSummary(row.bookings.id),
      ),
    ),
  );
});

router.post("/bookings/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = CancelBookingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(bookingsTable)
    .innerJoin(
      propertiesTable,
      eq(bookingsTable.propertyId, propertiesTable.id),
    )
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, params.data.id));

  if (!row) {
    res.status(400).json({ message: "Booking not found" });
    return;
  }
  const cancelAuthUser = await resolveUser(req);
  const isAuthOwner =
    !!cancelAuthUser &&
    (row.bookings.userId === cancelAuthUser.id ||
      row.bookings.guestEmail === cancelAuthUser.email.toLowerCase());
  // Guests must present BOTH the booking email and the booking reference —
  // email alone is too easy to guess for an irreversible action.
  const isGuestOwner =
    row.bookings.guestEmail === body.data.email.toLowerCase() &&
    !!body.data.bookingRef &&
    !!row.bookings.bookingRef &&
    body.data.bookingRef.trim().toUpperCase() ===
      row.bookings.bookingRef.toUpperCase();
  if (!isAuthOwner && !isGuestOwner) {
    res.status(400).json({
      message: "Booking email and reference do not match this booking",
    });
    return;
  }
  if (!["pending_payment", "confirmed"].includes(row.bookings.status)) {
    res.status(400).json({ message: "Only confirmed bookings can be cancelled" });
    return;
  }
  if (
    row.bookings.status === "pending_payment" &&
    (!row.bookings.paymentHoldExpiresAt ||
      row.bookings.paymentHoldExpiresAt.getTime() <= Date.now())
  ) {
    await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, row.bookings.roomId, params.data.id);
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, params.data.id),
          eq(bookingsTable.status, "pending_payment"),
        ));
    });
    res.status(409).json({
      reason: "payment_hold_expired",
      message: "This payment hold expired and is no longer cancellable.",
    });
    return;
  }
  // An unpaid hold is released immediately and has no refund or cancellation
  // policy because no money has been captured yet.
  if (row.bookings.status === "pending_payment") {
    const [updatedHold] = await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, row.bookings.roomId, params.data.id);
      return tx
        .update(bookingsTable)
        .set({ status: "cancelled", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, params.data.id),
          eq(bookingsTable.status, "pending_payment"),
        ))
        .returning();
    });
    if (!updatedHold) {
      res.status(409).json({ message: "Booking status changed and can no longer be cancelled" });
      return;
    }
    await db
      .update(razorpayMobileSessionsTable)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(razorpayMobileSessionsTable.bookingId, updatedHold.id));
    res.json(
      CancelBookingResponse.parse(
        toBookingDto(updatedHold, row.properties, row.rooms, null, await loadPaymentSummary(updatedHold.id)),
      ),
    );
    return;
  }
  // Evaluate the cancellation policy in the property's local timezone.
  const check = evaluateCancellation({
    checkIn: row.bookings.checkIn,
    freeCancellation: row.properties.freeCancellation,
    timezone: row.properties.timezone,
  });
  if (!check.allowed) {
    res.status(400).json({
      message:
        check.reason === "past_check_in"
          ? "Bookings can only be cancelled before check-in"
          : "This hotel's policy allows cancellation only up to 48 hours before check-in",
    });
    return;
  }

  const [updated] = await db.transaction(async (tx) => {
    // Share the booking advisory lock with checkout/reconciliation and all
    // other terminal transitions. A capture racing cancellation must observe
    // one deterministic terminal state.
    await lockRoomAndBooking(tx, row.bookings.roomId, params.data.id);
    const [booking] = await tx
      .update(bookingsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(bookingsTable.id, params.data.id),
        eq(bookingsTable.status, "confirmed"),
      ))
      .returning();
    if (!booking) return [booking];
    // Cancellation never triggers a provider refund, but any money already
    // captured now requires an operator-managed/manual refund.
    await tx
      .update(razorpayPaymentsTable)
      .set({ refundRequired: true, updatedAt: new Date() })
      .where(
        and(
          eq(razorpayPaymentsTable.bookingId, booking.id),
          eq(razorpayPaymentsTable.status, "captured"),
        ),
      );
    await tx
      .update(razorpayMobileSessionsTable)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(razorpayMobileSessionsTable.bookingId, booking.id));
    await tx.update(couponRedemptionsTable).set({ status: "reversed" })
      .where(and(eq(couponRedemptionsTable.bookingId, booking.id), eq(couponRedemptionsTable.status, "applied")));
    // Lock and transition each eligible allocation so the recorded prior
    // status always matches the row that was actually changed.
    const entries = await tx
      .select()
      .from(commissionLedgerTable)
      .where(eq(commissionLedgerTable.bookingId, params.data.id));
    const voidedEntries: { id: number; fromStatus: string }[] = [];
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
      if (voided) voidedEntries.push({ id: voided.id, fromStatus: entry.status });
    }
    if (voidedEntries.length) await tx.insert(commissionLedgerEventsTable).values(
      voidedEntries.map((entry) => ({
        ledgerId: entry.id,
        actorUserId: cancelAuthUser?.id ?? null,
        fromStatus: entry.fromStatus,
        toStatus: "voided",
        reason: "customer_cancelled",
      })),
    );
    return [booking];
  });
  if (!updated) {
    res.status(409).json({ message: "Booking status changed and can no longer be cancelled" });
    return;
  }

  req.log.info({ bookingRef: updated.bookingRef }, "Booking cancelled");
  res.json(
    CancelBookingResponse.parse(
      toBookingDto(
        updated,
        row.properties,
        row.rooms,
        null,
        await loadPaymentSummary(updated.id),
      ),
    ),
  );
});

export default router;
