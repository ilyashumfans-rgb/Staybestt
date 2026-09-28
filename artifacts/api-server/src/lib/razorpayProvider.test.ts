import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRazorpayOrder,
  getRazorpayConfig,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from "./razorpayProvider";
import { createHmac } from "node:crypto";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Razorpay provider safety", () => {
  it("requires a recognizable test/live key mode before making provider calls", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_synthetic");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "synthetic-secret");
    expect(getRazorpayConfig()).toMatchObject({ mode: "test", keyId: "rzp_test_synthetic" });

    vi.stubEnv("RAZORPAY_KEY_ID", "not-a-razorpay-key");
    expect(getRazorpayConfig()).toBeNull();
  });

  it("validates credentials with a read-only GET and never sends an order body", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_synthetic");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "synthetic-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyRazorpayCredentials()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/orders?count=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("creates only a synthetic INR order with the server amount", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_synthetic");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "synthetic-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "order_synthetic",
        amount: 12_345,
        currency: "INR",
        receipt: "SB-TEST-1",
        status: "created",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createRazorpayOrder({
        amountMinor: 12_345,
        receipt: "SB-TEST-1",
        notes: { booking_id: "1" },
      }),
    ).resolves.toMatchObject({ id: "order_synthetic", amount: 12_345, currency: "INR" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      amount: 12_345,
      currency: "INR",
      receipt: "SB-TEST-1",
      notes: { booking_id: "1" },
    });
  });

  it("rejects provider auth denial without exposing the provider body", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_synthetic");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "synthetic-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ secret: "must-not-leak" }),
      }),
    );

    await expect(verifyRazorpayCredentials()).rejects.toMatchObject({
      providerStatus: 401,
    });
    await expect(verifyRazorpayCredentials()).rejects.not.toThrow("must-not-leak");
  });
});

describe("Razorpay signatures", () => {
  it("uses the checkout order/payment pair and rejects altered signatures", () => {
    const secret = "synthetic-secret";
    const signature = createHmac("sha256", secret)
      .update("order_1|pay_1")
      .digest("hex");
    expect(verifyRazorpayCheckoutSignature("order_1", "pay_1", signature, secret)).toBe(true);
    expect(verifyRazorpayCheckoutSignature("order_1", "pay_2", signature, secret)).toBe(false);
  });

  it("verifies the exact raw webhook bytes", () => {
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{"id":"p1"}}');
    const signature = createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
    expect(verifyRazorpayWebhookSignature(rawBody, signature, "webhook-secret")).toBe(true);
    expect(
      verifyRazorpayWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, "webhook-secret"),
    ).toBe(false);
  });
});