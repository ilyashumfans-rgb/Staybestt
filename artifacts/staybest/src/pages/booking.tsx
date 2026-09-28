import { useLocation, useParams, useSearch } from "wouter";
import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { 
  useGetProperty, 
  useGetAvailability, getGetAvailabilityQueryKey, 
  useCreateBooking,
  useCreateRazorpayOrder,
  useGetRazorpayPaymentStatus,
  useVerifyRazorpayPayment,
  getBookingById,
  getMe,
  useGetRazorpayReadiness,
  getGetRazorpayPaymentStatusQueryKey,
  getGetRazorpayReadinessQueryKey,
  getListBookingsQueryKey,
  getListAdminInvoicesQueryKey,
  getGetAdminReportsQueryKey,
  getGetAdminBusinessReportsQueryKey,
  useValidateCoupon,
  getGetPropertyQueryKey,
} from "@workspace/api-client-react";
import { useGuestIdentity } from "@/hooks/use-auth";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ShieldCheck, CreditCard, ChevronRight, AlertCircle, Loader2, TicketPercent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import {
  getPaymentAllowed,
  getPaymentMessage,
  getPaymentHoldExpiresAt,
  isBookingConfirmed,
} from "@/lib/booking-display";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  withRazorpayTimeout,
  type RazorpayCheckoutSession,
  type RazorpayCheckoutResponse,
} from "@/lib/razorpay";

