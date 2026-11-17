import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  billingSettingsTable,
  bookingEmailsTable,
  bookingRefundsTable,
  bookingsTable,
  db,
  invoiceLineItemsTable,
  invoicePaymentsTable,
  invoicesTable,
  propertiesTable,
  razorpayOrdersTable,
  razorpayPaymentsTable,
  roomsTable,
} from "@workspace/db";
import {
  CreateAdminInvoiceBody,
  CreateAdminInvoiceResponse,
  GetAdminInvoiceParams,
  GetAdminInvoiceResponse,
  GetBillingSettingsResponse,
  GetInvoiceEmailStatusParams,
  GetInvoiceEmailStatusResponse,
  ListAdminInvoicesQueryParams,
  ListAdminInvoicesResponse,
  RecordInvoicePaymentBody,
  RecordInvoicePaymentParams,
  RecordInvoicePaymentResponse,
  UpdateBillingSettingsBody,
  UpdateBillingSettingsResponse,
} from "@workspace/api-zod";
import {
  computeInvoiceTotals,
  currentBusinessDate,
  invoiceStatus,
  isInvoiceDate,
} from "../lib/billing";
import {
  normalizeBillingSettingsBody,
  normalizeInvoiceBody,
  normalizePaymentBody,
} from "../lib/invoiceInput";
import { generateInvoicePdf, readCompanyLogo } from "../lib/invoicePdf";
import {
  invoiceBookingFromSnapshot,
  type InvoiceBookingSnapshot,
} from "../lib/invoiceSnapshot";
import { mapBookingRefund } from "../lib/refunds";
import { requireAdmin } from "./admin";
import { resolveUser } from "../lib/auth";
import { lockRoomAndBooking, lockInvoice } from "../lib/advisoryLocks";

const router: IRouter = Router();

router.use("/admin/billing-settings", requireAdmin);
router.use("/admin/invoices", requireAdmin);

router.get("/bookings/:id/invoice", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid booking" });
    return;
  }
  const user = await resolveUser(req);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  const email = typeof req.query.email === "string" ? req.query.email.toLowerCase() : null;
  const ref = typeof req.query.bookingRef === "string" ? req.query.bookingRef.trim().toUpperCase() : null;
  const owner = booking && (
    (user && (booking.userId === user.id || booking.guestEmail === user.email.toLowerCase())) ||
    (email && ref && booking.guestEmail === email && booking.bookingRef?.toUpperCase() === ref)
  );
  if (!owner) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const [record] = await db.select({ id: invoicesTable.id }).from(invoicesTable)
    .where(eq(invoicesTable.bookingId, id)).orderBy(desc(invoicesTable.id)).limit(1);
  const invoice = record ? await loadInvoice(record.id) : null;
  if (!invoice) {
    res.status(404).json({ message: "Your invoice has not been issued yet. Please contact support." });
    return;
  }
  const [settings] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
  if (!settings) {
    res.status(409).json({ message: "Billing settings are not configured. Please contact support." });
    return;
  }
  const pdf = await generateInvoicePdf({ settings, invoice });
  res.type("application/pdf").set("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`).send(pdf);
});

type BookingSnapshot = InvoiceBookingSnapshot & { status: string };

type LoadedInvoice = {
  id: number;
  invoiceNumber: string;
  bookingId: number | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  issueDate: string;
  dueDate: string;
  currency: "INR";
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  grossPaidMinor: number;
  refundedMinor: number;
  netPaidMinor: number;
  dueMinor: number;
  status: "unpaid" | "partial" | "paid" | "overdue";
  lines: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    taxRateBps: number;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
  }>;
  payments: Array<{
    id: number;
    amountMinor: number;
    paymentDate: string;
    method: "cash" | "upi" | "bank" | "card" | "other" | "razorpay";
    reference: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: number;
    bookingId: number;
    invoiceId: number;
    invoicePaymentId: number;
    amountMinor: number;
    refundDate: string;
    reason: string;
    reference: string | null;
    method: "cash" | "upi" | "bank" | "card" | "other";
    actorUserId: string | null;
    idempotencyKey: string;
    createdAt: string;
  }>;
  booking: InvoiceBookingSnapshot | null;
  createdAt: string;
};

