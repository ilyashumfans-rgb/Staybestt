import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  bookingsTable,
  db,
  razorpayMobileSessionsTable,
  razorpayOrdersTable,
  razorpayWebhookEventsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateRazorpayOrderParams,
  CreateRazorpayOrderResponse,
  GetRazorpayPaymentStatusParams,
  GetRazorpayPaymentStatusResponse,
  GetRazorpayReadinessResponse,
  ReceiveRazorpayWebhookResponse,
  VerifyRazorpayPaymentBody,
  VerifyRazorpayPaymentParams,
  VerifyRazorpayPaymentResponse,
} from "@workspace/api-zod";
import { resolveUser } from "../lib/auth";
import {
  fetchRazorpayPayment,
  getRazorpayConfig,
  getRazorpayReadiness,
  getRazorpayReadinessWithProbe,
  RazorpayProviderError,
  verifyRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from "../lib/razorpayProvider";
import {
  bookingTotalMinor,
  loadPaymentSummary,
  RazorpayLedgerError,
  recordRazorpayPayment,
} from "../lib/razorpay";
import {
  createRazorpayOrderForBooking,
  getRazorpayPaymentStatusForBooking,
  providerFailureMessage,
  reconcileProviderPaymentForBooking,
  verifyRazorpayPaymentForBooking,
} from "../lib/razorpayCheckout";
import { lockRoomAndBooking } from "../lib/advisoryLocks";

const router: IRouter = Router();

async function authoritativeReadiness() {
  const syncReadiness = getRazorpayReadiness();
  const probe = getRazorpayReadinessWithProbe as unknown as
    | (() => Promise<typeof syncReadiness>)
    | undefined;
  return probe ? await probe() : syncReadiness;
}
const MOBILE_CAPABILITY_TTL_MS = 15 * 60 * 1000;
const MOBILE_CHECKOUT_TTL_MS = 30 * 60 * 1000;
const MOBILE_RATE_WINDOW_MS = 60 * 1000;
const MOBILE_IP_RATE_LIMIT = 180;
const MOBILE_SCOPED_RATE_LIMIT = 60;
const MOBILE_RATE_BUCKET_MAX = 10_000;
const mobileRateBuckets = new Map<string, { count: number; resetAt: number }>();
const READINESS_CACHE_MS = 30_000;
const READINESS_MIN_PROBE_INTERVAL_MS = 2_000;
let readinessLastProbeAt = 0;
let readinessProbeInFlight:
  | { key: string; promise: Promise<{ providerStatus: "ok" | "unavailable"; errorStatus: number | null }> }
  | null = null;
let readinessCache:
  | {
      key: string;
      checkedAt: number;
      providerStatus: "ok" | "unavailable";
      errorStatus: number | null;
    }
  | null = null;

function setNoStore(res: Response): void {
  res.set("Cache-Control", "no-store");
}

function issueOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function mobileRemoteAddress(req: Request): string {
  // Do not use req.ip here: its value depends on Express trust-proxy settings
  // and can be attacker-controlled when a deployment forwards arbitrary
  // X-Forwarded-For values.
  return req.socket.remoteAddress || "unknown";
}

function pruneMobileRateBuckets(now: number): void {
  for (const [key, bucket] of mobileRateBuckets) {
    if (bucket.resetAt <= now) mobileRateBuckets.delete(key);
  }
  while (mobileRateBuckets.size > MOBILE_RATE_BUCKET_MAX) {
    const oldest = mobileRateBuckets.keys().next().value as string | undefined;
    if (!oldest) break;
    mobileRateBuckets.delete(oldest);
  }
}

function consumeMobileRateLimit(
  req: Request,
  suffix: string,
  scopedKey?: string,
): boolean {
  const now = Date.now();
  const keys = [
    `${suffix}:ip:${mobileRemoteAddress(req)}`,
    ...(scopedKey ? [`${suffix}:scope:${scopedKey}`] : []),
  ];
  const limits = [MOBILE_IP_RATE_LIMIT, MOBILE_SCOPED_RATE_LIMIT];
  pruneMobileRateBuckets(now);
  for (let index = 0; index < keys.length; index += 1) {
    const bucket = mobileRateBuckets.get(keys[index]);
    if (bucket && bucket.resetAt > now && bucket.count >= limits[index]) {
      return false;
    }
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const bucket = mobileRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      mobileRateBuckets.set(key, {
        count: 1,
        resetAt: now + MOBILE_RATE_WINDOW_MS,
      });
    } else {
      bucket.count += 1;
    }
  }
  pruneMobileRateBuckets(now);
  return true;
}

