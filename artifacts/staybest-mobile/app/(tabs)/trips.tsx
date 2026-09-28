import React from 'react';
import { StyleSheet, View, Image, Pressable, ScrollView, Platform, Alert } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  useListBookings,
  getListBookingsQueryKey,
  useCancelBooking,
  getGetRazorpayReadinessQueryKey,
  useGetRazorpayReadiness,
  type Booking,
} from '@workspace/api-client-react';
import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { getImageUrl } from '@/utils/images';
import { format, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { getPaymentReadiness } from '@/utils/paymentReadiness';

function paymentSummaryLabel(booking: Booking): string {
  const status = booking.paymentSummary?.status;
  if (status === 'paid') {
    return booking.paymentSummary?.provider === 'razorpay' ? 'Paid online' : 'Paid';
  }
  if (status === 'processing') return 'Payment pending';
  if (status === 'failed') return 'Payment not completed';
  if (status === 'refund_required') return 'Payment needs review';
  return booking.status === 'pending_payment'
    ? 'Complete payment'
    : 'Payment pending';
}

function paymentSummaryColor(booking: Booking, colors: ReturnType<typeof useColors>): string {
  const status = booking.paymentSummary?.status;
  if (status === 'paid') return '#15803d';
  if (status === 'refund_required' || status === 'failed') return colors.destructive;
  return colors.primary;
}

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useListBookings(
    {}, // API handles email via token if authenticated
    { query: { enabled: !!isSignedIn, queryKey: getListBookingsQueryKey() } }
  );
  const { data: paymentReadiness, isLoading: paymentReadinessLoading, isError: paymentReadinessError } =
    useGetRazorpayReadiness({
      query: {
        enabled: !!isSignedIn,
        queryKey: getGetRazorpayReadinessQueryKey(),
        staleTime: 30_000,
      },
    });
  const readiness = getPaymentReadiness(paymentReadiness);
  const canPay =
    !paymentReadinessLoading && !paymentReadinessError && readiness.allowed;

  const cancelBooking = useCancelBooking();

  const paddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top + 20;
  const paddingBottom = Platform.OS === 'web' ? 84 + 20 : 100;

  if (!isSignedIn) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.centerContent, { paddingTop }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
            <Feather name="briefcase" size={32} color={colors.primary} />
          </View>
          <ThemedText type="title" weight="bold" style={styles.title}>Your Trips</ThemedText>
          <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
            Sign in to view your upcoming weekend escapes and past stays.
          </ThemedText>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/sign-in')}
          >
            <ThemedText weight="semibold" color="#fff">Sign In</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const handleCancel = (bookingId: number, bookingRef: string | null) => {
    if (!bookingRef) return;
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking? This action cannot be undone.",
      [
        { text: "Keep Booking", style: "cancel" },
        { 
          text: "Cancel Booking", 
          style: "destructive",
          onPress: () => {
            cancelBooking.mutate(
              { id: bookingId, data: { email: user?.primaryEmailAddress?.emailAddress || '', bookingRef } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
                }
              }
            );
          }
        }
      ]
    );
  };

  const pendingBookings = bookings?.filter(b => b.status === 'pending_payment') || [];
  const activeBookings = bookings?.filter(b => b.status === 'confirmed') || [];
  const pastBookings = bookings?.filter(
    b => b.status !== 'confirmed' && b.status !== 'pending_payment',
  ) || [];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop, paddingBottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="title" weight="bold">Trips</ThemedText>
        </View>

        {isLoading ? (
          <View style={styles.centerContent}>
            <ThemedText color={colors.mutedForeground}>Loading trips...</ThemedText>
          </View>
        ) : bookings?.length === 0 ? (
          <View style={[styles.centerContent, { marginTop: 40 }]}>
            <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
              <Feather name="map" size={32} color={colors.primary} />
            </View>
            <ThemedText type="subtitle" weight="semibold" style={styles.title}>No trips booked... yet!</ThemedText>
            <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
              Time to dust off your bags and start planning your next great adventure.
            </ThemedText>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.foreground }]}
              onPress={() => router.push('/search')}
            >
              <ThemedText weight="semibold" color={colors.background}>Start Exploring</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {pendingBookings.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Payment required</ThemedText>
                {pendingBookings.map(booking => (
                  <View key={booking.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Image source={{uri: getImageUrl(booking.propertyImageUrl)}} style={styles.cardImage} />
                    <View style={styles.cardContent}>
                      <View>
                        <ThemedText weight="bold" numberOfLines={1}>{booking.propertyName}</ThemedText>
                        <ThemedText type="caption" color={colors.mutedForeground}>{booking.propertyCity}</ThemedText>
                      </View>
                      <View style={styles.dateRow}>
                        <Feather name="calendar" size={14} color={colors.primary} />
                        <ThemedText type="caption" weight="medium">
                          {format(parseISO(booking.checkIn), 'MMM d')} - {format(parseISO(booking.checkOut), 'MMM d, yyyy')}
                        </ThemedText>
                      </View>
                      <View style={styles.cardFooter}>
                        <View>
                          <ThemedText type="caption" color={colors.primary} weight="semibold">
                            Payment hold — booking reference pending
                          </ThemedText>
                          <ThemedText type="caption" weight="bold">₹{booking.totalAmount.toLocaleString()}</ThemedText>
                        </View>
                      </View>
                      <View style={[styles.paymentRow, { borderTopColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="caption" color={colors.mutedForeground}>Payment</ThemedText>
                          <ThemedText type="caption" weight="semibold" color={paymentSummaryColor(booking, colors)}>
                            {paymentSummaryLabel(booking)}
                          </ThemedText>
                        </View>
                        <Pressable
                          disabled={paymentReadinessLoading || paymentReadinessError || !canPay}
                          style={[styles.paymentBtn, { borderColor: colors.primary, opacity: canPay ? 1 : 0.55 }]}
                          onPress={() => router.push({
                            pathname: '/booking-confirmed',
                            params: {
                              bookingId: String(booking.id),
                              totalAmount: String(booking.totalAmount),
                            },
                          })}
                        >
                          <ThemedText type="caption" weight="semibold" color={colors.primary}>
                            {paymentReadinessLoading ? 'Checking…' : canPay ? 'Pay now' : 'Payment unavailable'}
                          </ThemedText>
                        </Pressable>
                      </View>
                      {!canPay && !paymentReadinessLoading && (
                        <ThemedText type="caption" color={colors.destructive}>
                          {paymentReadinessError
                            ? 'Payment setup could not be checked. Please try again.'
                            : readiness.userMessage}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeBookings.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Upcoming</ThemedText>
                {activeBookings.map(booking => (
                  <View key={booking.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Image source={{uri: getImageUrl(booking.propertyImageUrl)}} style={styles.cardImage} />
                    <View style={styles.cardContent}>
                      <View>
                        <ThemedText weight="bold" numberOfLines={1}>{booking.propertyName}</ThemedText>
                        <ThemedText type="caption" color={colors.mutedForeground}>{booking.propertyCity}</ThemedText>
                      </View>
                      <View style={styles.dateRow}>
                        <Feather name="calendar" size={14} color={colors.primary} />
                        <ThemedText type="caption" weight="medium">
                          {format(parseISO(booking.checkIn), 'MMM d')} - {format(parseISO(booking.checkOut), 'MMM d, yyyy')}
                        </ThemedText>
                      </View>
                      <View style={styles.cardFooter}>
                        <View>
                          {booking.status === 'confirmed' && booking.bookingRef && (
                            <ThemedText type="caption" color={colors.mutedForeground}>Ref: {booking.bookingRef}</ThemedText>
                          )}
                          <ThemedText type="caption" weight="bold">₹{booking.totalAmount.toLocaleString()}</ThemedText>
                        </View>
                        <Pressable 
                          style={[styles.cancelBtn, { borderColor: colors.destructive }]}
                          onPress={() => handleCancel(booking.id, booking.bookingRef)}
                        >
                          <ThemedText type="caption" color={colors.destructive} weight="medium">Cancel</ThemedText>
                        </Pressable>
                      </View>
                      <View style={[styles.paymentRow, { borderTopColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="caption" color={colors.mutedForeground}>Payment</ThemedText>
                          <ThemedText
                            type="caption"
                            weight="semibold"
                            color={paymentSummaryColor(booking, colors)}
                          >
                            {paymentSummaryLabel(booking)}
                          </ThemedText>
                        </View>
                        {booking.paymentSummary?.status !== 'paid' && (
                          <Pressable
                            disabled={paymentReadinessLoading || paymentReadinessError || !canPay}
                            style={[styles.paymentBtn, { borderColor: colors.primary }]}
                            onPress={() => router.push({
                              pathname: '/booking-confirmed',
                              params: {
                                bookingId: String(booking.id),
                                totalAmount: String(booking.totalAmount),
                              },
                            })}
                          >
                            <ThemedText type="caption" weight="semibold" color={colors.primary}>
                              {paymentReadinessLoading
                                ? 'Checking…'
                                : !canPay
                                  ? 'Payment unavailable'
                                  : booking.paymentSummary?.status === 'processing' || booking.paymentSummary?.status === 'refund_required'
                                ? 'Check Payment'
                                : 'Pay now'}
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {pastBookings.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Past & Cancelled</ThemedText>
                {pastBookings.map(booking => (
                  <View key={booking.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.8 }]}>
                    <View style={styles.cardContent}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <ThemedText weight="bold" numberOfLines={1}>{booking.propertyName}</ThemedText>
                          <ThemedText type="caption" color={colors.mutedForeground}>
                            {format(parseISO(booking.checkIn), 'MMM d, yyyy')}
                          </ThemedText>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: booking.status === 'cancelled' ? colors.destructive + '20' : colors.accent }]}>
                           <ThemedText type="caption" weight="semibold" color={booking.status === 'cancelled' || booking.status === 'expired' ? colors.destructive : colors.primary} style={{ textTransform: 'capitalize' }}>
                             {booking.status === 'expired' ? 'Payment hold expired' : booking.status}
                          </ThemedText>
                        </View>
                      </View>
                      {booking.status === 'expired' && (
                        <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 8 }}>
                          Payment was not captured before the hold expired. This stay was not booked.
                        </ThemedText>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  list: {
    paddingHorizontal: 24,
    gap: 32,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardContent: {
    padding: 16,
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  paymentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  }
});