function toIso(value: Date): string {
  return value.toISOString();
}

function makeInvoiceNumber(): string {
  return `SB-INV-${new Date().getUTCFullYear()}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase()}`;
}

async function findBookingSnapshot(bookingId: number): Promise<BookingSnapshot | null> {
  const [row] = await db
    .select({
      id: bookingsTable.id,
      bookingRef: bookingsTable.bookingRef,
      status: bookingsTable.status,
      customerName: bookingsTable.guestName,
      customerEmail: bookingsTable.guestEmail,
      customerPhone: bookingsTable.guestPhone,
      propertyName: propertiesTable.name,
      roomName: roomsTable.name,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      totalAmount: bookingsTable.totalAmount,
    })
    .from(bookingsTable)
    .innerJoin(propertiesTable, eq(bookingsTable.propertyId, propertiesTable.id))
    .leftJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .where(eq(bookingsTable.id, bookingId));
  if (!row) return null;
  return {
    id: row.id,
    bookingRef: row.bookingRef,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    propertyName: row.propertyName,
    roomName: row.roomName ?? "Day Out",
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    totalMinor: Math.round(row.totalAmount * 100),
  };
}

async function loadInvoice(invoiceId: number): Promise<LoadedInvoice | null> {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return null;

  const [lines, payments, refunds] = await Promise.all([
    db
      .select()
      .from(invoiceLineItemsTable)
      .where(eq(invoiceLineItemsTable.invoiceId, invoice.id))
      .orderBy(invoiceLineItemsTable.id),
    db
      .select()
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoice.id))
      .orderBy(desc(invoicePaymentsTable.paymentDate), desc(invoicePaymentsTable.id)),
    db
      .select()
      .from(bookingRefundsTable)
      .where(eq(bookingRefundsTable.invoiceId, invoice.id))
      .orderBy(desc(bookingRefundsTable.refundDate), desc(bookingRefundsTable.id)),
  ]);
  const paidMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const refundedMinor = refunds.reduce((sum, refund) => sum + refund.amountMinor, 0);
  const booking = invoiceBookingFromSnapshot(invoice);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    bookingId: invoice.bookingId,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    customerAddress: invoice.customerAddress,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: "INR",
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    paidMinor,
    grossPaidMinor: paidMinor,
    refundedMinor,
    netPaidMinor: Math.max(0, paidMinor - refundedMinor),
    dueMinor: Math.max(0, invoice.totalMinor - paidMinor),
    status: invoiceStatus(invoice.totalMinor, paidMinor, invoice.dueDate, currentBusinessDate()),
    lines: lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRateBps: line.taxRateBps,
      subtotalMinor: line.totalMinor - line.taxMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      amountMinor: payment.amountMinor,
      paymentDate: payment.paymentDate,
      method: payment.method as "cash" | "upi" | "bank" | "card" | "other" | "razorpay",
      reference: payment.reference,
      createdAt: toIso(payment.createdAt),
    })),
    refunds: refunds.map(mapBookingRefund),
    booking,
    createdAt: toIso(invoice.createdAt),
  };
}

router.get("/admin/billing-settings", async (_req, res): Promise<void> => {
  const [settings] = await db
    .select()
    .from(billingSettingsTable)
    .where(eq(billingSettingsTable.id, 1));
  if (!settings) {
    res.status(404).json({ message: "Billing settings are not configured" });
    return;
  }
  res.json(
    GetBillingSettingsResponse.parse({
      id: settings.id,
      businessName: settings.businessName,
      address: settings.address,
      taxRegistration: settings.taxRegistration,
      gstRateBps: settings.gstRateBps,
      gstMode: settings.gstMode,
      email: settings.email,
      phone: settings.phone,
      logoUrl: settings.logoUrl,
      updatedAt: toIso(settings.updatedAt),
    }),
  );
});