function mobileTokenFromRequest(req: Request): string | null {
  const authorization = req.header("authorization")?.trim() ?? "";
  const headerToken = req.header("x-mobile-checkout-token")?.trim() ?? "";
  const bearer = authorization.match(/^Bearer[ \t]+([^\s]+)$/i)?.[1] ?? "";
  if (bearer && headerToken && bearer !== headerToken) return null;
  const token = bearer || headerToken;
  return token && token.length <= 512 ? token : null;
}

function configuredMobilePaymentOrigin(): string | null {
  const configured =
    process.env.RAZORPAY_MOBILE_PAYMENT_ORIGIN?.trim() ||
    process.env.MOBILE_PAYMENT_ORIGIN?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      return null;
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function readinessKey(readiness: ReturnType<typeof getRazorpayReadiness>): string {
  // The key ID is only an in-process cache discriminator. It is never returned
  // or logged, and avoids reusing a result after credentials are rotated.
  return [
    readiness.configured,
    readiness.mode ?? "none",
    readiness.webhookConfigured,
    process.env.RAZORPAY_KEY_ID?.trim() ?? "",
  ].join(":");
}

async function probeReadiness(
  key: string,
): Promise<{ providerStatus: "ok" | "unavailable"; errorStatus: number | null }> {
  const now = Date.now();
  if (
    readinessCache &&
    readinessCache.key === key &&
    now - readinessCache.checkedAt < READINESS_CACHE_MS
  ) {
    return {
      providerStatus: readinessCache.providerStatus,
      errorStatus: readinessCache.errorStatus,
    };
  }
  if (readinessProbeInFlight?.key === key) {
    return readinessProbeInFlight.promise;
  }
  if (now - readinessLastProbeAt < READINESS_MIN_PROBE_INTERVAL_MS) {
    return {
      providerStatus: readinessCache?.key === key
        ? readinessCache.providerStatus
        : "unavailable",
      errorStatus: readinessCache?.key === key ? readinessCache.errorStatus : null,
    };
  }

  readinessLastProbeAt = now;
  const promise = verifyRazorpayCredentials()
    .then(() => ({ providerStatus: "ok" as const, errorStatus: null }))
    .catch((error: unknown) => ({
      providerStatus: "unavailable" as const,
      errorStatus: error instanceof RazorpayProviderError ? error.providerStatus : null,
    }))
    .then((result) => {
      readinessCache = { key, checkedAt: Date.now(), ...result };
      return result;
    })
    .finally(() => {
      readinessProbeInFlight = null;
    });
  readinessProbeInFlight = { key, promise };
  return promise;
}

function bookingIdFromParams(value: string | string[]): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

async function assertBookingOwner(
  req: Request,
  bookingId: number,
) {
  const user = await resolveUser(req);
  if (!user) return { user: null, booking: null };
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking || booking.userId !== user.id) {
    return { user, booking: null };
  }
  return { user, booking };
}

type MobileAccess = {
  session: typeof razorpayMobileSessionsTable.$inferSelect;
  user: typeof usersTable.$inferSelect;
  booking: typeof bookingsTable.$inferSelect;
};

