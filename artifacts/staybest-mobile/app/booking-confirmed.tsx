import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import {
  getGetBookingByIdQueryKey,
  getGetRazorpayPaymentStatusQueryKey,
  getGetRazorpayReadinessQueryKey,
  getListBookingsQueryKey,
  useGetBookingById,
  useGetRazorpayPaymentStatus,
  useGetRazorpayReadiness,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import {
  createMobilePaymentSession,
  getHostedPaymentUrl,
  isTerminalPaymentStatus,
  openHostedPayment,
} from '@/utils/razorpayMobile';
import {
  getFriendlyPaymentError,
  getPaymentReadiness,
} from '@/utils/paymentReadiness';

function routeValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type BookingCanonical = {
  status?: string;
  bookingRef?: string | null;
  totalAmount?: number;
  paymentHoldExpiresAt?: string | null;
};

function formatHoldExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function BookingConfirmedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const params = useLocalSearchParams<{
    bookingId?: string | string[];
    paymentChoice?: string | string[];
  }>();
  const bookingId = Number(routeValue(params.bookingId));
  const hasBookingId = Number.isFinite(bookingId) && bookingId > 0;
  const paymentChoice = routeValue(params.paymentChoice);

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [webPolling, setWebPolling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoStarted = useRef(false);

  const {
    data: booking,
    isLoading: bookingLoading,
    isError: bookingError,
    refetch: refetchBooking,
  } = useGetBookingById(bookingId, undefined, {
    query: {
      enabled: isSignedIn && hasBookingId,
      queryKey: getGetBookingByIdQueryKey(bookingId),
    },
  });
  const {
    data: payment,
    isLoading: paymentLoading,
    isError: paymentStatusError,
    refetch: refetchPayment,
  } = useGetRazorpayPaymentStatus(bookingId, {
    query: {
      enabled: isSignedIn && hasBookingId,
      queryKey: getGetRazorpayPaymentStatusQueryKey(bookingId),
    },
  });
  const {
    data: paymentReadiness,
    isLoading: paymentReadinessLoading,
    isError: paymentReadinessError,
    refetch: refetchReadiness,
  } = useGetRazorpayReadiness({
    query: {
      enabled: isSignedIn,
      queryKey: getGetRazorpayReadinessQueryKey(),
      staleTime: 30_000,
    },
  });

  const canonical = booking as unknown as BookingCanonical | undefined;
  const bookingStatus = canonical?.status;
  const bookingRef =
    typeof canonical?.bookingRef === 'string' && canonical.bookingRef.trim()
      ? canonical.bookingRef
      : null;
  const paymentState =
    payment?.status ?? booking?.paymentSummary?.status ?? 'unpaid';
  const isPaid = paymentState === 'paid';
  const isCancelled = bookingStatus === 'cancelled';
  const isExpiredStatus = bookingStatus === 'expired';
  // Confirmed records with references predate the pending-payment flow. Keep
  // them readable even if their legacy payment is still outstanding. A
  // confirmed online-payment booking must also be paid before showing success.
  const paymentProvider =
    payment?.provider ?? booking?.paymentSummary?.provider;
  const isLegacyConfirmed =
    bookingStatus === 'confirmed' &&
    !!bookingRef &&
    !isPaid &&
    paymentProvider !== 'razorpay';
  const isConfirmedBooking =
    bookingStatus === 'confirmed' &&
    !!bookingRef &&
    (isPaid || isLegacyConfirmed);
  const isPendingBooking =
    !isCancelled && !isExpiredStatus && !isConfirmedBooking;
  const holdExpiresAt = canonical?.paymentHoldExpiresAt ?? null;
  const holdExpiryMs = holdExpiresAt ? Date.parse(holdExpiresAt) : NaN;
  const holdExpired =
    isExpiredStatus ||
    (isPendingBooking && Number.isFinite(holdExpiryMs) && now >= holdExpiryMs);
  const readiness = getPaymentReadiness(paymentReadiness);
  const canPay =
    !paymentReadinessLoading &&
    !paymentReadinessError &&
    readiness.allowed;

  useEffect(() => {
    if (!isPendingBooking || !Number.isFinite(holdExpiryMs)) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [holdExpiryMs, isPendingBooking]);

  const refreshCanonical = useCallback(async () => {
    if (!hasBookingId || !isSignedIn) return;
    setRefreshing(true);
    try {
      await Promise.all([refetchBooking(), refetchPayment(), refetchReadiness()]);
      await queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
    } catch {
      setPaymentError('We could not check the latest payment status. Try again.');
    } finally {
      setRefreshing(false);
    }
  }, [
    hasBookingId,
    isSignedIn,
    queryClient,
    refetchBooking,
    refetchPayment,
    refetchReadiness,
  ]);

  const startPayment = useCallback(async () => {
    if (!hasBookingId) {
      setPaymentError('This booking is missing its ID. Open Trips to continue.');
      return;
    }
    if (!isSignedIn) {
      setPaymentError('Please sign in again before starting online payment.');
      return;
    }
    if (isCancelled || holdExpired) {
      setPaymentError(
        isCancelled
          ? 'Cancelled bookings cannot start an online payment.'
          : 'This payment hold has expired. Start a new booking to try again.',
      );
      return;
    }
    if (paymentState === 'paid') {
      await refreshCanonical();
      return;
    }
    if (paymentReadinessLoading) {
      setPaymentError('Checking online payment availability. Please try again.');
      return;
    }
    if (paymentReadinessError || !canPay) {
      setPaymentError(
        readiness.userMessage ||
          'Online payment is temporarily unavailable. Please try again later.',
      );
      return;
    }

    setPaymentError(null);
    setBrowserOpen(true);
    try {
      const session = await createMobilePaymentSession(bookingId);
      const hostedUrl = getHostedPaymentUrl(session.token);
      await openHostedPayment(hostedUrl);
      if (Platform.OS === 'web') {
        setWebPolling(true);
      } else {
        // Closing the system browser is not a payment result. Reconcile with
        // the owner-authenticated endpoint before showing any success state.
        await refreshCanonical();
      }
    } catch (error) {
      setPaymentError(getFriendlyPaymentError(error));
    } finally {
      setBrowserOpen(false);
    }
  }, [
    bookingId,
    canPay,
    hasBookingId,
    holdExpired,
    isCancelled,
    isSignedIn,
    paymentReadinessError,
    paymentReadinessLoading,
    paymentState,
    readiness.userMessage,
    refreshCanonical,
  ]);

  useEffect(() => {
    if (
      paymentChoice !== 'online' ||
      !hasBookingId ||
      !isSignedIn ||
      bookingLoading ||
      paymentLoading ||
      paymentReadinessLoading ||
      autoStarted.current ||
      paymentState === 'paid' ||
      paymentState === 'processing' ||
      paymentState === 'refund_required' ||
      isCancelled ||
      holdExpired
    ) {
      return;
    }
    autoStarted.current = true;
    void startPayment();
  }, [
    bookingLoading,
    hasBookingId,
    holdExpired,
    isCancelled,
    isSignedIn,
    paymentChoice,
    paymentLoading,
    paymentReadinessLoading,
    paymentState,
    startPayment,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web' || !browserOpen) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshCanonical();
    });
    return () => subscription.remove();
  }, [browserOpen, refreshCanonical]);

  useEffect(() => {
    if (!webPolling || Platform.OS !== 'web') return;
    let checks = 0;
    const checkStatus = () => {
      checks += 1;
      void refreshCanonical();
      if (checks >= 24) setWebPolling(false);
    };
    const interval = setInterval(checkStatus, 5000);
    const onFocus = () => void refreshCanonical();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onFocus();
    });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshCanonical, webPolling]);

  useEffect(() => {
    if (isTerminalPaymentStatus(paymentState)) setWebPolling(false);
  }, [paymentState]);

  const amount =
    typeof canonical?.totalAmount === 'number' ? canonical.totalAmount : null;
  const isRazorpayPayment =
    payment?.provider === 'razorpay' ||
    booking?.paymentSummary?.provider === 'razorpay';
  const paymentLabel = isCancelled || holdExpired
    ? 'Payment unavailable'
    : isPaid
      ? isRazorpayPayment
        ? 'Paid online'
        : 'Paid'
      : paymentState === 'processing'
        ? 'Payment pending'
        : paymentState === 'refund_required'
          ? 'Payment needs review'
          : paymentState === 'failed'
            ? 'Payment not completed'
            : isConfirmedBooking
              ? 'Payment pending'
              : 'Complete payment';
  const paymentDescription = isCancelled
    ? 'This reservation was cancelled. Online payment is unavailable.'
    : holdExpired
      ? 'This payment hold expired. Start a new booking to try again.'
      : paymentState === 'refund_required'
        ? 'A payment needs manual review. Do not submit another payment.'
        : isPaid
          ? isRazorpayPayment
            ? 'Your online payment was verified by StayBest.'
            : 'Payment has been recorded for this reservation.'
          : paymentState === 'processing'
            ? 'We are checking Razorpay. You can check again shortly.'
            : isConfirmedBooking
              ? 'Your reservation is confirmed. Complete the outstanding payment when ready.'
              : 'Complete secure online payment before the hold expires.';
  const showPaymentAction =
    hasBookingId &&
    !isPaid &&
    !isCancelled &&
    !holdExpired &&
    paymentState !== 'refund_required';
  const actionDisabled =
    browserOpen ||
    refreshing ||
    paymentLoading ||
    paymentReadinessLoading ||
    paymentReadinessError ||
    !canPay;
  const title = isCancelled
    ? 'Reservation cancelled'
    : holdExpired
      ? 'Payment hold expired'
      : isConfirmedBooking
        ? 'Reservation confirmed'
        : isPaid
          ? 'Payment received'
          : 'Complete your payment';
  const subtitle = isCancelled
    ? 'This booking is no longer active.'
    : holdExpired
      ? 'The room was not confirmed because payment was not captured in time.'
      : isConfirmedBooking
        ? 'Your reservation is confirmed. Payment status is shown below.'
        : isPaid
          ? 'StayBest is finalizing your reservation. This screen will update shortly.'
          : 'Your room is held temporarily. Complete payment to confirm your stay.';
  const iconName = isCancelled
    ? 'x'
    : holdExpired
      ? 'clock'
      : isConfirmedBooking
        ? 'check'
        : isPaid
          ? 'check-circle'
          : 'credit-card';
  const iconColor = isConfirmedBooking ? '#10b981' : colors.primary;
  const showPaidVisual = isPaid && isConfirmedBooking;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.statusIcon,
            {
              backgroundColor: isConfirmedBooking
                ? '#10b981'
                : isCancelled
                  ? colors.destructive
                  : colors.accent,
            },
          ]}
        >
          <Feather name={iconName} size={42} color={isConfirmedBooking || isCancelled ? '#fff' : iconColor} />
        </View>

        <ThemedText type="title" weight="bold" style={styles.title}>
          {bookingLoading ? 'Loading your booking' : title}
        </ThemedText>
        <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
          {bookingLoading
            ? 'StayBest is fetching the latest booking details.'
            : subtitle}
        </ThemedText>

        {isConfirmedBooking && (
          <View style={[styles.refCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText color={colors.mutedForeground}>Booking reference</ThemedText>
            <ThemedText type="subtitle" weight="bold" style={{ marginTop: 8 }}>
              {bookingRef}
            </ThemedText>
            {amount !== null && (
              <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 8 }}>
                Total: ₹{amount.toLocaleString('en-IN')}
              </ThemedText>
            )}
          </View>
        )}

        {isPendingBooking && !holdExpired && holdExpiresAt && Number.isFinite(holdExpiryMs) && (
          <View style={[styles.holdCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <View style={[styles.holdIcon, { backgroundColor: colors.primary }]}>
              <Feather name="clock" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText weight="bold">
                Payment hold: {formatCountdown(holdExpiryMs - now)}
              </ThemedText>
              <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 3 }}>
                Complete payment by {formatHoldExpiry(holdExpiresAt)} to keep this room.
              </ThemedText>
            </View>
          </View>
        )}

        <View style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.paymentHeader}>
            <View style={[styles.paymentIcon, { backgroundColor: showPaidVisual ? '#dcfce7' : colors.accent }]}>
              <Feather
                name={showPaidVisual ? 'check-circle' : 'credit-card'}
                size={20}
                color={showPaidVisual ? '#15803d' : colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText weight="bold">Payment</ThemedText>
              <ThemedText type="caption" color={isPaid ? '#15803d' : colors.primary}>
                {paymentLabel}
              </ThemedText>
            </View>
          </View>
          <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 10 }}>
            {paymentDescription}
          </ThemedText>
          {amount !== null && !isConfirmedBooking && (
            <ThemedText type="caption" weight="bold" style={{ marginTop: 10 }}>
              Total: ₹{amount.toLocaleString('en-IN')}
            </ThemedText>
          )}
          {paymentState === 'refund_required' && (
            <View style={[styles.warning, { backgroundColor: '#fef3c7' }]}>
              <Feather name="alert-triangle" size={16} color="#92400e" />
              <ThemedText type="caption" color="#92400e" style={{ flex: 1 }}>
                Contact StayBest support before trying to pay again.
              </ThemedText>
            </View>
          )}
          {showPaymentAction && (
            <>
              {!canPay && !paymentReadinessLoading && (
                <ThemedText type="caption" color={colors.destructive} style={{ marginTop: 12 }}>
                  {paymentReadinessError
                    ? 'Payment setup could not be checked. Please try again.'
                    : readiness.userMessage}
                </ThemedText>
              )}
              <Pressable
                onPress={() => {
                  if (paymentState === 'processing') {
                    void refreshCanonical();
                  } else {
                    void startPayment();
                  }
                }}
                disabled={actionDisabled}
                style={[
                  styles.paymentButton,
                  { backgroundColor: colors.primary, opacity: actionDisabled ? 0.6 : 1 },
                ]}
              >
                <ThemedText weight="bold" color="#fff">
                  {browserOpen
                    ? 'Opening secure payment...'
                    : refreshing || paymentLoading || paymentReadinessLoading
                      ? 'Checking payment...'
                      : paymentState === 'processing'
                        ? 'Check Payment'
                        : isPendingBooking
                          ? 'Complete payment'
                          : 'Pay online'}
                </ThemedText>
              </Pressable>
            </>
          )}
          {hasBookingId && (
            <Pressable
              onPress={() => void refreshCanonical()}
              disabled={refreshing}
              style={styles.checkButton}
            >
              <ThemedText type="caption" weight="semibold" color={colors.primary}>
                {refreshing ? 'Refreshing…' : 'Refresh booking status'}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {(paymentError || bookingError || (paymentStatusError && hasBookingId)) && (
          <View style={[styles.errorCard, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '55' }]}>
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <ThemedText type="caption" color={colors.destructive} style={{ flex: 1 }}>
              {paymentError ?? 'We could not load this booking. Try refreshing or open Trips.'}
            </ThemedText>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom || 24, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            router.dismissAll();
            router.replace('/(tabs)/trips');
          }}
        >
          <ThemedText weight="bold" color="#fff">View Trips</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          onPress={() => {
            router.dismissAll();
            router.replace('/(tabs)');
          }}
        >
          <ThemedText weight="bold" color={colors.foreground}>Back to Home</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  statusIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 21,
  },
  refCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  holdCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  holdIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentButton: {
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  checkButton: {
    alignItems: 'center',
    paddingTop: 14,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  errorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});