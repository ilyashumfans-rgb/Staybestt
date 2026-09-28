import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import {
  getGetBookingByIdQueryKey,
  getGetRazorpayPaymentStatusQueryKey,
  getListBookingsQueryKey,
  useGetBookingById,
  useGetRazorpayPaymentStatus,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

function routeValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PaymentResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { bookingId: bookingIdParam } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const bookingId = Number(routeValue(bookingIdParam));
  const validBookingId = Number.isFinite(bookingId) && bookingId > 0;
  const [refreshing, setRefreshing] = useState(false);

  const { data: booking, isLoading: bookingLoading, refetch: refetchBooking } = useGetBookingById(
    bookingId,
    undefined,
    {
      query: {
        enabled: isSignedIn && validBookingId,
        queryKey: getGetBookingByIdQueryKey(bookingId),
      },
    },
  );
  const {
    data: payment,
    isLoading: paymentLoading,
    isError: paymentError,
    refetch: refetchPayment,
  } = useGetRazorpayPaymentStatus(bookingId, {
    query: {
      enabled: isSignedIn && validBookingId,
      queryKey: getGetRazorpayPaymentStatusQueryKey(bookingId),
    },
  });

  useEffect(() => {
    if (!isSignedIn || !validBookingId) return;
    setRefreshing(true);
    Promise.all([refetchBooking(), refetchPayment()])
      .then(() => queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }))
      .finally(() => setRefreshing(false));
  }, [
    isSignedIn,
    queryClient,
    refetchBooking,
    refetchPayment,
    validBookingId,
  ]);

  const status = payment?.status ?? booking?.paymentSummary?.status;
  const canonicalStatus = booking?.status;
  const canonicalBookingRef =
    canonicalStatus === 'confirmed' &&
    typeof booking?.bookingRef === 'string' &&
    booking.bookingRef.trim()
      ? booking.bookingRef
      : null;
  const canonicalConfirmedPaid = !!canonicalBookingRef && status === 'paid';
  const statusLabel =
    canonicalConfirmedPaid
      ? 'Paid online'
      : status === 'paid'
        ? 'Payment received — finalizing booking'
      : status === 'processing'
        ? 'Payment pending'
        : status === 'refund_required'
          ? 'Payment needs review'
          : status === 'failed'
            ? 'Payment not completed'
            : 'Payment status unavailable';
  const statusColor =
    canonicalConfirmedPaid
      ? '#15803d'
      : status === 'refund_required' || status === 'failed'
        ? colors.destructive
        : colors.primary;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.icon, { backgroundColor: canonicalConfirmedPaid ? '#dcfce7' : colors.accent }]}>
          {bookingLoading || paymentLoading || refreshing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Feather
              name={canonicalConfirmedPaid ? 'check' : status === 'refund_required' ? 'alert-triangle' : 'credit-card'}
              size={34}
              color={statusColor}
            />
          )}
        </View>
        <ThemedText type="title" weight="bold" style={styles.title}>Payment result</ThemedText>
        <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
          StayBest checked the booking directly. The callback did not claim payment success.
        </ThemedText>

        {!validBookingId ? (
          <ThemedText color={colors.destructive} style={styles.message}>
            This payment callback is missing a valid booking ID.
          </ThemedText>
        ) : !isSignedIn ? (
          <ThemedText color={colors.destructive} style={styles.message}>
            Sign in again to check this booking’s payment status.
          </ThemedText>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {canonicalBookingRef && (
              <>
                <ThemedText color={colors.mutedForeground}>Booking reference</ThemedText>
                <ThemedText weight="bold" style={{ marginTop: 6 }}>{canonicalBookingRef}</ThemedText>
              </>
            )}
            {!canonicalBookingRef && (
              <ThemedText color={colors.mutedForeground}>
                Your booking is waiting for payment confirmation. No booking reference has been issued yet.
              </ThemedText>
            )}
            <ThemedText weight="bold" color={statusColor} style={{ marginTop: 16 }}>{statusLabel}</ThemedText>
            {status === 'refund_required' && (
              <ThemedText type="caption" color={colors.destructive} style={{ marginTop: 8 }}>
                Do not submit another payment. Contact StayBest support for review.
              </ThemedText>
            )}
            {paymentError && (
              <ThemedText type="caption" color={colors.destructive} style={{ marginTop: 8 }}>
                We could not complete the latest status check. Try again.
              </ThemedText>
            )}
            <Pressable
              style={[styles.refreshButton, { borderColor: colors.border }]}
              disabled={refreshing}
              onPress={() => {
                setRefreshing(true);
                Promise.all([refetchBooking(), refetchPayment()])
                  .then(() => queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }))
                  .finally(() => setRefreshing(false));
              }}
            >
              <ThemedText type="caption" weight="semibold" color={colors.primary}>
                {refreshing ? 'Checking…' : 'Check Payment'}
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom || 24, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            router.dismissAll();
            router.replace('/(tabs)/trips');
          }}
        >
          <ThemedText weight="bold" color="#fff">View Trips</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  message: {
    textAlign: 'center',
    marginTop: 24,
  },
  card: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  refreshButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 18,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
