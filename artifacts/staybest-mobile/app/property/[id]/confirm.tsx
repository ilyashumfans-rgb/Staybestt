import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Platform, TextInput, KeyboardAvoidingView } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useCreateBooking,
  useGetAvailability,
  getGetAvailabilityQueryKey,
  getGetRazorpayReadinessQueryKey,
  useGetRazorpayReadiness,
} from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useUser } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import {
  getBookingDraftKey,
  readSavedBooking,
  saveBooking,
  type SavedBooking,
} from '@/utils/bookingDrafts';
import { getPaymentReadiness, PREVIEW_LIVE_PAYMENT_MESSAGE } from '@/utils/paymentReadiness';

export default function ConfirmBookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  
  const propertyId = Number(params.id);
  const roomId = Number(params.roomId);
  const checkIn = params.checkIn as string;
  const checkOut = params.checkOut as string;
  const adults = Number(params.adults) || Number(params.guests) || 2;
  const children = Math.max(0, Number(params.children) || 0);
  const guests = adults + children;
  const roomsCount = Number(params.roomsCount);

  const [guestName, setGuestName] = useState(user?.fullName || '');
  const [guestEmail, setGuestEmail] = useState(user?.primaryEmailAddress?.emailAddress || '');
  const [guestPhone, setGuestPhone] = useState('');

  const { data: property, isLoading: loadingProp } = useGetProperty(
    propertyId,
    { query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) } }
  );

  const availabilityParams = { propertyId, checkIn, checkOut, guests, adults, children, roomsCount };
  const { data: availabilities, isLoading: loadingAvail } = useGetAvailability(
    availabilityParams,
    { query: { enabled: !!propertyId, queryKey: getGetAvailabilityQueryKey(availabilityParams) } }
  );

  const roomAvailability = availabilities?.find(a => a.room.id === roomId);
  const createBooking = useCreateBooking();

  const isFormValid = guestName.trim().length > 0 && guestEmail.trim().length > 3;

  const roomTariff = (roomAvailability?.totalPrice || 0) * roomsCount;
  const totalPayable = roomTariff;
  const [savedBooking, setSavedBooking] = useState<SavedBooking | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [persistingBooking, setPersistingBooking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    data: paymentReadiness,
    isLoading: paymentReadinessLoading,
    isError: paymentReadinessError,
  } = useGetRazorpayReadiness({
    query: {
      queryKey: getGetRazorpayReadinessQueryKey(),
      staleTime: 30_000,
    },
  });
  const readiness = getPaymentReadiness(paymentReadiness);
  const canCreateBooking =
    !isSignedIn ||
    (!paymentReadinessLoading &&
      !paymentReadinessError &&
      readiness.allowed);

  const bookingDraftKey = getBookingDraftKey({
    userId: user?.id ?? '',
    propertyId,
    roomId,
    checkIn,
    checkOut,
    guests,
    adults,
    children,
    roomsCount,
  });

  useEffect(() => {
    let cancelled = false;
    setSavedBooking(null);
    setDraftLoaded(false);
    readSavedBooking(bookingDraftKey)
      .then((booking) => {
        if (!cancelled) setSavedBooking(booking);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('We could not check for an existing booking. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setDraftLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingDraftKey]);

  const openBooking = (booking: SavedBooking) => {
    const routeParams: Record<string, string> = {
      bookingId: String(booking.bookingId),
      totalAmount: String(booking.totalAmount),
    };
    router.replace({
      pathname: '/booking-confirmed',
      params: routeParams,
    });
  };

  const handleConfirm = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }

    setErrorMessage(null);
    if (savedBooking) {
      openBooking(savedBooking);
      return;
    }

    if (paymentReadinessLoading) {
      setErrorMessage('Checking online payment availability. Please try again.');
      return;
    }
    if (paymentReadinessError) {
      setErrorMessage('Payment setup could not be checked. Please try again.');
      return;
    }
    if (!readiness.allowed) {
      setErrorMessage(readiness.userMessage || PREVIEW_LIVE_PAYMENT_MESSAGE);
      return;
    }

    createBooking.mutate(
      {
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
          specialRequests: ''
        }
      },
      {
        onSuccess: (booking) => {
          const saved: SavedBooking = {
            bookingId: booking.id,
            bookingRef:
              typeof booking.bookingRef === 'string' ? booking.bookingRef : null,
            totalAmount: booking.totalAmount,
            status:
              typeof booking.status === 'string'
                ? booking.status
                : 'pending_payment',
            paymentHoldExpiresAt:
              typeof (booking as unknown as { paymentHoldExpiresAt?: unknown })
                .paymentHoldExpiresAt === 'string'
                ? (booking as unknown as { paymentHoldExpiresAt: string })
                    .paymentHoldExpiresAt
                : null,
          };
          setSavedBooking(saved);
          setPersistingBooking(true);
          saveBooking(bookingDraftKey, saved)
            .then(() => {
              openBooking(saved);
            })
            .catch(() => {
              setErrorMessage(
                'Your booking was created, but we could not save it on this device. Open Trips to continue without submitting again.',
              );
            })
            .finally(() => {
              setPersistingBooking(false);
            });
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setErrorMessage('We could not confirm this booking. Check your details and try again.');
        }
      }
    );
  };

  if (loadingProp || loadingAvail) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.loadingCenter, { paddingTop: insets.top }]}>
          <ThemedText color={colors.mutedForeground}>Preparing your booking...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top || 20 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText type="subtitle" weight="bold">Review & Price</ThemedText>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
          
          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Booking Summary</ThemedText>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ThemedText weight="bold" type="subtitle" style={{ marginBottom: 4 }}>{property?.name}</ThemedText>
              <ThemedText type="caption" color={colors.mutedForeground} style={{ marginBottom: 16 }}>
                {property?.area}, {property?.city}
              </ThemedText>
              
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="caption" color={colors.mutedForeground}>Check-in</ThemedText>
                  <ThemedText weight="bold" style={{ marginTop: 4 }}>
                    {checkIn ? format(parseISO(checkIn), 'dd MMM yyyy') : ''}
                  </ThemedText>
                </View>
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <ThemedText type="caption" color={colors.mutedForeground}>Check-out</ThemedText>
                  <ThemedText weight="bold" style={{ marginTop: 4 }}>
                    {checkOut ? format(parseISO(checkOut), 'dd MMM yyyy') : ''}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.guestRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="caption" color={colors.mutedForeground}>Rooms</ThemedText>
                  <ThemedText weight="bold" style={{ marginTop: 4 }}>{roomsCount} Room(s)</ThemedText>
                </View>
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <ThemedText type="caption" color={colors.mutedForeground}>Guests</ThemedText>
                  <ThemedText weight="bold" style={{ marginTop: 4 }}>
                    {adults} Adult{adults === 1 ? '' : 's'}{children > 0 ? `, ${children} Child${children === 1 ? '' : 'ren'}` : ''}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Price Details</ThemedText>
            <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.priceRowItem}>
                <ThemedText color={colors.mutedForeground}>Room total</ThemedText>
                <ThemedText weight="medium">₹{roomTariff.toLocaleString()}</ThemedText>
              </View>
              <View style={styles.priceRowItem}>
                <ThemedText color={colors.mutedForeground}>Taxes & fees</ThemedText>
                <ThemedText weight="medium">Included in total</ThemedText>
              </View>
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <ThemedText weight="bold" type="subtitle">Total Payable</ThemedText>
                <ThemedText weight="bold" type="subtitle" color={colors.primary}>₹{totalPayable.toLocaleString()}</ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Payment</ThemedText>
            <View style={[styles.paymentRequired, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <View style={[styles.paymentIcon, { backgroundColor: colors.primary }]}>
                <Feather name="credit-card" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText weight="semibold">Online payment required</ThemedText>
                <ThemedText type="caption" color={colors.mutedForeground}>
                  Your room will be held briefly while you complete secure payment.
                </ThemedText>
              </View>
            </View>
            {!paymentReadinessLoading && !readiness.allowed && (
              <ThemedText type="caption" color={colors.destructive} style={{ marginTop: 8 }}>
                {paymentReadinessError
                  ? 'Payment setup could not be checked. Please try again.'
                  : readiness.userMessage}
              </ThemedText>
            )}
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Guest Details</ThemedText>
            
            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Full Name"
                placeholderTextColor={colors.mutedForeground}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                value={guestEmail}
                onChangeText={setGuestEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Email Address"
                placeholderTextColor={colors.mutedForeground}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                value={guestPhone}
                onChangeText={setGuestPhone}
                keyboardType="phone-pad"
                placeholder="Phone Number (Optional)"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>

          {errorMessage && (
            <View style={[styles.errorCard, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '55' }]}>
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <ThemedText type="caption" color={colors.destructive} style={{ flex: 1 }}>{errorMessage}</ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom || 24 }]}>
          <Pressable 
            style={[
              styles.bookBtn, 
              { backgroundColor: colors.primary },
               (!isFormValid ||
                 createBooking.isPending ||
                 persistingBooking ||
                 !draftLoaded ||
                 (isSignedIn && paymentReadinessLoading) ||
                 !canCreateBooking) && { opacity: 0.6 }
            ]}
            onPress={handleConfirm}
             disabled={
               !isFormValid ||
               createBooking.isPending ||
               persistingBooking ||
               !draftLoaded ||
               (isSignedIn && paymentReadinessLoading) ||
               !canCreateBooking
             }
          >
            <ThemedText weight="bold" color="#fff">
              {createBooking.isPending || persistingBooking
                ? 'Confirming...'
                : !draftLoaded
                  ? 'Checking booking...'
                   : isSignedIn && paymentReadinessLoading
                     ? 'Checking payment...'
                     : savedBooking
                       ? 'Continue to payment'
                       : 'Continue to payment'}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function PaymentChoice({
  selected,
  title,
  description,
  icon,
  colors,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.paymentChoice,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={[styles.paymentIcon, { backgroundColor: selected ? colors.primary : colors.secondary }]}>
        <Feather name={icon} size={18} color={selected ? '#fff' : colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText weight="semibold">{title}</ThemedText>
        <ThemedText type="caption" color={colors.mutedForeground}>{description}</ThemedText>
      </View>
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.mutedForeground }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backBtn: { padding: 8, marginRight: 8 },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { marginBottom: 12 },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  dateRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  guestRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  priceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    gap: 12,
  },
  priceRowItem: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  form: { gap: 12 },
  paymentRequired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_400Regular',
    borderWidth: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  bookBtn: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});