async function resolveMobileSession(req: Request): Promise<MobileAccess | null> {
  const rawToken = mobileTokenFromRequest(req);
  if (!rawToken) return null;
  const [session] = await db
    .select()
    .from(razorpayMobileSessionsTable)
    .where(eq(razorpayMobileSessionsTable.checkoutTokenHash, tokenHash(rawToken)));
  if (
    !session ||
    !session.checkoutExpiresAt ||
    session.checkoutExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, session.bookingId));
  if (
    !user ||
    user.status !== "active" ||
    !booking ||
    booking.userId !== user.id ||
    session.userId !== booking.userId ||
    session.currency !== "INR"
  ) {
    return null;
  }
  try {
    if (bookingTotalMinor(booking.totalAmount) !== session.amountMinor) return null;
  } catch {
    return null;
  }
  return { session, user, booking };
}

function mobileSessionUnauthorized(res: Response): void {
  setNoStore(res);
  res.status(401).json({ message: "Invalid or expired mobile checkout session" });
}

function paymentStatusResponse(
  bookingId: number,
  summary: Awaited<ReturnType<typeof loadPaymentSummary>>,
  message: string | null = null,
) {
  if (!summary) return null;
  return {
    bookingId,
    status: summary.status,
    provider: summary.provider,
    amountMinor: summary.amountMinor,
    paidMinor: summary.paidMinor,
    dueMinor: summary.dueMinor,
    currency: summary.currency,
    orderId: summary.orderId,
    paymentId: summary.paymentId,
    verifiedAt: summary.verifiedAt,
    requiresRefund: summary.requiresRefund,
    message,
  };
}

router.get("/razorpay/readiness", async (req, res): Promise<void> => {
  const probe = getRazorpayReadinessWithProbe as unknown as
    | (() => Promise<{
        configured: boolean;
        mode: "test" | "live" | null;
        webhookConfigured: boolean;
        providerStatus?: "ok" | "unavailable" | "not_configured";
        paymentAllowed: boolean;
      }>)
    | undefined;
  if (probe) {
    const readiness = await probe();
    res.json(
      GetRazorpayReadinessResponse.parse({
        ...readiness,
        providerStatus: readiness.providerStatus ??
          (readiness.configured ? "unavailable" : "not_configured"),
      }),
    );
    return;
  }
  const readiness = getRazorpayReadiness();
  let providerStatus: "ok" | "unavailable" | "not_configured" =
    readiness.configured ? "unavailable" : "not_configured";
  if (readiness.configured) {
    const probe = await probeReadiness(readinessKey(readiness));
    providerStatus = probe.providerStatus;
    if (providerStatus === "unavailable") {
      // Do not include provider bodies, credentials, key IDs, or entity
      // details in logs. Only the mode and HTTP/error status are recorded.
      req.log.warn(
        { status: probe.errorStatus, mode: readiness.mode },
        "Razorpay readiness provider check failed",
      );
    }
  }
  const readinessWithOptionalPayment = readiness as typeof readiness & {
    paymentAllowed?: boolean;
  };
  const paymentAllowed = readinessWithOptionalPayment.paymentAllowed ??
    (readiness.configured &&
      readiness.webhookConfigured &&
      !(process.env.NODE_ENV !== "production" && readiness.mode === "live"));
  res.json(
    GetRazorpayReadinessResponse.parse({
      ...readiness,
      providerStatus,
      paymentAllowed: paymentAllowed && providerStatus === "ok",
    }),
  );
});

