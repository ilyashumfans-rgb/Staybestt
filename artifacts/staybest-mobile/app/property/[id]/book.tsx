import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useGetProperty, getGetPropertyQueryKey, useGetAvailability, getGetAvailabilityQueryKey } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, format, isAfter, isValid, parseISO, startOfDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { DateRangeSelector } from '@/components/DateRangeSelector';

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function initialDates(checkInParam?: string, checkOutParam?: string): [Date, Date] {
  const today = startOfDay(new Date());
  const parsedCheckIn = checkInParam ? startOfDay(parseISO(checkInParam)) : today;
  const checkIn = isValid(parsedCheckIn) && !isAfter(today, parsedCheckIn) ? parsedCheckIn : today;
  const parsedCheckOut = checkOutParam ? startOfDay(parseISO(checkOutParam)) : addDays(checkIn, 2);
  const checkOut = isValid(parsedCheckOut) && isAfter(parsedCheckOut, checkIn)
    ? parsedCheckOut
    : addDays(checkIn, 2);
  return [checkIn, checkOut];
}

export default function BookingFlowScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id, checkIn: checkInParam, checkOut: checkOutParam } = useLocalSearchParams<{
    id: string | string[];
    checkIn?: string | string[];
    checkOut?: string | string[];
  }>();
  const router = useRouter();
  const propertyId = Number(id);

  const initialRange = initialDates(routeParam(checkInParam), routeParam(checkOutParam));
  const [checkIn, setCheckIn] = useState(initialRange[0]);
  const [checkOut, setCheckOut] = useState(initialRange[1]);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [roomsCount, setRoomsCount] = useState(1);
  const guests = adults + children;

  const checkInStr = format(checkIn, 'yyyy-MM-dd');
  const checkOutStr = format(checkOut, 'yyyy-MM-dd');

  const { data: property, isLoading: loadingProp } = useGetProperty(
    propertyId,
    { query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) } }
  );

  const availabilityParams = {
    propertyId,
    checkIn: checkInStr,
    checkOut: checkOutStr,
    guests,
    adults,
    children,
    roomsCount,
  };

  const { data: availabilities, isLoading: loadingAvail } = useGetAvailability(
    availabilityParams,
    { query: { enabled: !!propertyId, queryKey: getGetAvailabilityQueryKey(availabilityParams) } }
  );

  const handleSelectRoom = (roomId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Move to confirm screen, passing data via search params
    router.push({
      pathname: '/property/[id]/confirm',
      params: {
        id: String(propertyId),
        roomId,
        checkIn: checkInStr,
        checkOut: checkOutStr,
        guests,
        adults,
        children,
        roomsCount
      }
    });
  };

  if (loadingProp) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.loadingCenter, { paddingTop: insets.top }]}>
          <ThemedText color={colors.mutedForeground}>Checking availability...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="subtitle" weight="bold" numberOfLines={1}>{property?.name}</ThemedText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        <View style={[styles.guestSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText weight="bold" style={styles.guestSelectorTitle}>Guests & Rooms</ThemedText>
          <GuestCounter label="Adults" hint="Age 13+" value={adults} minimum={1} maximum={10} onChange={setAdults} colors={colors} />
          <GuestCounter label="Children" hint="Age 0–12" value={children} minimum={0} maximum={6} onChange={setChildren} colors={colors} />
          <GuestCounter label="Rooms" hint={`Up to ${Math.max(1, Math.ceil(guests / 2))} suggested`} value={roomsCount} minimum={1} maximum={5} onChange={setRoomsCount} colors={colors} />
        </View>

        <View style={styles.searchSummary}>
          <Pressable
            style={styles.summaryItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDatePickerVisible(true);
            }}
          >
            <ThemedText type="caption" color={colors.mutedForeground}>Dates</ThemedText>
            <View style={styles.dateSummaryRow}>
              <ThemedText weight="semibold" style={{ flex: 1 }}>{format(checkIn, 'MMM d')} - {format(checkOut, 'MMM d')}</ThemedText>
              <Feather name="edit-2" size={15} color={colors.primary} />
            </View>
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <ThemedText type="caption" color={colors.mutedForeground}>Guests</ThemedText>
            <ThemedText weight="semibold">{adults} Adult{adults === 1 ? '' : 's'}, {children} Child{children === 1 ? '' : 'ren'}, {roomsCount} Room{roomsCount === 1 ? '' : 's'}</ThemedText>
          </View>
        </View>

        <View style={styles.content}>
          <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Available Rooms</ThemedText>
          
          {loadingAvail ? (
            <ThemedText color={colors.mutedForeground} style={{ marginTop: 20 }}>Loading rooms...</ThemedText>
          ) : availabilities?.length === 0 ? (
            <View style={styles.noRooms}>
              <Feather name="calendar" size={32} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
              <ThemedText weight="medium">No rooms available</ThemedText>
              <ThemedText color={colors.mutedForeground} type="caption" style={{ textAlign: 'center', marginTop: 4 }}>
                Try changing your dates or guest count.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.roomsList}>
              {availabilities?.map(avail => (
                <View key={avail.room.id} style={[styles.roomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.roomHeader}>
                    <ThemedText weight="bold" style={{ flex: 1 }}>{avail.room.name}</ThemedText>
                  </View>
                  <ThemedText type="caption" color={colors.mutedForeground} style={{ marginBottom: 12 }}>
                    Max {avail.room.maxGuests} guests • {avail.availableRooms} rooms left
                  </ThemedText>
                  
                  <View style={styles.priceRow}>
                    <View>
                      <ThemedText weight="bold" type="subtitle">₹{avail.pricePerNight.toLocaleString()}</ThemedText>
                      <ThemedText type="caption" color={colors.mutedForeground}>/ night</ThemedText>
                      <ThemedText type="caption" weight="medium" style={{ marginTop: 4 }}>
                        Total: ₹{avail.totalPrice.toLocaleString()} ({avail.nights} nights)
                      </ThemedText>
                    </View>
                    
                    <Pressable 
                      style={[styles.selectBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleSelectRoom(avail.room.id)}
                    >
                      <ThemedText weight="bold" color="#fff">Select</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      <DateRangeSelector
        visible={datePickerVisible}
        checkIn={checkIn}
        checkOut={checkOut}
        onCancel={() => setDatePickerVisible(false)}
        onApply={(nextCheckIn, nextCheckOut) => {
          setCheckIn(nextCheckIn);
          setCheckOut(nextCheckOut);
          setDatePickerVisible(false);
        }}
      />
    </ThemedView>
  );
}

function GuestCounter({
  label,
  hint,
  value,
  minimum,
  maximum,
  onChange,
  colors,
}: {
  label: string;
  hint: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.counterRow, { borderTopColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <ThemedText weight="semibold">{label}</ThemedText>
        <ThemedText type="caption" color={colors.mutedForeground}>{hint}</ThemedText>
      </View>
      <Pressable
        disabled={value <= minimum}
        onPress={() => { Haptics.selectionAsync(); onChange(value - 1); }}
        style={[styles.counterButton, { borderColor: colors.border, opacity: value <= minimum ? 0.35 : 1 }]}
      >
        <Feather name="minus" size={18} color={colors.foreground} />
      </Pressable>
      <ThemedText weight="bold" style={styles.counterValue}>{value}</ThemedText>
      <Pressable
        disabled={value >= maximum}
        onPress={() => { Haptics.selectionAsync(); onChange(value + 1); }}
        style={[styles.counterButton, { borderColor: colors.primary, opacity: value >= maximum ? 0.35 : 1 }]}
      >
        <Feather name="plus" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  searchSummary: {
    flexDirection: 'row',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  guestSelector: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  guestSelectorTitle: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  counterRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  counterButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    width: 34,
    textAlign: 'center',
  },
  summaryItem: {
    flex: 1,
  },
  dateSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 16,
  },
  content: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  roomsList: {
    gap: 12,
  },
  roomCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  selectBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  noRooms: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  }
});
