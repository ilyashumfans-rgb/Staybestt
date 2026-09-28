import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayMode = "test" | "live";

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  mode: RazorpayMode;
};

export type RazorpayReadiness = {
  configured: boolean;
  mode: RazorpayMode | null;
  webhookConfigured: boolean;
  providerStatus?: "ok" | "unavailable" | "not_configured";
  paymentAllowed: boolean;
};

const READINESS_CACHE_MS = 30_000;
let readinessProbeCache:
  | {
      key: string;
      checkedAt: number;
      providerStatus: "ok" | "unavailable";
      paymentAllowed: boolean;
    }
  | null = null;

export function resetRazorpayReadinessCache(): void {
  readinessProbeCache = null;
}

export type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
};

export type RazorpayPaymentResponse = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  error_code?: string | null;
  error_description?: string | null;
};

export type RazorpayOrderPaymentsResponse = {
  items?: RazorpayPaymentResponse[];
};

export class RazorpayProviderError extends Error {
  readonly providerStatus: number | null;

  constructor(
    message: string,
    providerStatus: number | null = null,
  ) {
    super(message);
    this.name = "RazorpayProviderError";
    this.providerStatus = providerStatus;
  }
}

function inferMode(keyId: string): RazorpayMode | null {
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  const configuredMode = process.env.RAZORPAY_MODE;
  return configuredMode === "test" || configuredMode === "live"
    ? configuredMode
    : null;
}

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) return null;
  const mode = inferMode(keyId);
  if (!mode) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
    mode,
  };
}

export function getRazorpayReadiness() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const mode = keyId && keySecret ? inferMode(keyId) : null;
  const cacheKey = `${mode}:${keyId}:${keySecret}:${process.env.RAZORPAY_WEBHOOK_SECRET ?? ""}`;
  const cached =
    readinessProbeCache &&
    readinessProbeCache.key === cacheKey &&
    Date.now() - readinessProbeCache.checkedAt < READINESS_CACHE_MS
      ? readinessProbeCache
      : null;
  const base = {
    configured: Boolean(keyId && keySecret && mode),
    mode,
    webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim()),
    // Development may use test keys only. A live key outside production is
    // never chargeable, even when the credentials themselves are valid.
    paymentAllowed: cached?.paymentAllowed ?? false,
  };
  if (cached) {
    return {
      ...base,
      providerStatus: cached.providerStatus,
    };
  }
  return base;
}

/**
 * Probe credentials at most once per cache interval. All payment creation
 * paths use this result, so a configured-but-unreachable provider cannot
 * create an unusable local hold/order.
 */
export async function getRazorpayReadinessWithProbe(): Promise<RazorpayReadiness> {
  const base = getRazorpayReadiness();
  if (!base.configured || !base.mode) {
    return {
      ...base,
      providerStatus: "not_configured",
      paymentAllowed: false,
    };
  }
  if (process.env.NODE_ENV !== "production" && base.mode === "live") {
    return { ...base, providerStatus: "unavailable", paymentAllowed: false };
  }
  const key = `${base.mode}:${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET ?? ""}:${process.env.RAZORPAY_WEBHOOK_SECRET ?? ""}`;
  const now = Date.now();
  if (
    readinessProbeCache &&
    readinessProbeCache.key === key &&
    now - readinessProbeCache.checkedAt < READINESS_CACHE_MS
  ) {
    return {
      ...base,
      providerStatus: readinessProbeCache.providerStatus,
      paymentAllowed: readinessProbeCache.paymentAllowed,
    };
  }
  let providerStatus: "ok" | "unavailable" = "unavailable";
  try {
    await verifyRazorpayCredentials();
    providerStatus = "ok";
  } catch {
    // Provider bodies and credential details are intentionally not exposed.
  }
  const configEligible =
    base.configured &&
    base.webhookConfigured &&
    !(process.env.NODE_ENV !== "production" && base.mode === "live");
  const paymentAllowed = configEligible && providerStatus === "ok";
  readinessProbeCache = {
    key,
    checkedAt: now,
    providerStatus,
    paymentAllowed,
  };
  return { ...base, providerStatus, paymentAllowed };
}

async function razorpayRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new RazorpayProviderError("Razorpay is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers = new Headers(init.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
    );
    headers.set("content-type", "application/json");
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      // Provider response bodies may contain request/entity details. They are
      // intentionally not surfaced or logged by the server.
      throw new RazorpayProviderError(
        "Razorpay provider request failed",
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new RazorpayProviderError("Razorpay returned an invalid response");
    }
  } catch (error) {
    if (error instanceof RazorpayProviderError) throw error;
    throw new RazorpayProviderError("Razorpay provider request timed out or failed");
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyRazorpayCredentials(): Promise<boolean> {
  await razorpayRequest<{ items?: unknown[] }>("/orders?count=1", {
    method: "GET",
  });
  return true;
}

export async function createRazorpayOrder(input: {
  amountMinor: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
  const order = await razorpayRequest<RazorpayOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
  if (
    typeof order.id !== "string" ||
    order.amount !== input.amountMinor ||
    order.currency !== "INR" ||
    order.receipt !== input.receipt
  ) {
    throw new RazorpayProviderError("Razorpay returned an invalid order");
  }
  return order;
}

export async function fetchRazorpayPayment(
  paymentId: string,
): Promise<RazorpayPaymentResponse> {
  return razorpayRequest<RazorpayPaymentResponse>(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
}

export async function fetchRazorpayOrderPayments(
  orderId: string,
): Promise<RazorpayPaymentResponse[]> {
  const result = await razorpayRequest<RazorpayOrderPaymentsResponse>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
    { method: "GET" },
  );
  return Array.isArray(result.items) ? result.items : [];
}

export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
