import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db,
  bookingsTable,
  propertiesTable,
  roomsTable,
  commissionLedgerTable,
  commissionLedgerEventsTable,
  razorpayPaymentsTable,
} from "@workspace/db";
import {
  ListEmployeeBookingsQueryParams,
  ListEmployeeBookingsResponse,
  EmployeeUpdateBookingStatusParams,
  EmployeeUpdateBookingStatusBody,
  EmployeeUpdateBookingStatusResponse,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { toBookingDto } from "../lib/mappers";
import { lockRoomAndBooking } from "../lib/advisoryLocks";

const router: IRouter = Router();

router.use("/employee", requireRole("employee", "admin"));

router.get("/employee/bookings", async (req, res): Promise<void> => {
  const query = ListEmployeeBookingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Invalid query" });
    return;
  }
  const conditions = [];
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
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));
  res.json(
    ListEmployeeBookingsResponse.parse(
      rows.map((r) => toBookingDto(r.booking, r.property, r.room)),
    ),
  );
});

router.post(
  "/employee/bookings/:id/status",
  async (req, res): Promise<void> => {
    const params = EmployeeUpdateBookingStatusParams.safeParse(req.params);
    const body = EmployeeUpdateBookingStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Invalid input" });
      return;
    }
    if ((body.data.status as string) === "confirmed") {
      res.status(409).json({
        reason: "pending_payment_requires_capture",
        message: "A pending payment booking can only be confirmed after Razorpay reports a captured payment.",
      });
      return;
    }
    if (!["completed", "cancelled"].includes(body.data.status)) {
      res.status(400).json({ message: "Employees can only complete or cancel confirmed bookings" });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      // Serialize terminal transitions with checkout/reconciliation.
      const [lockRow] = await tx
        .select({ roomId: bookingsTable.roomId })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, params.data.id));
      if (lockRow) await lockRoomAndBooking(tx, lockRow.roomId, params.data.id);
      const [booking] = await tx
        .update(bookingsTable)
        .set({ status: body.data.status })
        .where(and(
          eq(bookingsTable.id, params.data.id),
          eq(bookingsTable.status, "confirmed"),
        ))
        .returning();
      if (!booking) return null;
      if (body.data.status === "cancelled") {
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

      const nextLedgerStatus = body.data.status === "completed" ? "available" : "voided";
      const eligibleStatus = body.data.status === "completed"
        ? eq(commissionLedgerTable.status, "pending")
        : sql`${commissionLedgerTable.status} <> 'paid'`;
      const ledgerRows = await tx
        .select()
        .from(commissionLedgerTable)
        .where(and(eq(commissionLedgerTable.bookingId, booking.id), eligibleStatus));
      for (const ledger of ledgerRows) {
        await tx.insert(commissionLedgerEventsTable).values({
          ledgerId: ledger.id,
          actorUserId: req.currentUser!.id,
          fromStatus: ledger.status,
          toStatus: nextLedgerStatus,
          reason: `employee_booking_${body.data.status}`,
        });
      }
      if (ledgerRows.length > 0) {
        await tx
          .update(commissionLedgerTable)
          .set({ status: nextLedgerStatus })
          .where(and(eq(commissionLedgerTable.bookingId, booking.id), eligibleStatus));
      }
      return booking;
    });
    if (!updated) {
      res.status(409).json({ message: "Booking not found or is no longer confirmed" });
      return;
    }
    const [property] = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.id, updated.propertyId));
    const [room] = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, updated.roomId));
    if (!property || !room) {
      res.status(500).json({ message: "Booking references missing data" });
      return;
    }
    res.json(
      EmployeeUpdateBookingStatusResponse.parse(
        toBookingDto(updated, property, room),
      ),
    );
  },
);

export default router;
