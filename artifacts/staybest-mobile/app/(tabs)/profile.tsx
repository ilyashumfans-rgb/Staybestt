import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Platform,
  Image,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useGetMe,
  useUpdateMe,
  useListBookings,
  useCancelBooking,
  useListNotifications,
  useMarkNotificationRead,
  useGetNotificationPreferences,
  useUpdateNotificationPreferences,
  useRegisterExpoDevice,
  useUnregisterExpoDevice,
  useListMyReferralRewards,
  useCreateMyReferralCode,
  useGetMyReferralCode,
  useListEligibleReferralPrograms,
  getListNotificationsQueryKey,
  getGetNotificationPreferencesQueryKey,
  getListMyReferralRewardsQueryKey,
  getGetMyReferralCodeQueryKey,
  getListEligibleReferralProgramsQueryKey,
  getGetMeQueryKey,
  getListBookingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getImageUrl } from '@/utils/images';
import { format, parseISO } from 'date-fns';
import { getPushToken } from '@/utils/notificationService';
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from '@/utils/secureStorage';

const EXPO_DEVICE_TOKEN_KEY = 'staybest.expo-device-token';

type SectionId =
  | 'menu'
  | 'profile'
  | 'upcoming'
  | 'history'
  | 'ai'
  | 'notifications'
  | 'referrals'
  | 'password'
  | 'help'
  | 'contact'
  | 'faq'
  | 'privacy'
  | 'terms';

const MENU: { id: Exclude<SectionId, 'menu'> | 'wishlist' | 'logout'; label: string; icon: any; group?: string }[] = [
  { id: 'profile', label: 'Edit Profile', icon: 'user', group: 'Account' },
  { id: 'upcoming', label: 'Upcoming Bookings', icon: 'calendar' },
  { id: 'history', label: 'Booking History', icon: 'clock' },
  { id: 'wishlist', label: 'Wishlist', icon: 'heart' },
  { id: 'ai', label: 'AI Preferences', icon: 'zap', group: 'Settings' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'referrals', label: 'Refer & Earn', icon: 'gift' },
  { id: 'password', label: 'Change Password', icon: 'key' },
  { id: 'help', label: 'Help & Support', icon: 'life-buoy', group: 'Support' },
  { id: 'contact', label: 'Contact Us', icon: 'phone' },
  { id: 'faq', label: 'FAQ', icon: 'help-circle' },
  { id: 'privacy', label: 'Privacy Policy', icon: 'shield', group: 'Legal' },
  { id: 'terms', label: 'Terms & Conditions', icon: 'file-text' },
  { id: 'logout', label: 'Logout', icon: 'log-out', group: ' ' },
];

const CATEGORIES = ['luxury', 'prime', 'budget', 'package'];

const TRAVEL_STYLES = [
  { value: 'relaxation', label: 'Relaxation & Wellness' },
  { value: 'adventure', label: 'Adventure & Outdoors' },
  { value: 'family', label: 'Family Trips' },
  { value: 'romantic', label: 'Romantic Getaways' },
  { value: 'business', label: 'Business Travel' },
];

const BUDGETS = [
  { value: 'under-3000', label: 'Under ₹3,000' },
  { value: '3000-8000', label: '₹3,000 – ₹8,000' },
  { value: '8000-15000', label: '₹8,000 – ₹15,000' },
  { value: 'above-15000', label: 'Above ₹15,000' },
];

const FAQS = [
  { q: 'How do I cancel a booking?', a: "Open Upcoming Bookings and press Cancel on the booking. Hotels with free cancellation can be cancelled any time before check-in; other hotels allow cancellation up to 48 hours before check-in." },
  { q: 'Do I need an account to book?', a: 'No — you can book as a guest with your email. An account lets you track bookings, save wishlists, and get personalized recommendations.' },
  { q: 'When is my payment charged?', a: 'New bookings remain pending until online payment is captured. Trips shows the verified payment status and any payment hold expiry.' },
  { q: 'Can I change my booking dates?', a: "Cancel the existing booking (subject to the hotel's policy) and book again with new dates, or contact our support team for help." },
  { q: 'How do I become a StayBest partner?', a: 'Email hello@staybestt.com and our team will onboard your property.' },
];