router.put("/admin/billing-settings", async (req, res): Promise<void> => {
  const parsed = UpdateBillingSettingsBody.safeParse(normalizeBillingSettingsBody(req.body));
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  if (parsed.data.logoUrl) {
    try { await readCompanyLogo(parsed.data.logoUrl); }
    catch { res.status(400).json({ message: "Could not read the company logo. Upload a valid PNG or JPG image again." }); return; }
  }
  const [settings] = await db
    .insert(billingSettingsTable)
    .values({
      id: 1,
      businessName: parsed.data.businessName.trim(),
      address: parsed.data.address.trim(),
      taxRegistration: parsed.data.taxRegistration?.trim() || null,
      gstRateBps: parsed.data.gstRateBps ?? 0,
      gstMode: parsed.data.gstMode ?? "exclusive",
      email: parsed.data.email?.trim() || null,
      phone: parsed.data.phone?.trim() || null,
      logoUrl: parsed.data.logoUrl || null,
    })
    .onConflictDoUpdate({
      target: billingSettingsTable.id,
      set: {
        businessName: parsed.data.businessName.trim(),
        address: parsed.data.address.trim(),
        taxRegistration: parsed.data.taxRegistration?.trim() || null,
        ...(parsed.data.gstRateBps !== undefined ? { gstRateBps: parsed.data.gstRateBps } : {}),
        ...(parsed.data.gstMode !== undefined ? { gstMode: parsed.data.gstMode } : {}),
        email: parsed.data.email === undefined ? undefined : parsed.data.email?.trim() || null,
        phone: parsed.data.phone === undefined ? undefined : parsed.data.phone?.trim() || null,
        logoUrl: parsed.data.logoUrl,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(
    UpdateBillingSettingsResponse.parse({
      id: settings!.id,
      businessName: settings!.businessName,
      address: settings!.address,
      taxRegistration: settings!.taxRegistration,
      gstRateBps: settings!.gstRateBps,
      gstMode: settings!.gstMode,
      email: settings!.email,
      phone: settings!.phone,
      logoUrl: settings!.logoUrl,
      updatedAt: toIso(settings!.updatedAt),
    }),
  );
});

router.get("/admin/invoices", async (req, res): Promise<void> => {
  const query = ListAdminInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: query.error.message });
    return;
  }
  const rows = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.createdAt));
  const invoices = (await Promise.all(rows.map((row) => loadInvoice(row.id)))).filter(
    (invoice): invoice is LoadedInvoice => invoice !== null,
  );
  const filtered = query.data.status
    ? invoices.filter((invoice) => invoice.status === query.data.status)
    : invoices;
  res.json(ListAdminInvoicesResponse.parse(filtered));
});

router.post("/admin/invoices", async (req, res): Promise<void> => {
  const parsed = CreateAdminInvoiceBody.safeParse(normalizeInvoiceBody(req.body));
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const issueDate = data.issueDate ?? currentBusinessDate();
  if (!isInvoiceDate(issueDate) || !isInvoiceDate(data.dueDate)) {
    res.status(400).json({ message: "Issue and due dates must use YYYY-MM-DD" });
    return;
  }
  if (data.dueDate < issueDate) {
    res.status(400).json({ message: "Due date cannot be before issue date" });
    return;
  }
  let totals;
  try {
    const [settings] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
    totals = computeInvoiceTotals(data.lineItems, data.gstMode ?? settings?.gstMode ?? "exclusive");
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Invalid invoice totals" });
    return;
  }

  const booking = data.bookingId == null ? null : await findBookingSnapshot(data.bookingId);
  if (data.bookingId != null && !booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  if (
    booking &&
    (booking.status === "pending_payment" || booking.status === "expired")
  ) {
    res.status(409).json({
      reason: "invoice_requires_captured_booking",
      message: "Invoices cannot be created for an unpaid or expired payment hold.",
    });
    return;
  }
  // A booking is authoritative for its customer snapshot. Manual customer
  // details are used only for invoices that are not linked to a booking.
  const customer = booking
    ? {
        name: booking.customerName,
        email: booking.customerEmail,
        phone: booking.customerPhone,
      }
    : {
        name: data.customerName.trim(),
        email: data.customerEmail.trim().toLowerCase(),
        phone: data.customerPhone?.trim() || null,
      };

  let invoiceId: number | null = null;
  for (let attempt = 0; attempt < 3 && invoiceId === null; attempt += 1) {
    try {
      invoiceId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(invoicesTable)
          .values({
            invoiceNumber: makeInvoiceNumber(),
            bookingId: data.bookingId ?? null,
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            customerAddress: data.customerAddress?.trim() || null,
            bookingSnapshotRef: booking?.bookingRef ?? null,
            bookingSnapshotPropertyName: booking?.propertyName ?? null,
            bookingSnapshotRoomName: booking?.roomName ?? null,
            bookingSnapshotCheckIn: booking?.checkIn ?? null,
            bookingSnapshotCheckOut: booking?.checkOut ?? null,
            bookingSnapshotTotalMinor: booking?.totalMinor ?? null,
            issueDate,
            dueDate: data.dueDate,
            currency: "INR",
            subtotalMinor: totals.subtotalMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
          })
          .returning({ id: invoicesTable.id });
        if (!created) throw new Error("Invoice could not be created");
        await tx.insert(invoiceLineItemsTable).values(
          totals.lines.map((line) => ({
            invoiceId: created.id,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            taxRateBps: line.taxRateBps,
            taxMinor: line.taxMinor,
            totalMinor: line.totalMinor,
          })),
        );
        return created.id;
      });
    } catch (error) {
      if (
        !(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505")
      ) {
        throw error;
      }
    }
  }
  if (invoiceId === null) {
    res.status(503).json({ message: "Could not allocate a unique invoice number. Please try again." });
    return;
  }
  const invoice = await loadInvoice(invoiceId);
  res.status(201).json(CreateAdminInvoiceResponse.parse(invoice));
});

