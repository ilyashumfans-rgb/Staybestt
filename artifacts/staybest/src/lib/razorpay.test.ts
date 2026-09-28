import assert from "node:assert/strict";
import test from "node:test";
import {
  openRazorpayCheckout,
  type RazorpayCheckoutOptions,
  type RazorpayCheckoutResponse,
  type RazorpayOrderForCheckout,
} from "./razorpay";

const order: RazorpayOrderForCheckout = {
  orderId: "order_test_123",
  keyId: "rzp_test_public",
  amountMinor: 125000,
  currency: "INR",
  mode: "test",
};

type MockOptions = RazorpayCheckoutOptions;

class MockCheckout {
  static latest: MockCheckout | null = null;
  readonly options: MockOptions;
  readonly listeners = new Map<string, (value: unknown) => void>();
  opened = false;
  closed = false;

  constructor(options: MockOptions) {
    this.options = options;
    MockCheckout.latest = this;
  }

  on(event: string, handler: (value: unknown) => void) {
    this.listeners.set(event, handler);
  }

  open() {
    this.opened = true;
  }

  close() {
    this.closed = true;
  }
}

function installMockCheckout() {
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    Razorpay: MockCheckout,
  };
  return () => {
    (globalThis as { window?: unknown }).window = previousWindow;
    MockCheckout.latest = null;
  };
}

const checkoutOptions = {
  name: "StayBest",
  description: "Test booking",
  prefill: { name: "Test Guest", email: "test@example.com" },
};

test("successful Checkout callback reaches the server verification callback", () => {
  const restore = installMockCheckout();
  try {
    let verified: RazorpayCheckoutResponse | null = null;
    const session = openRazorpayCheckout(order, checkoutOptions, {
      onSuccess: (response) => {
        verified = response;
      },
      onFailure: (error) => {
        throw error;
      },
      onDismiss: () => {
        throw new Error("dismiss should not run after success");
      },
      onTimeout: () => {
        throw new Error("timeout should not run after success");
      },
    }, 100);

    const checkout = MockCheckout.latest;
    assert.ok(checkout);
    assert.equal(checkout.opened, true);
    checkout.options.handler({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: "pay_test_123",
      razorpay_signature: "signature",
    });
    assert.deepEqual(verified, {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: "pay_test_123",
      razorpay_signature: "signature",
    });
    session.cleanup();
  } finally {
    restore();
  }
});

test("failed and dismissed Checkout outcomes are explicit and settle the session", () => {
  const restore = installMockCheckout();
  try {
    let failure: Error | null = null;
    let dismissed = false;
    const session = openRazorpayCheckout(order, checkoutOptions, {
      onSuccess: () => {
        throw new Error("success should not run");
      },
      onFailure: (error) => {
        failure = error;
      },
      onDismiss: () => {
        dismissed = true;
      },
      onTimeout: () => {
        throw new Error("timeout should not run");
      },
    }, 100);

    const checkout = MockCheckout.latest;
    assert.ok(checkout);
    checkout.listeners.get("payment.failed")?.({});
    assert.match(failure?.message ?? "", /payment failed/i);
    checkout.options.modal?.ondismiss?.();
    assert.equal(dismissed, false, "a failed payment must not be changed to a dismiss outcome");
    session.cleanup();

    const dismissSession = openRazorpayCheckout(order, checkoutOptions, {
      onSuccess: () => {
        throw new Error("success should not run");
      },
      onFailure: () => {
        throw new Error("failure should not run");
      },
      onDismiss: () => {
        dismissed = true;
      },
      onTimeout: () => {
        throw new Error("timeout should not run");
      },
    }, 100);
    MockCheckout.latest?.options.modal?.ondismiss?.();
    assert.equal(dismissed, true);
    dismissSession.cleanup();
  } finally {
    restore();
  }
});

test("a Checkout client that never reports an outcome times out without success", async () => {
  const restore = installMockCheckout();
  try {
    let timedOut = false;
    let succeeded = false;
    const session = openRazorpayCheckout(order, checkoutOptions, {
      onSuccess: () => {
        succeeded = true;
      },
      onFailure: () => {
        throw new Error("failure should not run");
      },
      onDismiss: () => {
        throw new Error("dismiss should not run");
      },
      onTimeout: () => {
        timedOut = true;
      },
    }, 5);

    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(timedOut, true);
    assert.equal(succeeded, false);
    session.cleanup();
  } finally {
    restore();
  }
});

test("invalid order and callback fields fail explicitly without verification", () => {
  const restore = installMockCheckout();
  try {
    assert.throws(
      () => openRazorpayCheckout({ ...order, amountMinor: 0 }, checkoutOptions, {
        onSuccess: () => {
          throw new Error("success should not run");
        },
        onFailure: () => {},
        onDismiss: () => {},
        onTimeout: () => {},
      }),
      /invalid INR amount/i,
    );

    let failure: Error | null = null;
    const session = openRazorpayCheckout(order, checkoutOptions, {
      onSuccess: () => {
        throw new Error("success should not run");
      },
      onFailure: (error) => {
        failure = error;
      },
      onDismiss: () => {},
      onTimeout: () => {},
    }, 100);
    MockCheckout.latest?.options.handler({
      razorpay_order_id: order.orderId,
      razorpay_payment_id: "",
      razorpay_signature: "signature",
    });
    assert.match(failure?.message ?? "", /payment id/i);
    session.cleanup();
  } finally {
    restore();
  }
});