router.post("/bookings/:id/razorpay/mobile-session", async (req, res): Promise<void> => {
  setNoStore(res);
  const params = CreateRazorpayOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid booking id" });
    return;
  }
  const bookingId = params.data.id;
  const owner = await assertBookingOwner(req, bookingId);
  if (!consumeMobileRateLimit(
    req,
    "mint",
    owner.user?.id ? `user:${tokenHash(owner.user.id)}` : undefined,
  )) {
    res.set("Retry-After", "60").status(429).json({ message: "Too many payment-session requests" });
    return;
  }
  if (!owner.user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (owner.user.status !== "active") {
    res.status(403).json({ message: "Your account is not active" });
    return;
  }
  if (!owner.booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  if (
    owner.booking.status === "pending_payment" &&
    (!owner.booking.paymentHoldExpiresAt ||
      owner.booking.paymentHoldExpiresAt.getTime() <= Date.now())
  ) {
    await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, owner.booking!.roomId, bookingId);
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending_payment")));
    });
    res.status(409).json({
      reason: "payment_hold_expired",
      message: "This payment hold expired. Start a new booking to select these dates again.",
    });
    return;
  }
  if (!["pending_payment", "confirmed"].includes(owner.booking.status)) {
    res.status(409).json({ message: "Only a pending payment hold or legacy confirmed booking can accept online payment" });
    return;
  }
  const config = getRazorpayConfig();
  const readiness = await authoritativeReadiness();
  const paymentAllowed = Object.prototype.hasOwnProperty.call(readiness, "paymentAllowed")
    ? readiness.paymentAllowed
    : readiness.configured &&
      !(process.env.NODE_ENV !== "production" && readiness.mode === "live");
  if (!config || !paymentAllowed) {
    res.status(503).json({
      message: "Online payments are not ready. Configure Razorpay credentials and webhook settings before checkout.",
    });
    return;
  }
  if (config.mode === "live" && process.env.NODE_ENV !== "production") {
    res.status(503).json({ message: "Live Razorpay payments are disabled outside production" });
    return;
  }
  const summary = await loadPaymentSummary(bookingId);
  if (
    summary?.status === "paid" ||
    summary?.status === "refund_required" ||
    (summary?.provider === "manual" && summary.paidMinor > 0)
  ) {
    res.status(409).json({ message: "This booking already has a recorded or manual payment" });
    return;
  }

  const rawCapability = issueOpaqueToken();
  const capabilityExpiresAt = new Date(Date.now() + MOBILE_CAPABILITY_TTL_MS);
  const [session] = await db
    .insert(razorpayMobileSessionsTable)
    .values({
      userId: owner.user.id,
      bookingId,
      capabilityHash: tokenHash(rawCapability),
      amountMinor: bookingTotalMinor(owner.booking.totalAmount),
      currency: "INR",
      mode: config.mode,
      capabilityExpiresAt,
    })
    .returning();
  if (!session) {
    res.status(503).json({ message: "Payment session could not be created" });
    return;
  }
  const origin = configuredMobilePaymentOrigin();
  const response: {
    token: string;
    bookingId: number;
    expiresAt: string;
    amountMinor: number;
    mode: string;
    url?: string;
  } = {
    token: rawCapability,
    bookingId,
    expiresAt: capabilityExpiresAt.toISOString(),
    amountMinor: session.amountMinor,
    mode: session.mode,
  };
  if (origin) {
    response.url = `${origin}/mobile-payment#token=${encodeURIComponent(rawCapability)}`;
  }
  res.status(201).json(response);
});

router.use("/razorpay/mobile", (_req, res, next) => {
  setNoStore(res);
  next();
});