router.get("/admin/invoices/:id", async (req, res): Promise<void> => {
  const params = GetAdminInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const invoice = await loadInvoice(params.data.id);
  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }
  res.json(GetAdminInvoiceResponse.parse(invoice));
});

router.post("/admin/invoices/:id/payments", async (req, res): Promise<void> => {
  const params = RecordInvoicePaymentParams.safeParse(req.params);
  const parsed = RecordInvoicePaymentBody.safeParse(normalizePaymentBody(req.body));
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Invalid payment request" });
    return;
  }
  const data = parsed.data;
  if (!isInvoiceDate(data.paymentDate)) {
    res.status(400).json({ message: "Payment date must use YYYY-MM-DD" });
    return;
  }

  type PaymentResult =
    | "created"
    | "same"
    | "conflict"
    | "missing"
    | "overpayment"
    | "future"
    | "mixed"
    | "hold";
  const result = await db.transaction(async (tx): Promise<PaymentResult> => {
    const [invoice] = await tx
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, params.data.id));
    if (!invoice) return "missing";
    // Booking-linked invoice payments share the room -> booking lock with the
    // online checkout path. Standalone invoices retain their invoice lock.
    if (invoice.bookingId != null) {
      const [booking] = await tx
        .select({ roomId: bookingsTable.roomId, status: bookingsTable.status })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, invoice.bookingId));
      if (!booking) return "missing";
      if (booking.status === "pending_payment" || booking.status === "expired") {
        return "hold";
      }
      await lockRoomAndBooking(tx, booking.roomId, invoice.bookingId);
    } else {
      await lockInvoice(tx, params.data.id);
    }
    if (data.paymentDate > currentBusinessDate()) return "future";
    if (invoice.bookingId != null) {
      const [capturedRazorpay] = await tx
        .select({ id: razorpayPaymentsTable.id })
        .from(razorpayPaymentsTable)
        .where(
          and(
            eq(razorpayPaymentsTable.bookingId, invoice.bookingId),
            inArray(razorpayPaymentsTable.status, ["authorized", "captured"]),
          ),
        )
        .limit(1);
      const [pendingRazorpayOrder] = await tx
        .select({ id: razorpayOrdersTable.id })
        .from(razorpayOrdersTable)
        .where(
          and(
            eq(razorpayOrdersTable.bookingId, invoice.bookingId),
            inArray(razorpayOrdersTable.status, ["created", "attempted"]),
          ),
        )
        .limit(1);
      if (capturedRazorpay || pendingRazorpayOrder) return "mixed";
    }
    const [existing] = await tx
      .select()
      .from(invoicePaymentsTable)
      .where(
        and(
          eq(invoicePaymentsTable.invoiceId, invoice.id),
          eq(invoicePaymentsTable.idempotencyKey, data.idempotencyKey),
        ),
      );
    if (existing) {
      const same =
        existing.amountMinor === data.amountMinor &&
        existing.paymentDate === data.paymentDate &&
        existing.method === data.method &&
        (existing.reference ?? null) === (data.reference ?? null);
      return same ? "same" : "conflict";
    }
    const [paid] = await tx
      .select({
        amountMinor: sql<number>`coalesce(sum(${invoicePaymentsTable.amountMinor}), 0)::int`,
      })
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoice.id));
    if (data.amountMinor > invoice.totalMinor - Number(paid?.amountMinor ?? 0)) {
      return "overpayment";
    }
    await tx.insert(invoicePaymentsTable).values({
      invoiceId: invoice.id,
      amountMinor: data.amountMinor,
      paymentDate: data.paymentDate,
      method: data.method,
      reference: data.reference ?? null,
      idempotencyKey: data.idempotencyKey,
    });
    return "created";
  });

  if (result === "missing") {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }
  if (result === "conflict") {
    res.status(409).json({ message: "This idempotency key was already used for different payment details" });
    return;
  }
  if (result === "overpayment") {
    res.status(409).json({ message: "Payment amount exceeds the invoice balance" });
    return;
  }
  if (result === "future") {
    res.status(400).json({ message: "Payment date cannot be in the future in the Asia/Kolkata business timezone" });
    return;
  }
  if (result === "mixed") {
    res.status(409).json({ message: "Manual invoice payments cannot be mixed with a captured Razorpay payment" });
    return;
  }
  if (result === "hold") {
    res.status(409).json({
      reason: "invoice_requires_captured_booking",
      message: "Manual payments cannot be recorded for an unpaid or expired payment hold.",
    });
    return;
  }
  const invoice = await loadInvoice(params.data.id);
  res.status(201).json(RecordInvoicePaymentResponse.parse(invoice));
});

