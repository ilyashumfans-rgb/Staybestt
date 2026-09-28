import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type RazorpayOrder,
  type RazorpayPaymentStatus,
  useCreateRazorpayMobileOrder,
  useExchangeRazorpayMobileSession,
  getGetRazorpayMobilePaymentStatusQueryKey,
  useGetRazorpayMobilePaymentStatus,
  useVerifyRazorpayMobilePayment,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  validateRazorpayOrder,
  withRazorpayTimeout,
  type RazorpayCheckoutResponse,
  type RazorpayCheckoutSession,
} from "@/lib/razorpay";
import { formatPrice } from "@/lib/utils";

declare global {
  interface Window {
    /**
     * Written non-enumerably by the synchronous mobile-payment guard in
     * index.html and consumed/deleted during this module's initialization.
     */
    __mobileCheckoutCapability?: string;
  }
}

type ExchangeState = "reading" | "exchanging" | "ready" | "error";
type BusyState = "creating-order" | "loading-checkout" | "checkout" | "verifying" | null;
type PaymentOutcome =
  | "idle"
  | "paid"
  | "processing"
  | "failed"
  | "pending"
  | "refund_required";

const NO_STORE_REQUEST = {
  headers: {
    "Cache-Control": "no-store",
    Accept: "application/json",
  },
};

function takeEarlyCapability(): string | null {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname !== "/mobile-payment" && !pathname.endsWith("/mobile-payment")) {
    return null;
  }

  const earlyCapability = window.__mobileCheckoutCapability;
  if (typeof earlyCapability === "string") {
    delete window.__mobileCheckoutCapability;
    return earlyCapability;
  }

  // Keep a synchronous fallback for direct module/test entry points where the
  // index.html guard is not present. The fragment is erased before returning.
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim() || "";
  window.history.replaceState(null, document.title, pathname);
  return token && token.length <= 512 ? token : null;
}

// This runs while the web module is initializing, before ClerkProvider or
// Razorpay Checkout can execute. The capability never enters a URL query.
const earlyCapability = takeEarlyCapability();

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function friendlyPaymentError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;

  const status = "status" in error ? (error as { status?: unknown }).status : undefined;
  if (status === 401 || status === 404) {
    return "This secure payment link is invalid or has expired. Open a fresh payment link from the StayBest app.";
  }

  const message = error instanceof Error ? error.message : "";
  if (!message || /^HTTP \d{3}/.test(message)) return fallback;
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}

function paymentStatusMessage(status: RazorpayPaymentStatus): string | null {
  const detail = status as RazorpayPaymentStatus & {
    captured?: boolean;
    bookingStatus?: string | null;
    bookingRef?: string | null;
    booking?: { status?: string | null; bookingRef?: string | null } | null;
  };
  const bookingStatus = detail.bookingStatus ?? detail.booking?.status;
  switch (status.status) {
    case "paid":
      return detail.captured === true && bookingStatus !== "confirmed"
        ? "Payment received. StayBest is waiting to confirm your booking."
        : null;
    case "processing":
      return status.message || "Payment is still being reconciled. Do not pay again yet.";
    case "refund_required":
      return status.message || "Payment was captured, but StayBest needs to review a refund.";
    case "failed":
      return status.message || "Razorpay reported that this payment failed. You can safely retry.";
    default:
      return status.message;
  }
}

function hostedStatusDetails(status: RazorpayPaymentStatus | null) {
  const detail = status as (RazorpayPaymentStatus & {
    captured?: boolean;
    bookingStatus?: string | null;
    bookingRef?: string | null;
    booking?: { status?: string | null; bookingRef?: string | null } | null;
  }) | null;
  const captured = detail?.captured === true || detail?.status === "paid";
  const bookingStatus = detail?.bookingStatus ?? detail?.booking?.status;
  const bookingRef = detail?.bookingRef ?? detail?.booking?.bookingRef;
  const bookingConfirmed =
    bookingStatus === "confirmed" &&
    typeof bookingRef === "string" &&
    bookingRef.trim().length > 0;
  return {
    captured,
    bookingConfirmed,
    bookingRef: bookingConfirmed ? bookingRef ?? null : null,
  };
}

function resultUri(bookingId: number): string | null {
  if (!isPositiveInteger(bookingId)) return null;
  return `staybest://payment-result?bookingId=${encodeURIComponent(String(bookingId))}`;
}