router.post("/razorpay/mobile/exchange", async (req, res): Promise<void> => {
  const candidateToken =
    req.body && typeof req.body === "object" && typeof req.body.token === "string"
      ? req.body.token.trim()
      : "";
  if (!candidateToken || candidateToken.length > 512) {
    res.status(400).json({ message: "Invalid mobile payment session token" });
    return;
  }
  const digest = tokenHash(candidateToken);
  if (!consumeMobileRateLimit(req, "exchange", `capability:${digest}`)) {
    res.set("Retry-After", "60").status(429).json({ message: "Too many payment-session requests" });
    return;
  }
  const [candidate] = await db
    .select()
    .from(razorpayMobileSessionsTable)
    .where(eq(razorpayMobileSessionsTable.capabilityHash, digest));
  const now = new Date();
  if (
    !candidate ||
    candidate.capabilityConsumedAt ||
    candidate.revokedAt ||
    candidate.capabilityExpiresAt.getTime() <= now.getTime()
  ) {
    res.status(401).json({ message: "Invalid or expired mobile payment session" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, candidate.userId));
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, candidate.bookingId));
  let bookingAmountMinor: number;
  try {
    bookingAmountMinor = booking ? bookingTotalMinor(booking.totalAmount) : 0;
  } catch {
    bookingAmountMinor = 0;
  }
  if (
    !user ||
    user.status !== "active" ||
    !booking ||
    booking.userId !== user.id ||
    bookingAmountMinor !== candidate.amountMinor
  ) {
    res.status(401).json({ message: "Invalid or expired mobile payment session" });
    return;
  }
  const rawCheckoutToken = issueOpaqueToken();
  const checkoutExpiresAt = new Date(Date.now() + MOBILE_CHECKOUT_TTL_MS);
  const [consumed] = await db
    .update(razorpayMobileSessionsTable)
    .set({
      capabilityConsumedAt: now,
      checkoutTokenHash: tokenHash(rawCheckoutToken),
      checkoutIssuedAt: now,
      checkoutExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(razorpayMobileSessionsTable.id, candidate.id),
        isNull(razorpayMobileSessionsTable.capabilityConsumedAt),
        isNull(razorpayMobileSessionsTable.revokedAt),
        gt(razorpayMobileSessionsTable.capabilityExpiresAt, now),
      ),
    )
    .returning();
  if (!consumed) {
    res.status(401).json({ message: "Invalid or expired mobile payment session" });
    return;
  }
  res.json({
    checkoutToken: rawCheckoutToken,
    bookingId: consumed.bookingId,
    expiresAt: checkoutExpiresAt.toISOString(),
  });
});