router.get("/admin/invoices/:id/pdf", async (req, res): Promise<void> => {
  const params = GetAdminInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const invoice = await loadInvoice(params.data.id);
  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }
  const [settings] = await db
    .select()
    .from(billingSettingsTable)
    .where(eq(billingSettingsTable.id, 1));
  if (!settings) {
    res.status(409).json({ message: "Billing settings are not configured" });
    return;
  }
  const pdf = await generateInvoicePdf({
    settings,
    invoice,
  });
  res
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`)
    .send(pdf);
});

router.get("/admin/invoices/:id/email-status", async (req, res): Promise<void> => {
  const params = GetInvoiceEmailStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const invoice = await loadInvoice(params.data.id);
  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_PORT === "465");
  const [job] = invoice.bookingId ? await db.select().from(bookingEmailsTable).where(eq(bookingEmailsTable.bookingId, invoice.bookingId)) : [];
  const status = job?.status ?? (configured ? "not_queued" : "unavailable");
  const messages: Record<string, string> = {
    unavailable: "SMTP is not configured.",
    not_queued: "Automatic email applies to newly paid bookings. This invoice has not been queued; use the email draft for older or manual invoices.",
    pending: "Booking confirmation and invoice are queued for email delivery.",
    sent: "The mail server accepted the booking confirmation and invoice email. Inbox delivery is not guaranteed.",
    failed: "Email delivery failed after retries. Check SMTP settings; use the email draft to send this invoice manually.",
    skipped: "Confirmation email was skipped because this booking is no longer confirmed.",
  };
  res.json(GetInvoiceEmailStatusResponse.parse({ status, configured, message: messages[status] }));
});

router.post("/admin/invoices/:id/email", async (req, res): Promise<void> => {
  const params = GetInvoiceEmailStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const invoice = await loadInvoice(params.data.id);
  if (!invoice) {
    res.status(404).json({ message: "Invoice not found" });
    return;
  }
  res.status(503).json({
    message: "Manual invoice sending is not supported here. New paid bookings are emailed automatically; use the email draft for manual invoices.",
  });
});

export default router;