export default function MobilePayment() {
  const [fragmentToken] = useState<string | null>(() => earlyCapability);
  const [exchangeState, setExchangeState] = useState<ExchangeState>("reading");
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<RazorpayPaymentStatus | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<RazorpayOrder | null>(null);
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  // These refs deliberately keep the capability and bearer out of persistent
  // browser storage. They also make the exchange idempotent in React StrictMode.
  const fragmentReadRef = useRef(false);
  const exchangePromiseRef = useRef<Promise<unknown> | null>(null);
  const initialStatusRequestedRef = useRef(false);
  const checkoutOrderRef = useRef<RazorpayOrder | null>(null);
  const checkoutSessionRef = useRef<RazorpayCheckoutSession | null>(null);

  const exchangeSession = useExchangeRazorpayMobileSession({
    request: NO_STORE_REQUEST,
  });

  const scopedRequest = useMemo(
    () =>
      checkoutToken
        ? {
            headers: {
              ...NO_STORE_REQUEST.headers,
              "X-Mobile-Checkout-Token": checkoutToken,
            },
          }
        : NO_STORE_REQUEST,
    [checkoutToken],
  );

  const createOrder = useCreateRazorpayMobileOrder({ request: scopedRequest });
  const verifyPayment = useVerifyRazorpayMobilePayment({ request: scopedRequest });
  const statusQuery = useGetRazorpayMobilePaymentStatus({
    query: {
      enabled: false,
      staleTime: 0,
      queryKey: getGetRazorpayMobilePaymentStatusQueryKey(),
    },
    request: scopedRequest,
  });
  const statusRefetch = statusQuery.refetch;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Secure payment · StayBest";

    const referrerMeta = document.createElement("meta");
    referrerMeta.name = "referrer";
    referrerMeta.content = "no-referrer";
    document.head.appendChild(referrerMeta);

    return () => {
      document.title = previousTitle;
      referrerMeta.remove();
    };
  }, []);

  useEffect(() => {
    if (fragmentReadRef.current || exchangePromiseRef.current) return;
    fragmentReadRef.current = true;

    if (!fragmentToken) {
      setExchangeState("error");
      return;
    }

    setExchangeState("exchanging");
    const exchangePromise = exchangeSession.mutateAsync({ data: { token: fragmentToken } });
    exchangePromiseRef.current = exchangePromise;
    void exchangePromise
      .then((session) => {
        if (!session.checkoutToken || !isPositiveInteger(session.bookingId)) {
          throw new Error("The payment session response was invalid.");
        }
        setBookingId(session.bookingId);
        setCheckoutToken(session.checkoutToken);
        setExchangeState("ready");
      })
      .catch((error: unknown) => {
        setExchangeState("error");
        setActionError(friendlyPaymentError(error, "This secure payment link is invalid or has expired."));
      });
  }, [exchangeSession, fragmentToken]);

  const applyPaymentStatus = useCallback(
    (nextStatus: RazorpayPaymentStatus, fallbackMessage?: string) => {
      setPaymentStatus(nextStatus);
      const details = hostedStatusDetails(nextStatus);
      if (details.captured && details.bookingConfirmed) {
        setPaymentOutcome("paid");
        setActionError(null);
        return;
      }

      if (nextStatus.status === "refund_required") {
        setPaymentOutcome("refund_required");
      } else if (details.captured) {
        // Razorpay capture is not the same as a confirmed booking. The
        // backend may still be completing the atomic hold transition.
        setPaymentOutcome("pending");
      } else if (nextStatus.status === "processing") {
        setPaymentOutcome("processing");
      } else if (nextStatus.status === "failed") {
        setPaymentOutcome("failed");
      } else {
        setPaymentOutcome("idle");
      }

      setActionError(paymentStatusMessage(nextStatus) || fallbackMessage || null);
    },
    [],
  );

  const refreshHostedStatus = useCallback(
    async (fallbackMessage?: string): Promise<RazorpayPaymentStatus | null> => {
      if (!checkoutToken) return null;
      setStatusRefreshing(true);
      try {
        const result = await withRazorpayTimeout(
          statusRefetch(),
          undefined,
          "Payment status refresh timed out. Please retry.",
        );
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Payment status was not returned.");
        applyPaymentStatus(result.data, fallbackMessage);
        return result.data;
      } catch (error: unknown) {
        setActionError(friendlyPaymentError(error, fallbackMessage || "Could not refresh payment status."));
        return null;
      } finally {
        setStatusRefreshing(false);
      }
    },
    [applyPaymentStatus, checkoutToken, statusRefetch],
  );

  useEffect(() => {
    if (!checkoutToken || initialStatusRequestedRef.current) return;
    initialStatusRequestedRef.current = true;
    void refreshHostedStatus();
  }, [checkoutToken, refreshHostedStatus]);

  const finishCheckout = useCallback(() => {
    checkoutSessionRef.current?.cleanup();
    checkoutSessionRef.current = null;
    setBusyState(null);
  }, []);

  const handlePaySecurely = async () => {
    if (
      !checkoutToken ||
      busyState ||
      statusRefreshing ||
      paymentOutcome === "pending" ||
      paymentOutcome === "processing" ||
      paymentStatus?.status === "paid" ||
      paymentStatus?.status === "processing" ||
      paymentStatus?.status === "refund_required"
    ) {
      return;
    }

    setActionError(null);
    setBusyState("creating-order");

    try {
      let order = checkoutOrderRef.current;
      if (!order) {
        order = await withRazorpayTimeout(
          createOrder.mutateAsync(),
          undefined,
          "The secure payment order request timed out. You can retry without creating another amount.",
        );
        const orderError = validateRazorpayOrder(order);
        if (orderError) throw new Error(orderError);
        checkoutOrderRef.current = order;
        setCheckoutOrder(order);
      }

      if (
        paymentStatus?.amountMinor !== undefined &&
        paymentStatus.amountMinor !== order.amountMinor
      ) {
        throw new Error("The payment amount changed. Open a fresh payment link from StayBest.");
      }

      setBusyState("loading-checkout");
      await withRazorpayTimeout(
        loadRazorpayCheckout(),
        undefined,
        "Razorpay Checkout could not be loaded. Your reservation is unchanged; please retry.",
      );

      setBusyState("checkout");
      checkoutSessionRef.current = openRazorpayCheckout(
        order,
        {
          name: "StayBest",
          description: "Secure StayBest booking payment",
          theme: { color: "#ff6b00" },
        },
        {
          onSuccess: async (response: RazorpayCheckoutResponse) => {
            setBusyState("verifying");
            try {
              const result = await withRazorpayTimeout(
                verifyPayment.mutateAsync({
                  data: {
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                  },
                }),
                undefined,
                "Payment verification timed out. Refresh status before trying again.",
              );
              applyPaymentStatus(result);
              finishCheckout();
            } catch (error: unknown) {
              finishCheckout();
              setPaymentOutcome("pending");
              setActionError(
                friendlyPaymentError(
                  error,
                  "Payment reached Razorpay, but confirmation is still pending. Refresh payment status before retrying.",
                ),
              );
            }
          },
          onFailure: (error) => {
            finishCheckout();
            setPaymentOutcome("failed");
            setActionError(error.message || "Razorpay reported that the payment failed. You can safely retry.");
          },
          onDismiss: () => {
            finishCheckout();
            void refreshHostedStatus(
              "Payment window closed. No payment was confirmed; refresh status or retry securely.",
            );
          },
          onTimeout: () => {
            finishCheckout();
            setPaymentOutcome("pending");
            setActionError("Razorpay did not report a result in time. Refresh payment status before retrying.");
          },
        },
      );
    } catch (error: unknown) {
      finishCheckout();
      setActionError(friendlyPaymentError(error, "Could not start secure payment. Your reservation is unchanged."));
    }
  };

  const handleReturnToApp = () => {
    if (!bookingId) return;
    const callback = resultUri(bookingId);
    if (callback) window.location.assign(callback);
  };

  const authoritativeAmountMinor = paymentStatus?.amountMinor ?? checkoutOrder?.amountMinor ?? null;
  const hostedDetails = hostedStatusDetails(paymentStatus);
  const hasTerminalOutcome =
    paymentOutcome === "paid" || paymentOutcome === "refund_required";
  const isReady = exchangeState === "ready" && Boolean(checkoutToken) && Boolean(bookingId);
  const isBusy = Boolean(busyState) || statusRefreshing;

  if (exchangeState === "reading" || exchangeState === "exchanging") {
    return (
      <PaymentShell>
        <div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
          <LoadingMark />
          <h1 className="mt-6 text-2xl font-semibold text-[#0b1a30]">Preparing secure checkout</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            We are opening a one-time StayBest payment session. This page never stores your payment link.
          </p>
        </div>
      </PaymentShell>
    );
  }

  if (exchangeState === "error" || !isReady) {
    return (
      <PaymentShell>
        <div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#e85d04]">
            <Clock3 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-[#0b1a30]">Payment link unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This secure link may have expired or already been used. Open a fresh payment link from the StayBest app.
          </p>
          {actionError && (
            <p className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-left text-xs leading-5 text-orange-900">
              {actionError}
            </p>
          )}
          <CloseBrowserHint />
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell
      mode={checkoutOrder?.mode}
      paymentReceivedPending={hostedDetails.captured && !hostedDetails.bookingConfirmed && paymentOutcome !== "refund_required"}
    >
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-7 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-7 lg:py-10">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-30px_rgba(11,26,48,0.35)] sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e85d04]">StayBest checkout</p>
              <h1 className="mt-2 text-2xl font-semibold text-[#0b1a30] sm:text-3xl">Complete your payment</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Confirm the amount below, then continue to Razorpay’s official secure checkout.
              </p>
            </div>
            <div className="hidden shrink-0 rounded-2xl bg-[#f4f7fa] p-3 text-[#0b1a30] sm:block">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-[#dfe7ef] bg-[#f7f9fb] p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-600">Amount to pay</span>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0b1a30] shadow-sm">
                INR
              </span>
            </div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-[#0b1a30]">
              {authoritativeAmountMinor !== null ? formatPrice(authoritativeAmountMinor / 100) : "—"}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {authoritativeAmountMinor !== null
                ? "Final amount supplied by the StayBest payment server."
                : "Confirming the final amount from the StayBest payment server…"}
            </p>
          </div>

          {checkoutOrder?.mode === "test" && (
            <OutcomeNotice tone="warning" icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}>
              <strong>Test mode.</strong> This is a Razorpay test checkout. It will not make a live charge.
            </OutcomeNotice>
          )}

          {hostedDetails.captured && hostedDetails.bookingConfirmed && paymentOutcome === "paid" && (
            <OutcomeNotice tone="success" icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}>
              Payment received and booking confirmed.
              {hostedDetails.bookingRef && <span className="block mt-1 font-semibold">Booking reference: {hostedDetails.bookingRef}</span>}
            </OutcomeNotice>
          )}

          {hostedDetails.captured && !hostedDetails.bookingConfirmed && paymentOutcome !== "refund_required" && (
            <OutcomeNotice tone="info" icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}>
              <strong>Payment received — waiting for confirmation.</strong> StayBest is completing your booking. Do not pay again while this result is being reconciled.
            </OutcomeNotice>
          )}

          {paymentStatus?.status === "processing" && (
            <OutcomeNotice tone="info" icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}>
              Payment is still processing. Do not pay again while this result is being reconciled.
            </OutcomeNotice>
          )}

          {paymentStatus?.status === "refund_required" && (
            <OutcomeNotice tone="warning" icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}>
              <strong>Refund required.</strong> The payment was captured after the booking hold expired. Your booking was not confirmed; StayBest needs to review the refund.
            </OutcomeNotice>
          )}

          {actionError && paymentStatus?.status !== "refund_required" && paymentStatus?.status !== "paid" && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900" role="alert">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <p>{actionError}</p>
            </div>
          )}

          {paymentStatus?.status === "refund_required" && paymentStatus.message && (
            <p className="mt-3 text-xs text-amber-800">{paymentStatus.message}</p>
          )}

          <div className="mt-7 space-y-3">
            {!hasTerminalOutcome && (
              <Button
                type="button"
                size="lg"
                className="h-13 w-full rounded-2xl bg-[#ff6b00] text-base font-semibold shadow-lg shadow-orange-500/20 hover:bg-[#e85d04]"
                onClick={handlePaySecurely}
                disabled={
                  !checkoutToken ||
                  isBusy ||
                  paymentOutcome === "pending" ||
                  paymentOutcome === "processing" ||
                  paymentStatus?.status === "paid" ||
                  paymentStatus?.status === "processing" ||
                  paymentStatus?.status === "refund_required"
                }
              >
                {busyState === "creating-order" && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
                {busyState === "loading-checkout" && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
                {busyState === "checkout" && <LockKeyhole className="mr-2 h-5 w-5" aria-hidden="true" />}
                {busyState === "verifying" && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
                {!busyState && <LockKeyhole className="mr-2 h-5 w-5" aria-hidden="true" />}
                {busyState === "creating-order" && "Preparing secure payment…"}
                {busyState === "loading-checkout" && "Loading Razorpay…"}
                {busyState === "checkout" && "Razorpay checkout open"}
                {busyState === "verifying" && "Confirming payment…"}
                {!busyState && "Pay Securely"}
              </Button>
            )}

            {hasTerminalOutcome && (
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="h-13 w-full rounded-2xl"
                onClick={handleReturnToApp}
                disabled={!resultUri(bookingId ?? 0)}
              >
                <Smartphone className="mr-2 h-5 w-5" aria-hidden="true" />
                Return to StayBest app
                <ExternalLink className="ml-2 h-4 w-4 opacity-70" aria-hidden="true" />
              </Button>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b1a30] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void refreshHostedStatus()}
                disabled={!checkoutToken || isBusy || Boolean(busyState)}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${statusRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                Refresh payment status
              </button>
              {hostedDetails.bookingRef && hostedDetails.bookingConfirmed && (
                <span className="text-[11px] text-slate-400">Booking reference: {hostedDetails.bookingRef}</span>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-3xl bg-[#0b1a30] p-5 text-white shadow-[0_18px_55px_-30px_rgba(11,26,48,0.75)] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#ff8a3d]">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold">Protected payment handoff</h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  {checkoutOrder?.mode === "test"
                    ? "Razorpay test checkout · INR"
                    : checkoutOrder?.mode === "live"
                      ? "Live Razorpay checkout · INR only"
                      : "Razorpay Standard Checkout · INR"}
                </p>
              </div>
            </div>
            <ul className="mt-6 space-y-4 text-sm leading-5 text-slate-200">
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8a3d]" aria-hidden="true" />
                <span>Your amount and booking are verified by StayBest’s server.</span>
              </li>
              <li className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8a3d]" aria-hidden="true" />
                <span>Your one-time payment link is kept only in this browser session.</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8a3d]" aria-hidden="true" />
                <span>StayBest confirms payment before the app refreshes your booking.</span>
              </li>
            </ul>
          </div>

          {paymentOutcome === "pending" && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              <div className="flex gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                <p>Do not start another payment until you refresh this status. A late Razorpay result can still be reconciled safely.</p>
              </div>
            </div>
          )}

          <CloseBrowserHint />
        </aside>
      </div>
    </PaymentShell>
  );
}