const SECTION_TITLES: Record<Exclude<SectionId, 'menu'>, string> = {
  profile: 'Edit Profile',
  upcoming: 'Upcoming Bookings',
  history: 'Booking History',
  ai: 'AI Preferences',
  notifications: 'Notifications',
  referrals: 'Refer & Earn',
  password: 'Change Password',
  help: 'Help & Support',
  contact: 'Contact Us',
  faq: 'FAQ',
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
};

function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Keep', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SectionId>('menu');
  const [name, setName] = useState('');
  const [prefs, setPrefs] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (params.section === 'notifications' && isSignedIn) {
      setSection('notifications');
    }
  }, [isSignedIn, params.section]);

  const { data: me, isLoading: meLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn },
  });
  const updateMe = useUpdateMe();
  const { data: bookings, isLoading: bookingsLoading } = useListBookings(
    {},
    { query: { queryKey: getListBookingsQueryKey(), enabled: !!isSignedIn } },
  );
  const cancelBooking = useCancelBooking();
  const { data: notifications, isLoading: notificationsLoading } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: !!isSignedIn },
  });
  const markNotificationRead = useMarkNotificationRead();
  const { data: notificationPreferences } = useGetNotificationPreferences({
    query: { queryKey: getGetNotificationPreferencesQueryKey(), enabled: !!isSignedIn },
  });
  const updateNotificationPreferences = useUpdateNotificationPreferences();
  const registerDevice = useRegisterExpoDevice();
  const unregisterDevice = useUnregisterExpoDevice();
  const { data: referralRewards, isLoading: rewardsLoading } = useListMyReferralRewards({
    query: { queryKey: getListMyReferralRewardsQueryKey(), enabled: !!isSignedIn },
  });
  const createReferralCode = useCreateMyReferralCode();
  const { data: myReferralCode, isLoading: referralCodeLoading } = useGetMyReferralCode({
    query: { queryKey: getGetMyReferralCodeQueryKey(), enabled: !!isSignedIn },
  });
  const { data: eligibleReferralPrograms, isLoading: referralProgramsLoading } = useListEligibleReferralPrograms({
    query: { queryKey: getListEligibleReferralProgramsQueryKey(), enabled: !!isSignedIn },
  });
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPrefs(me.preferences ?? {});
    }
  }, [me]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const paddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top + 20;
  const paddingBottom = Platform.OS === 'web' ? 84 + 20 : 100;

  const savePrefs = (next: Record<string, any>, message = 'Preferences saved') => {
    setPrefs(next);
    updateMe.mutate(
      { data: { preferences: next } },
      {
        onSuccess: () => {
          setStatus(message);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: () => setStatus('Failed to save'),
      },
    );
  };

  const saveName = () => {
    if (!name.trim()) return;
    updateMe.mutate(
      { data: { name: name.trim() } },
      {
        onSuccess: () => {
          setStatus('Profile updated');
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: () => setStatus('Failed to update'),
      },
    );
  };

  const handleCancelBooking = async (id: number, bookingRef: string | null) => {
    if (!me || !bookingRef) return;
    const ok = await confirmAsync(
      'Cancel Booking',
      "Cancel this booking? Cancellation is subject to the hotel's policy.",
      'Cancel Booking',
    );
    if (!ok) return;
    cancelBooking.mutate(
      { id, data: { email: me.email, bookingRef } },
      {
        onSuccess: () => {
          setStatus('Booking cancelled');
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        },
        onError: (err: any) =>
          setStatus(err?.response?.data?.message || err?.message || 'Cancellation not allowed'),
      },
    );
  };

  const handleSignOut = async () => {
    const ok = await confirmAsync('Log Out', 'Are you sure you want to log out?', 'Log Out');
    if (ok) signOut();
  };

  // ----- Signed out -----
  if (!isSignedIn) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingTop, paddingBottom }} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="title" weight="bold">Profile</ThemedText>
          </View>
          <View style={styles.guestSection}>
            <ThemedText type="subtitle" weight="bold" style={{ marginBottom: 8 }}>Join the Club</ThemedText>
            <ThemedText color={colors.mutedForeground} style={{ marginBottom: 24 }}>
              Sign in to manage your profile, bookings, and preferences.
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => router.push('/sign-in')}
              >
                <ThemedText weight="semibold" color="#fff" style={{ textAlign: 'center' }}>Log In</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flex: 1 }]}
                onPress={() => router.push('/sign-up')}
              >
                <ThemedText weight="semibold" color={colors.foreground} style={{ textAlign: 'center' }}>Sign Up</ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (bookings ?? []).filter(
    (b) => b.status === 'pending_payment' || (b.status === 'confirmed' && b.checkOut >= today),
  );
  const upcomingIds = new Set(upcoming.map((b) => b.id));
  const history = (bookings ?? []).filter((b) => !upcomingIds.has(b.id));

  const Chip = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <ThemedText type="caption" weight="medium" color={selected ? '#fff' : colors.foreground} style={{ textTransform: 'capitalize' }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const Toggle = ({ id, label, desc }: { id: string; label: string; desc: string }) => (
    <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <ThemedText weight="semibold">{label}</ThemedText>
        <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 2 }}>{desc}</ThemedText>
      </View>
      <Switch
        value={prefs[id] !== false}
        onValueChange={(v) => savePrefs({ ...prefs, [id]: v }, v ? 'Notifications on' : 'Notifications off')}
        trackColor={{ true: colors.primary }}
      />
    </View>
  );

  const setPush = async (enabled: boolean) => {
    if (!enabled) {
      try {
        const token = await getSecureItem(EXPO_DEVICE_TOKEN_KEY);
        if (token) {
          await new Promise<void>((resolve, reject) => unregisterDevice.mutate(
            { data: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } },
            { onSuccess: () => resolve(), onError: reject },
          ));
          await deleteSecureItem(EXPO_DEVICE_TOKEN_KEY);
        }
        await new Promise<void>((resolve, reject) => updateNotificationPreferences.mutate(
          { data: { pushEnabled: false } },
          { onSuccess: () => resolve(), onError: reject },
        ));
        queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
        setStatus('Push notifications disabled');
      } catch {
        setStatus('Could not remove this device from push notifications');
      }
      return;
    }
    try {
      const { token, error } = await getPushToken();
      if (!token) {
        setStatus(error);
        return;
      }
      await new Promise<void>((resolve, reject) => registerDevice.mutate(
        { data: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } },
        { onSuccess: () => resolve(), onError: reject },
      ));
      try {
        await setSecureItem(EXPO_DEVICE_TOKEN_KEY, token);
      } catch {
        await new Promise<void>((resolve) => unregisterDevice.mutate(
          { data: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } },
          { onSuccess: () => resolve(), onError: () => resolve() },
        ));
        setStatus('Push setup could not securely store this device token');
        return;
      }
      updateNotificationPreferences.mutate({ data: { pushEnabled: true } }, {
        onSuccess: () => {
          setStatus('Push notifications enabled');
          queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
        },
        onError: () => setStatus('Device registered, but preference was not saved'),
      });
    } catch {
      setStatus('Push provider is unavailable. Notifications were not enabled.');
    }
  };

  const updateMarketing = (marketingEnabled: boolean) => updateNotificationPreferences.mutate(
    { data: { marketingEnabled } },
    {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() }),
      onError: () => setStatus('Failed to update marketing preference'),
    },
  );

  const BookingList = ({ items, empty, allowCancel }: { items: NonNullable<typeof bookings>; empty: string; allowCancel?: boolean }) => (
    <View style={{ gap: 16 }}>
      {bookingsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Feather name="calendar" size={28} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
          <ThemedText color={colors.mutedForeground} style={{ textAlign: 'center' }}>{empty}</ThemedText>
        </View>
      ) : (
        items.map((b) => {
          const cancelled = b.status === 'cancelled' || b.status === 'expired';
          const pendingPayment = b.status === 'pending_payment';
          return (
            <View key={b.id} style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {!!b.propertyImageUrl && (
                <Image source={{ uri: getImageUrl(b.propertyImageUrl) }} style={styles.bookingImage} />
              )}
              <View style={{ padding: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText weight="bold" numberOfLines={1}>{b.propertyName}</ThemedText>
                    <ThemedText type="caption" color={colors.mutedForeground}>
                      {b.propertyCity} • {b.roomName}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: cancelled ? colors.destructive + '20' : colors.accent },
                    ]}
                  >
                    <ThemedText
                      type="caption"
                      weight="semibold"
                      color={cancelled ? colors.destructive : colors.primary}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {b.status === 'expired' ? 'Payment hold expired' : b.status}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="caption">
                  {format(parseISO(b.checkIn), 'dd MMM yyyy')} → {format(parseISO(b.checkOut), 'dd MMM yyyy')} • {b.guests}{' '}
                  {b.guests === 1 ? 'guest' : 'guests'}
                </ThemedText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    {b.status === 'confirmed' && b.bookingRef && (
                      <ThemedText type="caption" color={colors.mutedForeground}>Ref: {b.bookingRef}</ThemedText>
                    )}
                    {pendingPayment && (
                      <ThemedText type="caption" color={colors.primary} weight="semibold">
                        Payment required — reference pending
                      </ThemedText>
                    )}
                    <ThemedText type="caption" weight="bold">₹{b.totalAmount.toLocaleString('en-IN')}</ThemedText>
                  </View>
                  {allowCancel && b.status === 'confirmed' && b.bookingRef && (
                    <Pressable
                      style={[styles.cancelBtn, { borderColor: colors.destructive }]}
                      disabled={cancelBooking.isPending}
                      onPress={() => handleCancelBooking(b.id, b.bookingRef)}
                    >
                      <ThemedText type="caption" weight="medium" color={colors.destructive}>Cancel Booking</ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>
              {b.status === 'expired' && (
                <ThemedText type="caption" color={colors.mutedForeground} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  Payment was not captured before the hold expired. This stay was not booked.
                </ThemedText>
              )}
            </View>
          );
        })
      )}
      {allowCancel && (
        <ThemedText type="caption" color={colors.mutedForeground}>
          Cancellations are subject to hotel policy: hotels with free cancellation can be cancelled until check-in; others allow cancellation up to 48 hours before check-in.
        </ThemedText>
      )}
    </View>
  );

  const Paragraph = ({ children }: { children: React.ReactNode }) => (
    <ThemedText type="caption" color={colors.mutedForeground} style={{ lineHeight: 20 }}>{children}</ThemedText>
  );

  const renderSection = () => {
    if (meLoading && section !== 'menu') {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
    }
    switch (section) {
      case 'profile':
        return (
          <View style={{ gap: 16 }}>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 6 }}>Full Name</ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 6 }}>Email</ThemedText>
              <TextInput
                value={me?.email ?? ''}
                editable={false}
                style={[styles.input, { borderColor: colors.border, color: colors.mutedForeground, backgroundColor: colors.accent }]}
              />
              <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 6 }}>
                Email is managed by your sign-in account.
              </ThemedText>
            </View>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.primary, opacity: updateMe.isPending ? 0.6 : 1 }]}
              disabled={updateMe.isPending}
              onPress={saveName}
            >
              <ThemedText weight="semibold" color="#fff" style={{ textAlign: 'center' }}>
                {updateMe.isPending ? 'Saving...' : 'Save Changes'}
              </ThemedText>
            </Pressable>
          </View>
        );
      case 'upcoming':
        return <BookingList items={upcoming} empty="No upcoming bookings. Time to plan your next getaway!" allowCancel />;
      case 'history':
        return <BookingList items={history} empty="No past bookings yet." />;
      case 'ai':
        return (
          <View style={{ gap: 24 }}>
            <Paragraph>Tell us how you like to travel — we use this to personalize your recommendations.</Paragraph>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 8 }}>Travel Style</ThemedText>
              <View style={styles.chipWrap}>
                {TRAVEL_STYLES.map((s) => (
                  <Chip
                    key={s.value}
                    label={s.label}
                    selected={prefs.travelStyle === s.value}
                    onPress={() => savePrefs({ ...prefs, travelStyle: prefs.travelStyle === s.value ? '' : s.value })}
                  />
                ))}
              </View>
            </View>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 8 }}>Preferred Stay Types</ThemedText>
              <View style={styles.chipWrap}>
                {CATEGORIES.map((c) => {
                  const selected: string[] = prefs.preferredCategories ?? [];
                  const on = selected.includes(c);
                  return (
                    <Chip
                      key={c}
                      label={c}
                      selected={on}
                      onPress={() =>
                        savePrefs({
                          ...prefs,
                          preferredCategories: on ? selected.filter((x) => x !== c) : [...selected, c],
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 8 }}>Budget per Night</ThemedText>
              <View style={styles.chipWrap}>
                {BUDGETS.map((b) => (
                  <Chip
                    key={b.value}
                    label={b.label}
                    selected={prefs.budgetRange === b.value}
                    onPress={() => savePrefs({ ...prefs, budgetRange: prefs.budgetRange === b.value ? '' : b.value })}
                  />
                ))}
              </View>
            </View>
            <View>
              <ThemedText type="caption" weight="bold" style={{ marginBottom: 6 }}>
                Anything else? (dietary needs, accessibility, etc.)
              </ThemedText>
              <TextInput
                value={prefs.dietaryNotes ?? ''}
                onChangeText={(t) => setPrefs({ ...prefs, dietaryNotes: t })}
                onBlur={() => savePrefs({ ...prefs })}
                placeholder="e.g. vegetarian meals, ground-floor rooms"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              />
            </View>
          </View>
        );
      case 'notifications':
        return (
          <View style={{ gap: 16 }}>
            <View style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}><ThemedText weight="semibold">Push notifications</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>Get alerts on this device.</ThemedText></View>
                <Switch value={notificationPreferences?.pushEnabled ?? false} onValueChange={setPush} trackColor={{ true: colors.primary }} />
              </View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}><ThemedText weight="semibold">Offers & deals</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>Marketing messages from StayBest.</ThemedText></View>
                <Switch value={notificationPreferences?.marketingEnabled ?? false} onValueChange={updateMarketing} trackColor={{ true: colors.primary }} />
              </View>
            </View>
            <ThemedText type="subtitle" weight="bold">Inbox</ThemedText>
            {notificationsLoading ? <ActivityIndicator color={colors.primary} /> : (notifications?.length ?? 0) === 0 ? (
              <Paragraph>You’re all caught up. New booking updates and offers will appear here.</Paragraph>
            ) : notifications?.map((notification) => (
              <Pressable key={notification.id} onPress={() => {
                if (!notification.readAt) markNotificationRead.mutate({ id: notification.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) });
              }} style={[styles.notificationCard, { backgroundColor: notification.readAt ? colors.card : colors.accent, borderColor: colors.border }]}>
                <View style={{ flex: 1, gap: 3 }}><ThemedText weight="bold">{notification.title}</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>{notification.body}</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>{format(parseISO(notification.createdAt), 'dd MMM, h:mm a')}</ThemedText></View>
                {!notification.readAt && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
              </Pressable>
            ))}
          </View>
        );
      case 'referrals':
        return (
          <View style={{ gap: 16 }}>
            <Paragraph>Share your personal code. Rewards are credited when a referred traveler qualifies.</Paragraph>
            {referralCodeLoading || referralProgramsLoading ? <ActivityIndicator color={colors.primary} /> : myReferralCode ? (
              <View style={[styles.referralCode, { backgroundColor: colors.accent }]}><ThemedText type="title" weight="bold" color={colors.primary}>{myReferralCode.code}</ThemedText><Pressable onPress={() => Share.share({ message: `Use my StayBest referral code ${myReferralCode.code} when you join.` })}><Feather name="share-2" size={20} color={colors.primary} /></Pressable></View>
            ) : !eligibleReferralPrograms?.length ? (
              <View style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><ThemedText weight="semibold">No referral program is available right now.</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>Check back later for the next StayBest referral offer.</ThemedText></View>
            ) : (
              <View style={{ gap: 10 }}><ThemedText type="caption" color={colors.mutedForeground}>{eligibleReferralPrograms[0].name} · Earn ₹{eligibleReferralPrograms[0].referrerReward.toLocaleString('en-IN')} for each qualified referral.</ThemedText><TextInput value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" placeholder="Choose a code" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} /><Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => { if (referralCode.trim().length < 4) return setStatus('Choose a code with at least 4 characters'); createReferralCode.mutate({ data: { programId: eligibleReferralPrograms[0].id, code: referralCode.trim().toUpperCase() } }, { onSuccess: () => { setReferralCode(''); setStatus('Referral code created'); queryClient.invalidateQueries({ queryKey: getGetMyReferralCodeQueryKey() }); }, onError: () => setStatus('Could not create referral code') }); }}><ThemedText weight="semibold" color="#fff" style={{ textAlign: 'center' }}>Create code</ThemedText></Pressable></View>
            )}
            <ThemedText type="subtitle" weight="bold">Reward history</ThemedText>
            {rewardsLoading ? <ActivityIndicator color={colors.primary} /> : (referralRewards?.length ?? 0) === 0 ? <Paragraph>No referral rewards yet.</Paragraph> : referralRewards?.map((reward) => <View key={reward.id} style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View><ThemedText weight="bold">₹{reward.amount.toLocaleString('en-IN')} reward</ThemedText><ThemedText type="caption" color={colors.mutedForeground}>{reward.status} · {format(parseISO(reward.createdAt), 'dd MMM yyyy')}</ThemedText></View></View>)}
          </View>
        );
      case 'password':
        return (
          <View style={{ gap: 16 }}>
            <Paragraph>
              Your password and sign-in methods are managed securely through your StayBest account. Sign out and use "Forgot password" on the sign-in screen to reset your password.
            </Paragraph>
          </View>
        );
      case 'help':
        return (
          <View style={{ gap: 16 }}>
            <Paragraph>We're here to help with anything about your bookings or account.</Paragraph>
            <View style={styles.helpRow}>
              <Feather name="help-circle" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>
                Browse the{' '}
                <ThemedText type="caption" weight="semibold" color={colors.primary} onPress={() => setSection('faq')}>
                  FAQ
                </ThemedText>{' '}
                for instant answers.
              </ThemedText>
            </View>
            <View style={styles.helpRow}>
              <Feather name="phone" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>Call us on +91 98765 43210 (9 AM – 9 PM IST, all days).</ThemedText>
            </View>
            <View style={styles.helpRow}>
              <Feather name="life-buoy" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>Email hello@staybestt.com — we reply within 24 hours.</ThemedText>
            </View>
          </View>
        );
      case 'contact':
        return (
          <View style={{ gap: 16 }}>
            <ThemedText weight="semibold">StayBest Hospitality Pvt. Ltd.</ThemedText>
            <View style={styles.helpRow}>
              <Feather name="map-pin" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>123 Hospitality Avenue, Mumbai, MH 400001, India</ThemedText>
            </View>
            <View style={styles.helpRow}>
              <Feather name="phone" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>+91 98765 43210</ThemedText>
            </View>
            <View style={styles.helpRow}>
              <Feather name="mail" size={16} color={colors.primary} />
              <ThemedText type="caption" style={{ flex: 1 }}>hello@staybestt.com</ThemedText>
            </View>
          </View>
        );
      case 'faq':
        return (
          <View style={{ gap: 20 }}>
            {FAQS.map((f, i) => (
              <View key={i} style={{ borderBottomWidth: i === FAQS.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 20 }}>
                <ThemedText weight="semibold" style={{ marginBottom: 6 }}>{f.q}</ThemedText>
                <Paragraph>{f.a}</Paragraph>
              </View>
            ))}
          </View>
        );
      case 'privacy':
        return (
          <View style={{ gap: 14 }}>
            <Paragraph>Last updated: August 2026</Paragraph>
            <Paragraph>StayBest collects only the information needed to provide your bookings: your name, email, and stay details. We never sell your personal data.</Paragraph>
            <Paragraph>What we collect: account details (name, email), booking information, wishlist items, and the travel preferences you choose to share for personalized recommendations.</Paragraph>
            <Paragraph>How we use it: to process bookings, personalize your experience, and — only if you opt in — send you offers and reminders. You can switch these off any time in Notifications.</Paragraph>
            <Paragraph>Your rights: you can update your details from this page, and request deletion of your account and data by emailing hello@staybestt.com.</Paragraph>
          </View>
        );
      case 'terms':
        return (
          <View style={{ gap: 14 }}>
            <Paragraph>Last updated: August 2026</Paragraph>
            <Paragraph>Bookings: a new booking is confirmed only after online payment is captured and a booking reference is issued. Pending payment holds can expire without creating a confirmed stay.</Paragraph>
            <Paragraph>Cancellations: subject to each hotel's policy. Properties with free cancellation can be cancelled any time before check-in; all other properties allow cancellation up to 48 hours before check-in.</Paragraph>
            <Paragraph>Conduct: guests must comply with property rules. StayBest acts as a booking platform and is not liable for services delivered by the property.</Paragraph>
            <Paragraph>Accounts: keep your credentials secure; you are responsible for activity under your account.</Paragraph>
          </View>
        );
      default:
        return null;
    }
  };

  // ----- Sub-section view -----
  if (section !== 'menu') {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingTop, paddingBottom, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.backRow} onPress={() => setSection('menu')}>
            <Feather name="chevron-left" size={22} color={colors.primary} />
            <ThemedText weight="medium" color={colors.primary}>Profile</ThemedText>
          </Pressable>
          <ThemedText type="title" weight="bold" style={{ marginBottom: 24 }}>
            {SECTION_TITLES[section]}
          </ThemedText>
          {status && (
            <View style={[styles.statusBar, { backgroundColor: colors.accent }]}>
              <ThemedText type="caption" weight="medium" color={colors.primary}>{status}</ThemedText>
            </View>
          )}
          {renderSection()}
        </ScrollView>
      </ThemedView>
    );
  }

  // ----- Menu view -----
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop, paddingBottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="title" weight="bold">Profile</ThemedText>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <ThemedText type="title" color="#fff">
                {(me?.name || user?.primaryEmailAddress?.emailAddress || 'U').charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          </View>
          <View style={styles.userInfo}>
            <ThemedText type="subtitle" weight="bold">{me?.name || user?.fullName || 'Traveler'}</ThemedText>
            <ThemedText color={colors.mutedForeground}>{me?.email || user?.primaryEmailAddress?.emailAddress}</ThemedText>
          </View>
        </View>

        {status && (
          <View style={[styles.statusBar, { backgroundColor: colors.accent, marginHorizontal: 24 }]}>
            <ThemedText type="caption" weight="medium" color={colors.primary}>{status}</ThemedText>
          </View>
        )}

        <View style={{ paddingHorizontal: 24 }}>
          {MENU.map((item) => (
            <View key={item.id}>
              {item.group && item.group.trim() !== '' && (
                <ThemedText type="caption" weight="bold" color={colors.mutedForeground} style={styles.groupLabel}>
                  {item.group.toUpperCase()}
                </ThemedText>
              )}
              {item.group === ' ' && <View style={{ height: 24 }} />}
              {item.id === 'logout' ? (
                <Pressable style={[styles.signOutBtn, { borderColor: colors.border }]} onPress={handleSignOut}>
                  <Feather name="log-out" size={18} color={colors.destructive} />
                  <ThemedText weight="semibold" color={colors.destructive}>Log Out</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.linkItem, { borderBottomColor: colors.border }]}
                  onPress={() =>
                    item.id === 'wishlist'
                      ? router.push('/wishlist')
                      : setSection(item.id as Exclude<SectionId, 'menu'>)
                  }
                >
                  <Feather name={item.icon} size={20} color={colors.primary} />
                  <ThemedText style={styles.linkText}>{item.label}</ThemedText>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
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
    paddingBottom: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 32,
    gap: 16,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  guestSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
    justifyContent: 'center',
  },
  groupLabel: {
    marginTop: 20,
    marginBottom: 4,
    letterSpacing: 1,
    fontSize: 11,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  linkText: {
    flex: 1,
  },
  signOutBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  notificationCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  referralCode: {
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 12,
    marginLeft: -6,
    alignSelf: 'flex-start',
  },
  statusBar: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  bookingImage: {
    width: '100%',
    height: 140,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
});
