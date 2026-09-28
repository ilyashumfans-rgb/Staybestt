import { useClerk, useUser } from "@clerk/react";
import {
  getGetRazorpayPaymentStatusQueryKey,
  getListBookingsQueryKey,
  getListAdminInvoicesQueryKey,
  getGetAdminReportsQueryKey,
  getGetAdminBusinessReportsQueryKey,
  useCreateRazorpayOrder,
  useGetRazorpayPaymentStatus,
  useVerifyRazorpayPayment,
  useGetBookingById,
  useGetRazorpayReadiness,
  getGetBookingByIdQueryKey,
  getGetRazorpayReadinessQueryKey,
  type Booking,
  type PaymentSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, CreditCard, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  withRazorpayTimeout,
  type RazorpayCheckoutSession,
  type RazorpayCheckoutResponse,
} from "@/lib/razorpay";
import { formatPrice } from "@/lib/utils";
import {
  getPaymentAllowed,
  getPaymentHoldExpiresAt,
  getPaymentMessage,
  isBookingConfirmed,
} from "@/lib/booking-display";

type PaymentStatus = NonNullable<PaymentSummary>["status"];

interface BookingPaymentActionsProps {
  booking: Pick<Booking, "id" | "guestName" | "guestEmail" | "guestPhone" | "totalAmount" | "status"> & {
    paymentSummary?: PaymentSummary;
  };
  compact?: boolean;
  onPaid?: () => void;
}

function statusCopy(
  status: PaymentStatus,
  pendingPayment = false,
  expired = false,
) {
  switch (status) {
    case "paid":
      return { label: "Paid online", className: "bg-emerald-100 text-emerald-800", icon: CheckCircle };
    case "processing":
      return { label: "Payment processing", className: "bg-amber-100 text-amber-800", icon: RefreshCw };
    case "failed":
      return { label: "Payment failed", className: "bg-red-100 text-red-800", icon: XCircle };
    case "refund_required":
      return { label: "Refund required", className: "bg-red-100 text-red-800", icon: ShieldAlert };
    default:
      return {
        label: expired ? "Expired" : pendingPayment ? "Payment required" : "Pay at hotel · unpaid",
        className: expired ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700",
        icon: expired ? XCircle : CreditCard,
      };
  }
}