export default function BookingFlow() {
  const params = useParams();
  const propertyId = Number(params.propertyId);
  const roomId = Number(params.roomId);
  
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const adults = Number(searchParams.get("adults")) || Number(searchParams.get("guests")) || 2;
  const children = Math.max(0, Number(searchParams.get("children")) || 0);
  const guests = adults + children;
  
  const [, setLocation] = useLocation();
  const goToCustomerSignIn = () => setLocation(`/sign-in?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  const { email, setEmail } = useGuestIdentity();
  const { isLoaded: isClerkLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState(email || "");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [roomsCount, setRoomsCount] = useState(1);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [createdBookingId, setCreatedBookingId] = useState<number | null>(null);
  const [onlineOrderAmount, setOnlineOrderAmount] = useState<number | null>(null);
  const [onlineOrderMode, setOnlineOrderMode] = useState<"test" | "live" | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentAttemptActive, setPaymentAttemptActive] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [sessionNeedsSignIn, setSessionNeedsSignIn] = useState(false);
  const bookingCreationLock = useRef(false);
  const checkoutSessionRef = useRef<RazorpayCheckoutSession | null>(null);

  const bookingIntentKey = `staybest_booking_intent:${encodeURIComponent(JSON.stringify({
    propertyId,
    roomId,
    checkIn,
    checkOut,
    guests,
    adults,
    children,
    roomsCount,
  }))}`;

  const createBooking = useCreateBooking({
    request: {
      headers: {
        // Repeated submits/browser retries use the same pending hold for this
        // draft instead of creating a second inventory reservation.
        "Idempotency-Key": bookingIntentKey.slice(-240),
      },
    },
  });

  const { data: property, isLoading: isPropertyLoading } = useGetProperty(propertyId, {
    query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) }
  });

  const { data: availability, isLoading: isAvailLoading } = useGetAvailability(
    { propertyId, checkIn, checkOut, guests, adults, children, roomsCount },
    { query: { enabled: !!propertyId && !!checkIn && !!checkOut, queryKey: getGetAvailabilityQueryKey({ propertyId, checkIn, checkOut, guests, adults, children, roomsCount }) } }
  );

  const createRazorpayOrder = useCreateRazorpayOrder();
  const verifyRazorpayPayment = useVerifyRazorpayPayment();
  const readiness = useGetRazorpayReadiness({
    query: {
      staleTime: 30_000,
      retry: 1,
      queryKey: getGetRazorpayReadinessQueryKey(),
    },
  });
  const validateCoupon = useValidateCoupon();
  const paymentStatus = useGetRazorpayPaymentStatus(createdBookingId ?? 0, {
    query: {
      enabled: false,
      queryKey: getGetRazorpayPaymentStatusQueryKey(createdBookingId ?? 0),
    },
  });

  const roomAvailability = availability?.find(a => a.room.id === roomId);
  const room = roomAvailability?.room;

  useEffect(() => () => {
    checkoutSessionRef.current?.cleanup();
    checkoutSessionRef.current = null;
  }, []);

  // Sync email to state if it changes
  useEffect(() => {
    if (email && !guestEmail) setGuestEmail(email);
  }, [email, guestEmail]);

  // Restore a pending hold created by this exact draft. The server remains the
  // authority; an expired hold is surfaced below and can only be discarded by
  // an explicit "Start again" action.
  useEffect(() => {
    if (createdBookingId) return;
    const cached = getCachedBooking();
    if (!cached) return;
    if (cached.guestName && !guestName) setGuestName(cached.guestName);
    if (cached.guestEmail && !guestEmail) setGuestEmail(cached.guestEmail);
    if (cached.guestPhone && !guestPhone) setGuestPhone(cached.guestPhone);
    if (cached.specialRequests && !specialRequests) setSpecialRequests(cached.specialRequests);
    setCreatedBookingId(cached.id);
    setHoldExpiresAt(cached.paymentHoldExpiresAt ?? null);
    if (cached.paymentHoldExpiresAt && new Date(cached.paymentHoldExpiresAt).getTime() <= Date.now()) {
      setHoldExpired(true);
    }
  }, [bookingIntentKey, createdBookingId]);

  if (isPropertyLoading || isAvailLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!property || !room || !roomAvailability) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Room not available</h1>
          <p className="text-muted-foreground mb-6">The selected room is no longer available for these dates.</p>
          <Button onClick={() => setLocation(`/property/${propertyId}`)}>Back to Property</Button>
        </div>
      </Layout>
    );
  }

  const nights = differenceInDays(new Date(checkOut), new Date(checkIn));
  // Server-computed stay total (includes seasonal pricing)
  const subtotal = roomAvailability.totalPrice * roomsCount;
  const discount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, subtotal) : 0;
  // Do not invent tax or fee amounts in the browser. The booking response/order
  // remains authoritative; this is only the pre-booking stay estimate.
  const estimatedTotal = Math.max(0, subtotal - discount);
  const displayedTotal = onlineOrderAmount ?? estimatedTotal;
  type PersistedBookingDraft = {
    id: number;
    paymentHoldExpiresAt?: string | null;
    bookingRef?: string | null;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    specialRequests?: string;
  };

  function getCachedBooking(): PersistedBookingDraft | null {
    const cachedId = localStorage.getItem(bookingIntentKey);
    if (!cachedId) return null;
    try {
      const parsed = JSON.parse(cachedId) as Partial<PersistedBookingDraft>;
      const id = parsed.id;
      return typeof id === "number" && Number.isInteger(id) && id > 0
        ? {
            id,
            paymentHoldExpiresAt: parsed.paymentHoldExpiresAt,
            bookingRef: parsed.bookingRef,
            guestName: parsed.guestName,
            guestEmail: parsed.guestEmail,
            guestPhone: parsed.guestPhone,
            specialRequests: parsed.specialRequests,
          }
        : null;
    } catch {
      const parsedId = Number(cachedId);
      return Number.isInteger(parsedId) && parsedId > 0 ? { id: parsedId } : null;
    }
  }

  const paymentReadiness = readiness.data as
    | (typeof readiness.data & { paymentAllowed?: boolean; message?: string | null })
    | undefined;
  // Older API responses predate paymentAllowed. Keep their known-good
  // configured/provider status usable while the contract rolls out.
  const paymentAllowed = getPaymentAllowed(paymentReadiness) ??
    (paymentReadiness?.configured === true && paymentReadiness.providerStatus === "ok");
  const paymentReadinessMessage = (import.meta.env.DEV && paymentReadiness?.mode === "live"
    ? "This preview cannot accept live payments. Use the published website or Razorpay test keys."
    : getPaymentMessage(paymentReadiness)) ??
    (readiness.isError
      ? "Online payments are temporarily unavailable. Please try again shortly."
      : paymentReadiness && !paymentAllowed
        ? "Online payment is not ready yet. Please try again after payment setup is complete."
        : null);

  const handleApplyCoupon = () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponError(null);
    validateCoupon.mutate({ data: { code, amount: subtotal } }, {
      onSuccess: (result) => {
        setAppliedCoupon({ code: result.code, discountAmount: result.discountAmount });
        setCouponError(null);
        toast.success(`Coupon ${result.code} applied!`);
      },
      onError: (error: any) => {
        setAppliedCoupon(null);
        setCouponError(error?.message || "Could not apply this coupon");
      }
    });
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  const invalidatePaymentCaches = (bookingId: number) => {
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRazorpayPaymentStatusQueryKey(bookingId) });
    queryClient.invalidateQueries({ queryKey: getListAdminInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminReportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminBusinessReportsQueryKey() });
  };

  const clearCheckoutSession = () => {
    checkoutSessionRef.current?.cleanup();
    checkoutSessionRef.current = null;
  };

  const handleOnlinePayment = async (bookingId: number) => {
    setCreatedBookingId(bookingId);
    setPaymentError(null);
    setOnlineOrderAmount(null);
    setOnlineOrderMode(null);
    setPaymentAttemptActive(true);

    try {
      const order = await withRazorpayTimeout(
        createRazorpayOrder.mutateAsync({ id: bookingId }),
        undefined,
        "The payment order request timed out. Your payment hold is still being checked; please retry.",
      );
      // The server derives this from persisted bookings.totalAmount.
      setOnlineOrderAmount(order.amountMinor / 100);
      setOnlineOrderMode(order.mode);
      await loadRazorpayCheckout();
      setCheckoutOpen(true);
      checkoutSessionRef.current = openRazorpayCheckout(order, {
        name: "StayBest",
        description: `StayBest booking ${bookingId}`,
        prefill: {
          name: guestName,
          email: guestEmail,
          ...(guestPhone ? { contact: guestPhone } : {}),
        },
        theme: { color: "#ff6b00" },
      }, {
        onSuccess: async (response: RazorpayCheckoutResponse) => {
          try {
            const result = await withRazorpayTimeout(
              verifyRazorpayPayment.mutateAsync({
                id: bookingId,
                data: {
                  razorpayOrderId: response.razorpay_order_id || order.orderId,
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
            invalidatePaymentCaches(bookingId);
            if (result.status === "paid") {
              const refreshedBooking = await getBookingById(bookingId);
              if (isBookingConfirmed(refreshedBooking)) {
                setPaymentError(null);
                localStorage.removeItem(bookingIntentKey);
                setLocation("/my-bookings");
              } else {
                setPaymentError("Payment received. Your booking confirmation is still pending. Check payment status again shortly.");
              }
            } else if (result.status === "processing") {
              setPaymentError("Payment is still processing. Check payment status again shortly.");
            } else if (result.status === "refund_required") {
              setPaymentError("Payment was captured after the hold expired and requires a refund review. Your booking was not confirmed.");
            } else {
              setPaymentError(result.message || "Payment was not confirmed. You can safely retry.");
            }
          } catch (error: any) {
            setCheckoutOpen(false);
            setPaymentAttemptActive(false);
            clearCheckoutSession();
            setPaymentError(error?.message || "Payment verification failed. No payment confirmation was recorded.");
            toast.error(error?.message || "Payment verification failed.");
            invalidatePaymentCaches(bookingId);
          }
        },
        onFailure: (error) => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setPaymentError(error.message || "Payment failed. Your payment hold remains pending; you can safely retry.");
        },
        onDismiss: () => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setPaymentError("Payment window closed. Your payment hold remains pending. You can retry before it expires.");
        },
        onTimeout: () => {
          setCheckoutOpen(false);
          setPaymentAttemptActive(false);
          clearCheckoutSession();
           setPaymentError("Razorpay did not report a payment result in time. Refresh payment status before retrying.");
        },
      });
    } catch (error: any) {
      setCheckoutOpen(false);
      setPaymentAttemptActive(false);
      clearCheckoutSession();
      const message = error?.message || "Could not start online payment.";
      if (/expired|payment_hold_expired/i.test(message)) {
        setHoldExpired(true);
        localStorage.removeItem(bookingIntentKey);
        setPaymentError("This payment hold expired. Start again to choose the room and dates again.");
      } else {
        setPaymentError(message);
      }
    }
  };

  const handleCheckPayment = async () => {
    if (!createdBookingId) return;
    setPaymentError(null);
    const result = await paymentStatus.refetch();
    if (result.error) {
      setPaymentError(result.error.message || "Could not refresh payment status.");
      return;
    }
    invalidatePaymentCaches(createdBookingId);
    if (result.data?.status === "paid") {
      const refreshedBooking = await getBookingById(createdBookingId);
      if (isBookingConfirmed(refreshedBooking)) {
        localStorage.removeItem(bookingIntentKey);
        setLocation("/my-bookings");
      } else {
        setPaymentError("Payment received. Your booking confirmation is still pending. Check again shortly.");
      }
    } else if (result.data?.status === "processing") {
      setPaymentError("Payment is still processing. Please check again shortly.");
    } else if (result.data?.status === "refund_required") {
      setPaymentError("Payment was captured after the hold expired and requires a refund review. Your booking was not confirmed.");
    } else if (result.data?.message) {
      setPaymentError(result.data.message);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !guestEmail) return;
    if (bookingCreationLock.current) return;

    if (!isSignedIn) {
      toast.info("Sign in is required before creating a payment hold.");
      goToCustomerSignIn();
      return;
    }
    if (readiness.isLoading) {
      setPaymentError("Checking online payment readiness. Please try again in a moment.");
      return;
    }
    if (!paymentAllowed) {
      setPaymentError(paymentReadinessMessage || "Online payment is not available right now. Please try again later.");
      return;
    }

    bookingCreationLock.current = true;
    setCheckingAccount(true);
    setPaymentError(null);
    setSessionNeedsSignIn(false);
    try {
      // Clerk's header state alone does not establish access to a local
      // account. Check the server session before creating any payment hold.
      await getMe();
      setCheckingAccount(false);
      setEmail(guestEmail);
      const cachedBooking = getCachedBooking();
      if (cachedBooking) {
        setCreatedBookingId(cachedBooking.id);
        setHoldExpiresAt(cachedBooking.paymentHoldExpiresAt ?? null);
        await handleOnlinePayment(cachedBooking.id);
        return;
      }
      const booking = await createBooking.mutateAsync({
        data: {
          propertyId,
          roomId,
          checkIn,
          checkOut,
          guests,
          adults,
          children,
          roomsCount,
          guestName,
          guestEmail,
          guestPhone,
          specialRequests,
          couponCode: appliedCoupon?.code ?? null,
        },
      });
      // Persist the pending hold before launching payment UI so retries and
      // browser closes never create a second inventory reservation.
      const bookingHoldExpiresAt = getPaymentHoldExpiresAt(booking);
      localStorage.setItem(bookingIntentKey, JSON.stringify({
        id: booking.id,
        paymentHoldExpiresAt: bookingHoldExpiresAt,
        bookingRef: booking.bookingRef ?? null,
        guestName,
        guestEmail,
        guestPhone,
        specialRequests,
      }));
      setCreatedBookingId(booking.id);
      setHoldExpiresAt(bookingHoldExpiresAt);
      setHoldExpired(false);
      bookingCreationLock.current = false;
      queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
      await handleOnlinePayment(booking.id);
    } catch (error: unknown) {
      const failure = error as { status?: number; data?: { message?: string }; message?: string };
      const needsSignIn = failure?.status === 401;
      const message = needsSignIn
        ? "Your sign-in session could not be verified. Please sign in again before continuing."
        : failure?.data?.message || failure?.message?.replace(/^HTTP \d+:\s*/, "") ||
          "Could not continue to payment. Please try again.";
      setSessionNeedsSignIn(needsSignIn);
      setPaymentError(message);
      toast.error(message);
    } finally {
      bookingCreationLock.current = false;
      setCheckingAccount(false);
    }
  };

  const handleStartAgain = () => {
    localStorage.removeItem(bookingIntentKey);
    setCreatedBookingId(null);
    setHoldExpiresAt(null);
    setHoldExpired(false);
    setOnlineOrderAmount(null);
    setOnlineOrderMode(null);
    setPaymentError(null);
    bookingCreationLock.current = false;
  };

  const isSubmitting = checkingAccount || createBooking.isPending || paymentAttemptActive || checkoutOpen;

  return (
    <Layout>
      <div className="bg-muted/30 min-h-screen pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-6xl">
          
          <button onClick={() => history.back()} className="flex items-center text-sm font-bold text-secondary mb-8 hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </button>

          <div className="flex items-center gap-4 mb-8">
            <h1 className="text-3xl font-serif font-bold text-secondary">Confirm Your Booking</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Form Section */}
            <div className="lg:col-span-2 space-y-8">
              
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold text-secondary mb-6">Guest Details</h2>
                <form id="booking-form" onSubmit={handleConfirmBooking} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-bold text-secondary mb-1.5 block">Full Name *</label>
                      <Input 
                        required 
                        value={guestName} 
                        onChange={e => setGuestName(e.target.value)} 
                        placeholder="John Doe" 
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-secondary mb-1.5 block">Email Address *</label>
                      <Input 
                        required 
                        type="email" 
                        value={guestEmail} 
                        onChange={e => setGuestEmail(e.target.value)} 
                        placeholder="john@example.com" 
                      />
                      <p className="text-xs text-muted-foreground mt-1">We'll send your confirmation here.</p>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-secondary mb-1.5 block">Phone Number</label>
                      <Input 
                        type="tel" 
                        value={guestPhone} 
                        onChange={e => setGuestPhone(e.target.value)} 
                        placeholder="+91 98765 43210" 
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-secondary mb-1.5 block">Number of Rooms</label>
                      <select 
                        value={roomsCount}
                        onChange={e => setRoomsCount(Number(e.target.value))}
                        className="w-full h-11 border border-input rounded-xl px-3 outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        {Array.from({ length: Math.min(roomAvailability.availableRooms, 5) }).map((_, i) => (
                          <option key={i+1} value={i+1}>{i+1} {i+1 === 1 ? 'Room' : 'Rooms'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-bold text-secondary mb-1.5 block">Special Requests (Optional)</label>
                    <textarea 
                      rows={3} 
                      value={specialRequests}
                      onChange={e => setSpecialRequests(e.target.value)}
                      className="w-full rounded-xl border border-input p-3 outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
                      placeholder="Late check-in, ground floor room, etc."
                    />
                  </div>
                </form>
              </div>

              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-border">
                <h2 className="text-xl font-bold text-secondary mb-6">Payment</h2>
                <div className="bg-muted p-4 rounded-xl flex items-start gap-4 mb-6 border border-border/50">
                  <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-secondary text-sm">Secure Booking</h4>
                    <p className="text-sm text-muted-foreground">Sign in first, then your room is held for 15 minutes while you complete secure online payment.</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-xl bg-accent/20 border-primary">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-primary" />
                      <div>
                        <span className="font-medium text-secondary block">Pay securely online with Razorpay</span>
                        <span className="text-xs text-muted-foreground">Payment is required to confirm this new booking.</span>
                      </div>
                    </div>
                  </div>
                  {!isClerkLoaded ? (
                    <p className="text-xs text-muted-foreground px-1">Checking sign-in status…</p>
                  ) : !isSignedIn ? (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                      <span>Sign in is required before creating a payment hold.</span>
                      <Button type="button" size="sm" variant="outline" onClick={goToCustomerSignIn}>Sign in</Button>
                    </div>
                  ) : null}
                  {readiness.isLoading && (
                    <p className="text-xs text-muted-foreground px-1">Checking payment readiness…</p>
                  )}
                  {!readiness.isLoading && !paymentAllowed && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3" role="status">
                      {paymentReadinessMessage || "Online payment is not available right now. No payment hold will be created."}
                    </div>
                  )}
                  {paymentReadiness?.mode === "test" && paymentAllowed && (
                     <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Test mode: use Razorpay test credentials only. No live charge will be made.</p>
                  )}
                  {onlineOrderMode === "test" && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Test mode: use Razorpay test credentials only. No live charge will be made.</p>
                  )}
                  {onlineOrderAmount !== null && (
                    <p className="text-xs text-muted-foreground px-1">Authoritative amount to pay: <span className="font-bold">{formatPrice(onlineOrderAmount)}</span></p>
                  )}
                  {createdBookingId && holdExpiresAt && !holdExpired && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                      <p className="font-semibold">Payment pending — your room is held for <HoldCountdown expiresAt={holdExpiresAt} onExpired={() => setHoldExpired(true)} />.</p>
                      <p className="mt-1">Complete payment before the hold expires. Your booking reference appears only after payment is captured and the booking is confirmed.</p>
                    </div>
                  )}
                  {holdExpired && (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-900" role="alert">
                      <p className="font-semibold">This payment hold expired.</p>
                      <p className="mt-1">The room is no longer reserved. Start again to create a fresh hold.</p>
                      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={handleStartAgain}>Start again</Button>
                    </div>
                  )}
                  {paymentError && (
                     <div className="text-xs text-destructive bg-red-50 border border-red-100 rounded-lg p-3 space-y-2" role="alert">
                       <p>{paymentError}</p>
                       {sessionNeedsSignIn && (
                         <Button type="button" size="sm" variant="outline" onClick={goToCustomerSignIn}>
                           Sign in again
                         </Button>
                       )}
                       {createdBookingId && (
                         <Button type="button" variant="outline" size="sm" onClick={handleCheckPayment} disabled={paymentStatus.isFetching || checkoutOpen}>
                           {paymentStatus.isFetching && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Check payment status
                         </Button>
                    )}
                     </div>
                   )}
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button 
                  size="lg" 
                  form="booking-form" 
                  type="submit" 
                  className="w-full md:w-auto h-14 px-10 text-lg"
                    disabled={isSubmitting || !isClerkLoaded || !isSignedIn || readiness.isLoading || !paymentAllowed || holdExpired}
                >
                    {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                  ) : (
                      <>Continue to Payment <ChevronRight className="w-5 h-5 ml-1" /></>
                  )}
                </Button>
              </div>
            </div>

            {/* Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden sticky top-32">
                <img src={property.imageUrl} alt={property.name} className="w-full h-48 object-cover" />
                <div className="p-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{property.category}</p>
                  <h3 className="font-serif font-bold text-lg text-secondary mb-1">{property.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{property.area}, {property.city}</p>
                  
                  <div className="flex items-center gap-2 text-sm text-secondary bg-muted p-3 rounded-lg mb-6">
                    <span className="font-bold">{room.name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{adults} Adult{adults === 1 ? "" : "s"}{children > 0 ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-y border-dashed">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Check-in</p>
                      <p className="font-medium">{format(new Date(checkIn), "MMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground">After {property.checkInTime}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Check-out</p>
                      <p className="font-medium">{format(new Date(checkOut), "MMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground">Before {property.checkOutTime}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-bold text-secondary mb-2 flex items-center gap-2">
                      <TicketPercent className="w-4 h-4 text-primary" /> Have a coupon?
                    </h4>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-bold text-green-800">{appliedCoupon.code}</span>
                          <span className="text-xs text-green-700">−{formatPrice(discount)}</span>
                        </div>
                        <button type="button" onClick={handleRemoveCoupon} className="text-green-700 hover:text-green-900" aria-label="Remove coupon">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Input
                            value={couponInput}
                            onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                            placeholder="Enter coupon code"
                            className="uppercase"
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleApplyCoupon}
                            disabled={validateCoupon.isPending || !couponInput.trim()}
                          >
                            {validateCoupon.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                          </Button>
                        </div>
                        {couponError && (
                          <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {couponError}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    <h4 className="font-bold text-secondary">Price Summary</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{formatPrice(roomAvailability.totalPrice)} for {nights} nights × {roomsCount} room(s)</span>
                      <span className="font-medium">{formatPrice(subtotal)}</span>
                    </div>
                    {discount > 0 && appliedCoupon && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-700">Coupon ({appliedCoupon.code})</span>
                        <span className="font-medium text-green-700">−{formatPrice(discount)}</span>
                      </div>
                    )}
                     <div className="flex justify-between text-sm">
                       <span className="text-muted-foreground">Stay total</span>
                       <span className="font-medium">{formatPrice(estimatedTotal)}</span>
                     </div>
                  </div>

                  <div className="pt-4 border-t flex justify-between items-center">
                    <span className="font-bold text-secondary">Total Price</span>
                    <span className="text-2xl font-bold text-primary">{formatPrice(displayedTotal)}</span>
                  </div>
                  
                  {property.freeCancellation && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg flex gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-green-800 leading-relaxed">
                        <span className="font-bold">Free cancellation</span> up to 48 hours before check-in.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Layout>
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    <span className="font-bold tabular-nums">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
