const RAZORPAY_SCRIPT_ID = "staybest-razorpay-checkout";
const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
const DEFAULT_LOAD_TIMEOUT_MS = 10_000;

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: "INR";
  order_id: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
  };
}

export interface RazorpayCheckout {
  open: () => void;
  close?: () => void;
  on?: (event: string, handler: (response: unknown) => void) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayCheckout;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptLoad: Promise<void> | null = null;
export const RAZORPAY_REQUEST_TIMEOUT_MS = 30_000;

export function withRazorpayTimeout<T>(
  promise: Promise<T>,
  timeoutMs = RAZORPAY_REQUEST_TIMEOUT_MS,
  message = "Razorpay request timed out. Your payment hold remains pending; please retry.",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface RazorpayOrderForCheckout {
  orderId: string;
  keyId: string;
  amountMinor: number;
  currency: "INR";
  mode: "test" | "live";
  status?: "created" | "paid" | "failed";
}

export interface RazorpayCheckoutHandlers {
  onSuccess: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  onFailure: (error: Error) => void;
  onDismiss: () => void;
  onTimeout: () => void;
}

export interface RazorpayCheckoutSession {
  cleanup: () => void;
}

export function validateRazorpayOrder(
  order: Partial<RazorpayOrderForCheckout> | null | undefined,
): string | null {
  if (!order?.keyId?.trim()) return "Razorpay order did not include a public checkout key.";
  if (!order.orderId?.trim()) return "Razorpay order did not include an order id.";
  const amountMinor = order.amountMinor;
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return "Razorpay order has an invalid INR amount.";
  }
  if (order.currency !== "INR") return "Razorpay order currency must be INR.";
  if (order.mode !== "test" && order.mode !== "live") {
    return "Razorpay order mode is missing or invalid.";
  }
  if (order.status && order.status !== "created") {
    return `Razorpay order is not payable (status: ${order.status}).`;
  }
  return null;
}

export function validateRazorpayResponse(
  response: Partial<RazorpayCheckoutResponse> | null | undefined,
): string | null {
  if (!response?.razorpay_order_id?.trim()) return "Razorpay did not return an order id.";
  if (!response.razorpay_payment_id?.trim()) return "Razorpay did not return a payment id.";
  if (!response.razorpay_signature?.trim()) return "Razorpay did not return a payment signature.";
  return null;
}

/**
 * Construct and open Checkout while normalising the callback lifecycle.
 * Standard Checkout calls the supplied `handler`; some test doubles also
 * expose `payment.failed` and `modal.ondismiss`, so each outcome is guarded
 * and can only settle once. A provider that never reports an outcome is
 * surfaced as an error rather than leaving the UI spinning forever.
 */
export function openRazorpayCheckout(
  order: RazorpayOrderForCheckout,
  options: Omit<RazorpayCheckoutOptions, "key" | "amount" | "currency" | "order_id" | "handler" | "modal">,
  handlers: RazorpayCheckoutHandlers,
  timeoutMs = 10 * 60_000,
): RazorpayCheckoutSession {
  const orderError = validateRazorpayOrder(order);
  if (orderError) throw new Error(orderError);
  if (typeof window === "undefined" || typeof window.Razorpay !== "function") {
    throw new Error("Razorpay Checkout is unavailable. Please try again.");
  }

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const settle = (callback: () => void | Promise<void>) => {
    if (settled) return;
    settled = true;
    cleanup();
    void callback();
  };

  timer = setTimeout(() => {
    settle(handlers.onTimeout);
  }, timeoutMs);

  let checkout: RazorpayCheckout;
  try {
    checkout = new window.Razorpay({
      ...options,
      key: order.keyId,
      amount: order.amountMinor,
      currency: order.currency,
      order_id: order.orderId,
      handler: (response) => {
        const responseError = validateRazorpayResponse(response);
        if (responseError) {
          settle(() => handlers.onFailure(new Error(responseError)));
          return;
        }
        settle(() => handlers.onSuccess(response));
      },
      modal: {
        ondismiss: () => settle(handlers.onDismiss),
      },
    });
    if (!checkout || typeof checkout.open !== "function") {
      throw new Error("Razorpay Checkout returned an invalid client.");
    }
    checkout.on?.("payment.failed", () => {
      settle(() => handlers.onFailure(new Error(
         "Razorpay reported that the payment failed. Your payment hold remains pending; you can safely retry.",
      )));
    });
    checkout.open();
  } catch (error) {
    cleanup();
    throw error instanceof Error ? error : new Error("Could not open Razorpay Checkout.");
  }

  return {
    cleanup: () => {
      if (!settled) settled = true;
      cleanup();
      checkout.close?.();
    },
  };
}

/**
 * Load Standard Checkout exactly once. A rejected load removes the failed
 * element and resets the promise so a later attempt can recover from a
 * transient network/CSP error.
 */
export function loadRazorpayCheckout(
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout is only available in a browser."));
  }

  if (window.Razorpay) return Promise.resolve();
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(RAZORPAY_SCRIPT_ID);
    const script = existing instanceof HTMLScriptElement
      ? existing
      : document.createElement("script");
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const fail = (message: string) => {
      cleanup();
      if (!window.Razorpay) script.remove();
      reject(new Error(message));
    };

    const onLoad = () => {
      cleanup();
      if (window.Razorpay) {
        resolve();
      } else {
        fail("Razorpay Checkout loaded without its payment client.");
      }
    };

    const onError = () => fail("Razorpay Checkout could not be loaded.");

    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) document.head.appendChild(script);
    timeout = setTimeout(() => fail("Razorpay Checkout timed out. Please try again."), timeoutMs);
  }).catch((error) => {
    scriptLoad = null;
    throw error;
  });

  return scriptLoad;
}