router.post("/razorpay/mobile/order", async (req, res): Promise<void> => {
  const rawCheckoutToken = mobileTokenFromRequest(req);
  const checkoutTokenScope = rawCheckoutToken
    ? `checkout:${tokenHash(rawCheckoutToken)}`
    : undefined;
  if (!consumeMobileRateLimit(req, "order", checkoutTokenScope)) {
    res.set("Retry-After", "60").status(429).json({ message: "Too many payment requests" });
    return;
  }
  const access = await resolveMobileSession(req);
  if (!access) {
    mobileSessionUnauthorized(res);
    return;
  }
  if (
    access.session.revokedAt ||
    !["pending_payment", "confirmed"].includes(access.booking.status) ||
    access.session.completedAt
  ) {
    res.status(409).json({ message: "This payment session cannot create a new order" });
    return;
  }
  if (
    access.booking.status === "pending_payment" &&
    (!access.booking.paymentHoldExpiresAt ||
      access.booking.paymentHoldExpiresAt.getTime() <= Date.now())
  ) {
    await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, access.booking.roomId, access.booking.id);
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(
          eq(bookingsTable.id, access.booking.id),
          eq(bookingsTable.status, "pending_payment"),
        ));
    });
    res.status(409).json({
      reason: "payment_hold_expired",
      message: "This payment hold expired. Start a new booking to select these dates again.",
    });
    return;
  }
  const summary = await loadPaymentSummary(access.booking.id);
  if (
    summary?.status === "paid" ||
    summary?.status === "refund_required" ||
    (summary?.provider === "manual" && summary.paidMinor > 0)
  ) {
    res.status(409).json({ message: "This booking already has a recorded or manual payment" });
    return;
  }
  try {
    const result = await createRazorpayOrderForBooking(
      access.booking.id,
      access.session.mode,
    );
    if (result.order.amountMinor !== access.session.amountMinor) {
      res.status(409).json({ message: "Payment amount changed; start a new checkout" });
      return;
    }
    res.status(201).json(CreateRazorpayOrderResponse.parse(result.order));
  } catch (error) {
    if (error instanceof RazorpayLedgerError) {
      res.status(409).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null },
      "Razorpay mobile order creation failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.post("/razorpay/mobile/verify", async (req, res): Promise<void> => {
  const rawCheckoutToken = mobileTokenFromRequest(req);
  const checkoutTokenScope = rawCheckoutToken
    ? `checkout:${tokenHash(rawCheckoutToken)}`
    : undefined;
  if (!consumeMobileRateLimit(req, "verify", checkoutTokenScope)) {
    res.set("Retry-After", "60").status(429).json({ message: "Too many payment requests" });
    return;
  }
  const body = VerifyRazorpayPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid payment verification request" });
    return;
  }
  const access = await resolveMobileSession(req);
  if (!access) {
    mobileSessionUnauthorized(res);
    return;
  }
  try {
    const summary = await verifyRazorpayPaymentForBooking(
      access.booking.id,
      body.data,
      access.session.mode,
    );
    if (summary?.status === "paid" && !access.session.completedAt) {
      await db
        .update(razorpayMobileSessionsTable)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(eq(razorpayMobileSessionsTable.id, access.session.id));
    }
    res.json(VerifyRazorpayPaymentResponse.parse(paymentStatusResponse(access.booking.id, summary)));
  } catch (error) {
    if (error instanceof RazorpayLedgerError) {
      res.status(400).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null },
      "Razorpay mobile payment verification failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.get("/razorpay/mobile/status", async (req, res): Promise<void> => {
  const rawCheckoutToken = mobileTokenFromRequest(req);
  const checkoutTokenScope = rawCheckoutToken
    ? `checkout:${tokenHash(rawCheckoutToken)}`
    : undefined;
  if (!consumeMobileRateLimit(req, "status", checkoutTokenScope)) {
    res.set("Retry-After", "60").status(429).json({ message: "Too many payment requests" });
    return;
  }
  const access = await resolveMobileSession(req);
  if (!access) {
    mobileSessionUnauthorized(res);
    return;
  }
  try {
    const config = getRazorpayConfig();
    if (config && config.mode !== access.session.mode) {
      res.status(409).json({ message: "Razorpay mode changed; this checkout session cannot be reused" });
      return;
    }
    const result = await getRazorpayPaymentStatusForBooking(access.booking.id);
    if (result.throttled) {
      res.set("Retry-After", "2").status(429).json({ message: "Payment status is being refreshed; please retry shortly" });
      return;
    }
    if (result.summary?.status === "paid" && !access.session.completedAt) {
      await db
        .update(razorpayMobileSessionsTable)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(eq(razorpayMobileSessionsTable.id, access.session.id));
    }
    res.json(
      GetRazorpayPaymentStatusResponse.parse(
        paymentStatusResponse(access.booking.id, result.summary),
      ),
    );
  } catch (error) {
    if (error instanceof RazorpayLedgerError) {
      res.status(400).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null },
      "Razorpay mobile payment reconciliation failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.post("/bookings/:id/razorpay/order", async (req, res): Promise<void> => {
  const params = CreateRazorpayOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid booking id" });
    return;
  }
  const bookingId = params.data.id;
  const owner = await assertBookingOwner(req, bookingId);
  if (!owner.user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (!owner.booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  if (
    owner.booking.status === "pending_payment" &&
    (!owner.booking.paymentHoldExpiresAt ||
      owner.booking.paymentHoldExpiresAt.getTime() <= Date.now())
  ) {
    await db.transaction(async (tx) => {
      await lockRoomAndBooking(tx, owner.booking!.roomId, bookingId);
      await tx
        .update(bookingsTable)
        .set({ status: "expired", paymentHoldExpiresAt: null })
        .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending_payment")));
    });
    res.status(409).json({
      reason: "payment_hold_expired",
      message: "This payment hold expired. Start a new booking to select these dates again.",
    });
    return;
  }
  if (!["pending_payment", "confirmed"].includes(owner.booking.status)) {
    res.status(409).json({ message: "Only a pending payment hold or legacy confirmed booking can accept online payment" });
    return;
  }
  const config = getRazorpayConfig();
  if (!config) {
    res.status(503).json({ message: "Razorpay online payments are not configured" });
    return;
  }
  if (config.mode === "live" && process.env.NODE_ENV !== "production") {
    res.status(503).json({ message: "Live Razorpay payments are disabled outside production" });
    return;
  }
  const summary = await loadPaymentSummary(bookingId);
  if (
    summary?.status === "paid" ||
    summary?.status === "refund_required" ||
    (summary?.provider === "manual" && summary.paidMinor > 0)
  ) {
    res.status(409).json({ message: "This booking already has a recorded or manual payment" });
    return;
  }

  try {
    const result = await createRazorpayOrderForBooking(bookingId);
    res.status(201).json(CreateRazorpayOrderResponse.parse(result.order));
  } catch (error) {
    if (
      error instanceof RazorpayLedgerError &&
      (error.code === "order_mismatch" || error.code === "payment_conflict")
    ) {
      res.status(409).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null, mode: config.mode },
      "Razorpay order creation failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.post("/bookings/:id/razorpay/verify", async (req, res): Promise<void> => {
  const params = VerifyRazorpayPaymentParams.safeParse(req.params);
  const body = VerifyRazorpayPaymentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid payment verification request" });
    return;
  }
  const bookingId = params.data.id;
  const owner = await assertBookingOwner(req, bookingId);
  if (!owner.user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (!owner.booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  try {
    const summary = await verifyRazorpayPaymentForBooking(
      bookingId,
      body.data,
    );
    res.json(
      VerifyRazorpayPaymentResponse.parse(
        paymentStatusResponse(bookingId, summary),
      ),
    );
  } catch (error) {
    if (error instanceof RazorpayLedgerError) {
      res.status(400).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null },
      "Razorpay payment verification provider request failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.get("/bookings/:id/razorpay/status", async (req, res): Promise<void> => {
  const params = GetRazorpayPaymentStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid booking id" });
    return;
  }
  const bookingId = params.data.id;
  const owner = await assertBookingOwner(req, bookingId);
  if (!owner.user) {
    res.status(401).json({ message: "Sign in required" });
    return;
  }
  if (!owner.booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  try {
    const result = await getRazorpayPaymentStatusForBooking(bookingId);
    if (result.throttled) {
      res.set("Retry-After", "2");
      res.status(429).json({ message: "Payment status is being refreshed; please retry shortly" });
      return;
    }
    res.json(
      GetRazorpayPaymentStatusResponse.parse(
        paymentStatusResponse(bookingId, result.summary),
      ),
    );
  } catch (error) {
    if (error instanceof RazorpayLedgerError) {
      res.status(400).json({ message: error.message });
      return;
    }
    req.log.warn(
      { status: error instanceof RazorpayProviderError ? error.providerStatus : null },
      "Razorpay payment reconciliation failed",
    );
    res.status(503).json({ message: providerFailureMessage(error) });
  }
});

router.post(
  "/razorpay/webhook",
  async (req, res): Promise<void> => {
    const webhookSecret = getRazorpayConfig()?.webhookSecret ??
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ??
      null;
    if (!webhookSecret) {
      res.status(503).json({ message: "Razorpay webhook secret is not configured" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "");
    const signature = req.header("x-razorpay-signature") ?? "";
    if (!rawBody.length || !verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
      res.status(400).json({ message: "Invalid Razorpay webhook signature" });
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ message: "Invalid Razorpay webhook payload" });
      return;
    }
    const event = typeof payload.event === "string" ? payload.event : "";
    const paymentEntity =
      payload?.payload?.payment?.entity ??
      payload?.payload?.["order.paid"]?.entity ??
      payload?.payload?.order?.entity;
    const paymentId =
      typeof paymentEntity?.id === "string" ? paymentEntity.id : null;
    const eventId =
      req.header("x-razorpay-event-id")?.trim() ||
      (paymentId ? `${event}:${paymentId}` : null);
    if (!eventId) {
      res.status(400).json({ message: "Razorpay webhook event id is required" });
      return;
    }
    const supported = new Set([
      "payment.authorized",
      "payment.captured",
      "payment.failed",
      "order.paid",
    ]);
    if (!supported.has(event) || !paymentId) {
      res.json(ReceiveRazorpayWebhookResponse.parse({ message: "Webhook ignored" }));
      return;
    }
    const [existing] = await db
      .select()
      .from(razorpayWebhookEventsTable)
      .where(eq(razorpayWebhookEventsTable.eventId, eventId));
    if (existing?.status === "processed") {
      res.json(ReceiveRazorpayWebhookResponse.parse({ message: "Webhook already processed" }));
      return;
    }
    if (!existing) {
      await db
        .insert(razorpayWebhookEventsTable)
        .values({ eventId, event, paymentId, status: "received" })
        .onConflictDoNothing({ target: razorpayWebhookEventsTable.eventId });
    }
    const config = getRazorpayConfig();
    if (!config) {
      res.status(503).json({ message: "Razorpay credentials are not configured" });
      return;
    }
    let payment;
    try {
      // Fetch the entity instead of trusting mutable webhook fields. The
      // signature authenticates the body; the API response authenticates the
      // money/order relationship and current capture state.
      payment = await fetchRazorpayPayment(paymentId);
    } catch (error) {
      req.log.warn(
        { status: error instanceof RazorpayProviderError ? error.providerStatus : null, mode: config.mode },
        "Razorpay webhook provider request failed",
      );
      res.status(503).json({ message: providerFailureMessage(error) });
      return;
    }
    const [linkedOrder] = await db
      .select({ bookingId: razorpayOrdersTable.bookingId })
      .from(razorpayOrdersTable)
      .where(eq(razorpayOrdersTable.externalOrderId, payment.order_id ?? ""));
    if (!linkedOrder) {
      await db
        .update(razorpayWebhookEventsTable)
        .set({ status: "failed" })
        .where(eq(razorpayWebhookEventsTable.eventId, eventId));
      res.status(400).json({ message: "Razorpay payment is not linked to a StayBest booking" });
      return;
    }
    try {
      if (
        !["captured", "authorized", "failed"].includes(payment.status) ||
        (payment.status === "captured" && payment.captured !== true)
      ) {
        await db
          .update(razorpayWebhookEventsTable)
          .set({ status: "failed" })
          .where(eq(razorpayWebhookEventsTable.eventId, eventId));
        res.status(400).json({ message: "Razorpay returned an unsupported payment status" });
        return;
      }
      await recordRazorpayPayment({
        bookingId: linkedOrder.bookingId,
        externalOrderId: payment.order_id!,
        externalPaymentId: payment.id,
        amountMinor: payment.amount,
        currency: payment.currency,
        mode: config.mode,
        status: payment.status as "captured" | "authorized" | "failed",
        source: "webhook",
        failureCode: payment.error_code,
        failureDescription: payment.error_description,
      });
    } catch (error) {
      if (error instanceof RazorpayLedgerError) {
        await db
          .update(razorpayWebhookEventsTable)
          .set({ status: "failed" })
          .where(eq(razorpayWebhookEventsTable.eventId, eventId));
        res.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
    await db
      .update(razorpayWebhookEventsTable)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(razorpayWebhookEventsTable.eventId, eventId));
    res.json(ReceiveRazorpayWebhookResponse.parse({ message: "Webhook processed" }));
  },
);

export default router;