function PaymentShell({
  children,
  mode,
  paymentReceivedPending = false,
}: {
  children: React.ReactNode;
  mode?: "test" | "live";
  paymentReceivedPending?: boolean;
}) {
  return (
    <main className="min-h-[100dvh] bg-[#f4f7fa] text-[#0b1a30]">
      <header className="border-b border-white/10 bg-[#0b1a30] text-white">
        <div className="mx-auto flex h-[4.5rem] max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-[-0.04em]">
              Stay<span className="text-[#ff7a2f]">Best</span>
            </span>
            <span className="hidden h-4 w-px bg-white/20 sm:block" />
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300 sm:block">
              {paymentReceivedPending
                ? "Payment received · confirmation pending"
                : mode === "test"
                  ? "Test payment"
                  : "Secure payment"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <LockKeyhole className="h-4 w-4 text-[#ff8a3d]" aria-hidden="true" />
            <span>
              {paymentReceivedPending
                ? "StayBest confirmation pending"
                : mode === "test"
                  ? "Test mode · no live charge"
                  : mode === "live"
                    ? "Live encrypted checkout"
                    : "Encrypted checkout"}
            </span>
          </div>
        </div>
      </header>
      {children}
      <footer className="mx-auto flex max-w-5xl items-center justify-center px-4 pb-8 pt-1 text-center text-[11px] text-slate-400 sm:px-6">
        StayBest secure checkout · You will never be asked for your StayBest password on this page.
      </footer>
    </main>
  );
}

function LoadingMark() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b1a30] text-[#ff8a3d] shadow-lg shadow-slate-900/10">
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
    </div>
  );
}

function CloseBrowserHint() {
  return (
    <p className="mt-7 max-w-sm text-xs leading-5 text-slate-400">
      Using Expo Go or a web browser? If the app does not open automatically, close this browser window and return to StayBest to see the latest booking status.
    </p>
  );
}

function OutcomeNotice({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: "success" | "info" | "warning";
}) {
  const toneClass = {
    success: "border-emerald-100 bg-emerald-50 text-emerald-900",
    info: "border-blue-100 bg-blue-50 text-blue-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];

  return (
    <div className={`mt-5 flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${toneClass}`} role="status">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <p>{children}</p>
    </div>
  );
}