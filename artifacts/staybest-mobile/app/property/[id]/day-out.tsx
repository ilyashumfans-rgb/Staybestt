import React, { useState } from 'react';
import { View, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays } from 'date-fns';
import { useGetDayOutQuote, getGetDayOutQuoteQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';

export default function DayOutBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [guests, setGuests] = useState(1);
  const params = { propertyId: Number(id), date, guests };
  const quote = useGetDayOutQuote(params, { query: {
    queryKey: getGetDayOutQuoteQueryKey(params), enabled: /^\d{4}-\d{2}-\d{2}$/.test(date), retry: false,
  } });
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.background }}
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 24), paddingBottom: insets.bottom + 34, gap: 24 }}>
    <Pressable onPress={() => router.back()}><ThemedText color={colors.primary}>Back</ThemedText></Pressable>
    <ThemedText type="subtitle" weight="bold">Book Day Out Today</ThemedText>
    <ThemedText>No room or overnight stay. Price is per person.</ThemedText>
    <ThemedText weight="bold">Visit date</ThemedText>
    <TextInput accessibilityLabel="Visit date YYYY-MM-DD" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
      placeholderTextColor={colors.mutedForeground}
      style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, padding: 16, borderRadius: 12 }} />
    <View style={{ flexDirection: 'row', gap: 24 }}>
      {[0, 1].map(offset => <Pressable key={offset} onPress={() => setDate(format(addDays(new Date(), offset), 'yyyy-MM-dd'))}>
        <ThemedText color={colors.primary}>{offset === 0 ? 'Today' : 'Tomorrow'}</ThemedText>
      </Pressable>)}
    </View>
    <ThemedText weight="bold">Guests</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
      <Pressable accessibilityLabel="Remove guest" onPress={() => setGuests(Math.max(1, guests - 1))} style={{ padding: 16 }}><ThemedText>−</ThemedText></Pressable>
      <ThemedText>{guests}</ThemedText>
      <Pressable accessibilityLabel="Add guest" onPress={() => setGuests(Math.min(100, guests + 1))} style={{ padding: 16 }}><ThemedText>+</ThemedText></Pressable>
    </View>
    {quote.isFetching && <ThemedText>Checking price…</ThemedText>}
    {quote.isError && <ThemedText>{(quote.error as { data?: { message?: string } }).data?.message ?? 'Could not load the price. Check the visit date and try again.'}</ThemedText>}
    {quote.data && !quote.isError && <>
      <ThemedText>₹{quote.data.pricePerPerson.toLocaleString('en-IN')} × {guests} guests</ThemedText>
      <ThemedText>GST {quote.data.gstRateBps / 100}% ({quote.data.gstMode === 'inclusive' ? 'included' : 'added'})</ThemedText>
      <ThemedText weight="bold">Total ₹{quote.data.totalPrice.toLocaleString('en-IN')}</ThemedText>
    </>}
    <Pressable disabled={!quote.data || quote.isFetching || quote.isError || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
      onPress={() => router.push({ pathname: '/property/[id]/confirm', params: { id, dayOut: 'true', checkIn: date, checkOut: date, adults: String(guests), children: '0', roomsCount: '0' } })}
      style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 18, opacity: quote.data && !quote.isError ? 1 : 0.5 }}>
      <ThemedText weight="bold">Continue to booking</ThemedText>
    </Pressable>
  </ScrollView>;
}