export function BookingPaymentActions({
  booking,
  compact = false,
  onPaid,
}: BookingPaymentActionsProps) {
  const { isLoaded, isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const queryClient = useQueryClient();
  const createOrder = useCreateRazorpayOrder();
  const verifyPayment = useVerifyRazorpayPayment();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderAmount, setOrderAmount] = useState<number | null>(null);
  const [orderMode, setOrderMode] = useState<"test" | "live" | null>(null);
  const [paymentAttemptActive, setPaymentAttemptActive] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const checkoutSessionRef = useRef<RazorpayCheckoutSession | null>(null);
  const statusQuery = useGetRazorpayPaymentStatus(booking.id, {
    query: {
      enabled: false,
      queryKey: getGetRazorpayPaymentStatusQueryKey(booking.id),
    },
  });
  const bookingQuery = useGetBookingById(booking.id, undefined, {
    query: {
      enabled: false,
      queryKey: getGetBookingByIdQueryKey(booking.id, undefined),
    },
  });
  const readiness = useGetRazorpayReadiness({
    query: {
      staleTime: 30_000,
      retry: 1,
      queryKey: getGetRazorpayReadinessQueryKey(),
    },
  });

  const paymentStatus = statusQuery.data?.status ?? booking.paymentSummary?.status ?? "unpaid";
  const summary = useMemo(() => {
    const value = statusCopy(
      paymentStatus,
      booking.status === "pending_payment",
      booking.status === "expired",
    );
    if (paymentStatus === "paid" && booking.paymentSummary?.provider !== "razorpay") {
      return { ...value, label: "Paid" };
    }
    return value;
  }, [booking.paymentSummary?.provider, paymentStatus]);
  const StatusIcon = summary.icon;
  const isReservationPayable =
    booking.status === "confirmed" || booking.status === "pending_payment";
  const holdExpiresAt = getPaymentHoldExpiresAt(booking);
  const isHoldExpired = holdExpired || (
    booking.status === "pending_payment" &&
    !!holdExpiresAt &&
    new Date(holdExpiresAt).getTime() <= Date.now()
  );
  const isPaid = paymentStatus === "paid";
  const isBusy = paymentAttemptActive || checkoutOpen;

  useEffect(() => () => {
    checkoutSessionRef.current?.cleanup();
    checkoutSessionRef.current = null;
  }, []);

  const clearCheckoutSession = () => {
    checkoutSessionRef.current?.cleanup();
    checkoutSessionRef.current = null;
  };

  const invalidatePaymentCaches = () => {
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRazorpayPaymentStatusQueryKey(booking.id) });
    // Payment verification creates/updates an invoice snapshot and feeds reports.
    queryClient.invalidateQueries({ queryKey: getListAdminInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminReportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminBusinessReportsQueryKey() });
  };

  const handleVerify = async (response: RazorpayCheckoutResponse, orderId: string) => {
    try {
      const result = await withRazorpayTimeout(
        verifyPayment.mutateAsync({
          id: booking.id,
          data: {
            razorpayOrderId: response.razorpay_order_id || orderId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          },
        }),
        undefined,
        "Payment verification timed out. Check payment status before retrying.",
      );
      setCheckoutOpen(false);
      setPaymentAttemptActive(false);
      clearCheckoutSession();
      invalidatePaymentCaches();
      if (result.status === "paid") {
        const refreshedBooking = await bookingQuery.refetch();
        if (isBookingConfirmed(refreshedBooking.data)) {
          setCheckoutError(null);
          onPaid?.();
        } else {
          setCheckoutError("Payment received. Your booking confirmation is still pending. Refresh payment status shortly.");
        }
      } else if (result.status === "processing") {
        setCheckoutError("Payment is still processing. Check payment status again shortly.");
      } else if (result.status === "refund_required") {
        setCheckoutError("Payment was captured after the hold expired and requires a refund review. Your booking was not confirmed.");
      } else {
        setCheckoutError(result.message || "Payment was not confirmed. You can safely retry.");
      }
    } catch (error: any) {
      setCheckoutOpen(false);
      setPaymentAttemptActive(false);
      clearCheckoutSession();
      setCheckoutError(error?.message || "Payment verification failed. No payment confirmation was recorded.");
      toast.error(error?.message || "Payment verification failed.");
      invalidatePaymentCaches();
    }
  };

  const handlePayNow = async () => {
    setCheckoutError(null);
    setOrderAmount(null);
    setOrderMode(null);
    if (!isLoaded) return;
    if (!isSignedIn) {
      toast.info("Sign in is required to pay online as the booking owner.");
      openSignIn();
      return;
    }
    if (!isReservationPayable || isPaid || isHoldExpired) return;

    const readinessValue = readiness.data as
      | (typeof readiness.data & { paymentAllowed?: boolean; message?: string | null })
      | undefined;
    const paymentAllowed = getPaymentAllowed(readinessValue) ??
      (readinessValue?.configured === true && readinessValue.providerStatus === "ok");
    if (readiness.isLoading) {
      setCheckoutError("Checking online payment readiness. Please try again in a moment.");
      return;
    }
    if (!paymentAllowed) {
      setCheckoutError(
        getPaymentMessage(readinessValue) ||
        "Online payment is not available right now. Your booking was not changed.",
      );
      return;
    }

    setPaymentAttemptActive(true);
    try {
      const order = await withRazorpayTimeout(
        createOrder.mutateAsync({ id: booking.id }),
        undefined,
        "The payment order request timed out. Your payment hold is still being checked; please retry.",
      );
      // The order amount is authoritative; never calculate a payment amount in the browser.
      setOrderAmount(order.amountMinor / 100);
      setOrderMode(order.mode);
      await loadRazorpayCheckout();
      setCheckoutOpen(true);
      checkoutSessionRef.current = openRazorpayCheckout(order, {
        name: "StayBest",
        description: `StayBest booking ${booking.id}`,
        prefill: {
          name: booking.guestName,
          email: booking.guestEmail,
          ...(booking.guestPhone ? { contact: booking.guestPhone } : {}),
        },
        theme: { color: "#ff6b00" },
      }, {
        onSuccess: (response) => {
          handleVerify(response, order.orderId);
        },
        onFailure: (error) => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setCheckoutError(error.message || "Payment failed. Your payment hold remains pending; you can safely retry.");
        },
        onDismiss: () => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setCheckoutError("Payment window closed. Your payment hold remains pending. You can retry before it expires.");
        },
        onTimeout: () => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setCheckoutError("Razorpay did not report a payment result in time. Refresh payment status before retrying.");
        },
      });
    } catch (error: any) {
      setCheckoutOpen(false);
      setPaymentAttemptActive(false);
      clearCheckoutSession();
       const message = error?.message || "Could not start online payment.";
       if (/expired|payment_hold_expired/i.test(message)) {
         setHoldExpired(true);
         setCheckoutError("This payment hold expired. Start a new booking to choose the room and dates again.");
       } else {
         setCheckoutError(message);
       }
    }
  };

  const handleCheckStatus = async () => {
    setCheckoutError(null);
    try {
      await statusQuery.refetch();
      invalidatePaymentCaches();
    } catch (error: any) {
      setCheckoutError(error?.message || "Could not refresh payment status.");
      toast.error(error?.message || "Could not refresh payment status.");
    }
  };

  return (
    <div className={compact ? "space-y-2" : "border rounded-xl p-4 bg-muted/20 space-y-3"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${paymentStatus === "processing" ? "animate-spin" : ""}`} />
          <span className="text-sm font-medium">Payment</span>
        </div>
        <Badge variant="secondary" className={`${summary.className} border-none text-xs`}>
          {summary.label}
        </Badge>
      </div>
      {!isPaid && paymentStatus === "unpaid" && (
        <p className="text-xs text-muted-foreground">
          Reservation status is <span className="font-semibold">{booking.status === "pending_payment" ? "Pending payment" : booking.status}</span>; payment is required before a new booking is confirmed.
          {booking.status !== "pending_payment" && booking.paymentSummary?.provider === "none" && " This legacy booking is currently pay at hotel."}
        </p>
      )}
      {isPaid && booking.status === "pending_payment" && (
        <p className="text-xs text-amber-800" role="status">
          Payment received. Your booking confirmation is still pending; no reference has been assigned yet.
        </p>
      )}
      {checkoutError && (
        <p className="text-xs text-destructive" role="alert">{checkoutError}</p>
      )}
      {!isPaid && isReservationPayable && !isHoldExpired && (
        <p className="text-xs text-muted-foreground">
          Amount to pay: <span className="font-semibold">{formatPrice(orderAmount ?? (booking.paymentSummary?.amountMinor ? booking.paymentSummary.amountMinor / 100 : booking.totalAmount))}</span>
        </p>
      )}
      {orderMode === "test" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Test mode: no live charge will be made.
        </p>
      )}
      {isReservationPayable && !isPaid && !isHoldExpired && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size={compact ? "sm" : "default"} onClick={handlePayNow} disabled={isBusy || !isLoaded || readiness.isLoading}>
            {isBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Pay Now
          </Button>
          <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={handleCheckStatus} disabled={statusQuery.isFetching || isBusy || !isSignedIn}>
            {statusQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Check payment
          </Button>
        </div>
      )}
      {paymentStatus === "paid" && booking.paymentSummary?.paidMinor != null && (
        <p className="text-xs text-muted-foreground">Paid online: {formatPrice(booking.paymentSummary.paidMinor / 100)}</p>
      )}
      {paymentStatus === "refund_required" && (
        <p className="text-xs font-medium text-red-700">A captured payment requires manual refund review.</p>
      )}
      {isHoldExpired && (
        <p className="text-xs font-medium text-red-700">This payment hold expired. Start again to create a fresh booking hold.</p>
      )}
      {isReservationPayable && holdExpiresAt && !isHoldExpired && !isPaid && booking.status === "pending_payment" && (
        <p className="text-xs text-blue-800">
          Payment pending — complete checkout before <HoldCountdown expiresAt={holdExpiresAt} onExpired={() => setHoldExpired(true)} />.
        </p>
      )}
      {!isSignedIn && isReservationPayable && !isPaid && (
        <p className="text-xs text-muted-foreground">Sign in to resume or check an online payment as the booking owner.</p>
      )}
    </div>
  );
}

function HoldCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const update = () => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemainingMs(next);
      if (next === 0) onExpired();
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  if (remainingMs <= 0) return <span className="font-bold text-red-700">expired</span>;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  return (
    <span className="font-bold tabular-nums">
      {Math.floor(totalSeconds / 60)}:{(totalSeconds % 60).toString().padStart(2, "0")}
    </span>
  );
}