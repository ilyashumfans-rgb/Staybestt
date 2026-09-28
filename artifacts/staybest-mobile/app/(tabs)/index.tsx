import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Platform, ActivityIndicator, Alert, Modal, Dimensions, Linking } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGetHomeData, getGetHomeDataQueryKey, getListNotificationsQueryKey, getSearchPropertiesQueryKey, useListDestinations, useListLocations, useListNotifications, useRecordPromoBannerEvent, useSearchProperties } from '@workspace/api-client-react';
import { getImageUrl } from '@/utils/images';
import { useUser } from '@clerk/expo';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { addDays, format, startOfDay } from 'date-fns';
import { DateRangeSelector } from '@/components/DateRangeSelector';
import { PropertyCard } from '@/components/PropertyCard';

const { width } = Dimensions.get('window');
const bannerCardWidth = width - 40;

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const [isLocating, setIsLocating] = useState(false);
  const [nearbyCoords, setNearbyCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Search State
  const [searchTab, setSearchTab] = useState('Stays');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [checkIn, setCheckIn] = useState(() => startOfDay(new Date()));
  const [checkOut, setCheckOut] = useState(() => addDays(startOfDay(new Date()), 1));
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  // Modals
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [picker, setPicker] = useState<'country' | 'state' | 'city' | null>(null);
  const [guestPickerVisible, setGuestPickerVisible] = useState(false);

  // Banners
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const bannerScrollRef = useRef<ScrollView>(null);
  const offerScrollRef = useRef<ScrollView>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedBannerImpressions = useRef(new Set<number>());

  const { data: homeData, isLoading } = useGetHomeData({
    query: { queryKey: getGetHomeDataQueryKey() }
  });
  const { data: destinations } = useListDestinations();
  const { data: locations, isLoading: locationsLoading, isError: locationsError, refetch: reloadLocations } = useListLocations();
  const { data: notifications } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: !!isSignedIn },
  });
  const nearbyParams = {
    latitude: nearbyCoords?.latitude,
    longitude: nearbyCoords?.longitude,
    radiusKm: 100,
  };
  const { data: nearbyProperties, isLoading: nearbyLoading } = useSearchProperties(
    nearbyParams,
    {
      query: {
        queryKey: getSearchPropertiesQueryKey(nearbyParams),
        enabled: nearbyCoords !== null,
      },
    },
  );
  const unreadNotificationCount = notifications?.filter((notification) => !notification.readAt).length ?? 0;
  const recordBannerEvent = useRecordPromoBannerEvent();

  const recordBannerAnalytics = (
    id: number,
    placement: string | undefined,
    eventType: 'impression' | 'tap',
    idempotencyKey: string,
  ) => {
    recordBannerEvent.mutate(
      { id, data: { eventType, idempotencyKey, placement } },
      {
        onError: (error: any) => {
          const status = error?.response?.status ?? error?.status;
          if (status === 409 || status === 429) return;
        },
      },
    );
  };

  const eligibleBanners = useMemo(() => {
    const now = Date.now();
    return (homeData?.banners ?? []).filter((banner) =>
      banner.active &&
      (!banner.startsAt || new Date(banner.startsAt).getTime() <= now) &&
      (!banner.endsAt || new Date(banner.endsAt).getTime() >= now) &&
      (!banner.audience || banner.audience === 'all' || banner.audience === 'customer'),
    );
  }, [homeData?.banners]);

  const heroImages = useMemo(() => {
    const liveImageUrls = [
      ...(homeData?.banners ?? []).map((item) => item.imageUrl),
      ...(homeData?.featured ?? []).map((item) => item.imageUrl),
      ...(homeData?.popular ?? []).map((item) => item.imageUrl),
      ...(homeData?.topRated ?? []).map((item) => item.imageUrl),
      ...(homeData?.cities ?? []).map((item) => item.imageUrl),
      ...(destinations ?? []).map((item) => item.imageUrl),
    ].filter((imageUrl): imageUrl is string => Boolean(imageUrl));

    return [
      require('../../assets/images/login-background.jpg'),
      ...[...new Set(liveImageUrls)].slice(0, 6).map((imageUrl) => ({ uri: getImageUrl(imageUrl) })),
    ];
  }, [destinations, homeData]);

  useEffect(() => {
    if (heroImages.length <= 1) return;
    const timer = setTimeout(() => {
      setActiveHeroIndex((current) => (current + 1) % heroImages.length);
    }, 3500);
    return () => clearTimeout(timer);
  }, [activeHeroIndex, heroImages.length]);

  useEffect(() => {
    const offers = homeData?.offers ?? [];
    if (offers.length <= 1) return;
    const timer = setTimeout(() => {
      const nextIndex = (activeOfferIndex + 1) % offers.length;
      offerScrollRef.current?.scrollTo({ x: nextIndex * bannerCardWidth, animated: true });
      setActiveOfferIndex(nextIndex);
    }, 4500);
    return () => clearTimeout(timer);
  }, [activeOfferIndex, homeData?.offers]);

  useEffect(() => {
    let active = true;
    const fetchLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        const currentLocation = await Location.getCurrentPositionAsync({});
        if (!active) return;
        setNearbyCoords({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });
      } catch {
        // The compact Near Me button remains available for a manual retry.
      }
    };
    void fetchLocation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    eligibleBanners.forEach((banner) => {
      if (recordedBannerImpressions.current.has(banner.id)) return;
      recordedBannerImpressions.current.add(banner.id);
      recordBannerAnalytics(banner.id, banner.placement, 'impression', `mobile-banner-${banner.id}-impression`);
    });
  }, [eligibleBanners, recordBannerEvent]);

  useEffect(() => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    if (eligibleBanners.length <= 1) return;

    bannerTimerRef.current = setTimeout(() => {
      const nextIndex = (activeBannerIndex + 1) % eligibleBanners.length;
      bannerScrollRef.current?.scrollTo({ x: nextIndex * bannerCardWidth, animated: true });
      setActiveBannerIndex(nextIndex);
    }, 4000);

    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [activeBannerIndex, eligibleBanners.length]);

  const countries = useMemo(
    () => [...new Set((locations ?? []).map(item => item.country))].sort(),
    [locations],
  );
  const states = useMemo(
    () => [...new Set(
      (locations ?? [])
        .filter(item => item.country === country)
        .map(item => item.state),
    )].sort(),
    [country, locations],
  );
  const cities = useMemo(
    () => [...new Set(
      (locations ?? [])
        .filter(item => item.country === country && item.state === state)
        .map(item => item.city),
    )].sort(),
    [country, locations, state],
  );
  const pickerOptions = picker === 'country' ? countries : picker === 'state' ? states : cities;

  const paddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top + 10;
  const paddingBottom = Platform.OS === 'web' ? 84 + 40 : 100;

  const handleManualSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!country && !city) return;
    router.push({
      pathname: '/list',
      params: {
        country,
        state,
        city,
        category: searchTab === 'Stays'
          ? 'stay,prime,luxury,budget,package'
          : searchTab === 'Homes'
            ? 'home'
            : searchTab === 'Resorts'
              ? 'resort'
              : 'villa',
        title: city || state || country,
        checkIn: format(checkIn, 'yyyy-MM-dd'),
        checkOut: format(checkOut, 'yyyy-MM-dd'),
        guests: guests.toString(),
        rooms: rooms.toString(),
      },
    });
  };

  const selectLocation = (value: string) => {
    Haptics.selectionAsync();
    if (picker === 'country') {
      setCountry(value);
      setState('');
      setCity('');
      setPicker('state');
    } else if (picker === 'state') {
      setState(value);
      setCity('');
      setPicker('city');
    } else if (picker === 'city') {
      setCity(value);
      setPicker(null);
    }
  };

  const openPicker = (type: 'country' | 'state' | 'city') => {
    if (type === 'state' && !country) return;
    if (type === 'city' && !state) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPicker(type);
  };

  const handleNearMe = async () => {
    if (isLocating) return;
    setIsLocating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location unavailable', 'Allow location access in your device settings and try again.');
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      setNearbyCoords({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
      router.push({
        pathname: '/list',
        params: {
          latitude: String(currentLocation.coords.latitude),
          longitude: String(currentLocation.coords.longitude),
          radiusKm: '50',
          title: 'Stays Near Me',
        },
      });
    } catch {
      Alert.alert('Location unavailable', 'We could not determine your location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  const openBannerLink = async (id: number, placement: string | undefined, linkUrl?: string | null) => {
    if (!linkUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordBannerAnalytics(id, placement, 'tap', `mobile-banner-${id}-tap-${Date.now()}`);
    if (linkUrl.startsWith('/')) {
      router.push(linkUrl as never);
      return;
    }
    if (/^https?:\/\//i.test(linkUrl)) await Linking.openURL(linkUrl);
  };

  const locationDisplay = city ? `${city}, ${country}` : state ? `${state}, ${country}` : country ? country : 'Select Destination';
  const displayName =
    user?.firstName ||
    user?.fullName?.split(' ')[0] ||
    user?.username ||
    'Guest';

  return (
    <View style={[styles.container, { backgroundColor: '#fcfdff' }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconBtn} />
          <Image source={require('../../assets/images/staybest-home-logo.png')} style={styles.logo} contentFit="contain" />
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (!isSignedIn) {
                router.push('/sign-in');
                return;
              }
              router.push({ pathname: '/profile', params: { section: 'notifications' } });
            }}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Feather name="bell" size={24} color="#0b1a30" />
            {unreadNotificationCount > 0 && (
              <View style={styles.badge}>
                <ThemedText style={styles.badgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={['#fff8f2', '#ffffff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroEyebrow}>
              <View style={styles.heroEyebrowDot} />
              <ThemedText style={styles.heroEyebrowText}>YOUR NEXT ESCAPE</ThemedText>
            </View>
            <ThemedText style={styles.greetingTitle}>
              Hi, {displayName}! 👋
            </ThemedText>
            <ThemedText style={styles.greetingSubtitle}>
              Discover and book the perfect stay for your next getaway.
            </ThemedText>
          </View>
          <View style={styles.heroImageWrapper}>
            <View style={styles.heroImageFrame}>
              <Image
                source={heroImages[activeHeroIndex]}
                style={styles.heroImage}
                contentFit="cover"
                transition={500}
              />
              <LinearGradient
                colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(11,26,48,0.2)']}
                style={StyleSheet.absoluteFill}
              />
              {heroImages.length > 1 && (
                <View style={styles.heroDots}>
                  {heroImages.map((_, index) => (
                    <View
                      key={index}
                      style={[styles.heroDot, index === activeHeroIndex && styles.heroDotActive]}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Floating Search Card */}
        <View style={styles.searchCard}>
          {/* Tabs */}
          <View style={styles.searchTabs}>
            {[
              { id: 'Stays', icon: 'bed' },
              { id: 'Homes', icon: 'home' },
              { id: 'Resorts', icon: 'umbrella' },
              { id: 'Villas', icon: 'building' }
            ].map(tab => (
              <Pressable
                key={tab.id}
                style={[styles.searchTab, searchTab === tab.id && styles.searchTabActive]}
                onPress={() => setSearchTab(tab.id)}
              >
                <FontAwesome5
                  name={tab.icon}
                  size={14}
                  color={searchTab === tab.id ? '#ff6b00' : '#64748b'}
                  solid={searchTab === tab.id}
                />
                <ThemedText style={[styles.searchTabText, searchTab === tab.id && styles.searchTabTextActive]}>
                  {tab.id}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <View style={styles.tabDivider} />

          {/* Location Input */}
          <Pressable
            style={styles.locationInputRow}
            onPress={() => openPicker(!country ? 'country' : !state ? 'state' : !city ? 'city' : 'country')}
          >
            <View style={styles.locationIconWrapper}>
              <View style={styles.locationPinDot} />
            </View>
            <View style={styles.locationTextWrapper}>
              <ThemedText style={styles.inputLabel}>Where are you going?</ThemedText>
              <ThemedText style={[styles.inputValue, !country && { color: '#64748b' }]}>
                {locationDisplay}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color="#64748b" />
          </Pressable>

          <View style={styles.hDivider} />

          {/* Dates & Guests */}
          <View style={styles.detailsRow}>
            <Pressable
              style={styles.detailCol}
              onPress={() => setDatePickerVisible(true)}
            >
              <Feather name="calendar" size={16} color="#64748b" />
              <View style={styles.detailTextWrapper}>
                <ThemedText style={styles.inputLabel}>Check-in</ThemedText>
                <ThemedText style={styles.inputValue}>{format(checkIn, 'EEE, dd MMM')}</ThemedText>
              </View>
            </Pressable>

            <View style={styles.vDivider} />

            <Pressable
              style={styles.detailCol}
              onPress={() => setDatePickerVisible(true)}
            >
              <Feather name="calendar" size={16} color="#64748b" />
              <View style={styles.detailTextWrapper}>
                <ThemedText style={styles.inputLabel}>Check-out</ThemedText>
                <ThemedText style={styles.inputValue}>{format(checkOut, 'EEE, dd MMM')}</ThemedText>
              </View>
            </Pressable>

            <View style={styles.vDivider} />

            <Pressable
              style={[styles.detailCol, { flex: 1.2 }]}
              onPress={() => setGuestPickerVisible(true)}
            >
              <Feather name="user" size={16} color="#64748b" />
              <View style={styles.detailTextWrapper}>
                <ThemedText style={styles.inputLabel}>Guests & Rooms</ThemedText>
                <ThemedText style={styles.inputValue} numberOfLines={1}>{guests} Guests, {rooms} Room</ThemedText>
              </View>
            </Pressable>
          </View>

          {/* Search Button */}
          <Pressable
            style={[styles.searchButton, (!country) && { opacity: 0.6 }]}
            onPress={handleManualSearch}
            disabled={!country}
          >
            <Feather name="search" size={20} color="#fff" />
            <ThemedText style={styles.searchButtonText}>Search {searchTab}</ThemedText>
          </Pressable>
        </View>

        {nearbyCoords && (
          <View style={[styles.section, styles.nearbySection]}>
            <View style={[styles.sectionHeader, styles.nearbySectionHeader]}>
              <View>
                <View style={styles.nearbyTitleRow}>
                  <Feather name="navigation" size={16} color="#ff6b00" />
                  <ThemedText style={styles.sectionTitle}>Properties Near You</ThemedText>
                </View>
                <ThemedText style={styles.featuredSubtitle}>Book a nearby stay with one tap</ThemedText>
              </View>
              {(nearbyProperties?.length ?? 0) > 0 && (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/list',
                    params: {
                      latitude: String(nearbyCoords.latitude),
                      longitude: String(nearbyCoords.longitude),
                      radiusKm: '100',
                      title: 'Properties Near You',
                    },
                  })}
                >
                  <ThemedText style={styles.viewAllText}>View all</ThemedText>
                </Pressable>
              )}
            </View>
            {nearbyLoading ? (
              <ActivityIndicator color="#ff6b00" style={styles.nearbyLoader} />
            ) : (nearbyProperties?.length ?? 0) > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.nearbyScroll}
                snapToInterval={260}
                decelerationRate="fast"
              >
                {nearbyProperties?.slice(0, 8).map((property) => (
                  <PropertyCard key={property.id} property={property} featured />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.nearbyEmpty}>
                <Feather name="map-pin" size={18} color="#64748b" />
                <ThemedText style={styles.nearbyEmptyText}>
                  No properties with map locations found within 100 km.
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Categories */}
        <View style={styles.categoriesRow}>
          {[
            { id: 'Hotels', icon: 'building', bg: '#e0f2fe', color: '#0369a1' },
            { id: 'Homes', icon: 'home', bg: '#dcfce7', color: '#15803d' },
            { id: 'Resorts', icon: 'umbrella-beach', bg: '#fef3c7', color: '#166534' },
            { id: 'Apartments', icon: 'city', bg: '#f3e8ff', color: '#6b21a8' },
            { id: 'Deals', icon: 'tag', bg: '#ffe4e6', color: '#9f1239' },
          ].map(cat => (
            <Pressable key={cat.id} style={styles.categoryItem} onPress={() => {
              if (cat.id === 'Deals') return;
              setSearchTab(cat.id === 'Apartments' ? 'Stays' : cat.id);
            }}>
              <View style={[styles.categoryIcon, { backgroundColor: cat.bg }]}>
                <FontAwesome5 name={cat.icon} size={20} color="#0b1a30" />
              </View>
              <ThemedText style={styles.categoryLabel}>{cat.id}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Sale Banners */}
        {eligibleBanners.length > 0 && (
          <View style={styles.bannersSection}>
            <ScrollView
              ref={bannerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / bannerCardWidth);
                setActiveBannerIndex(Math.max(0, Math.min(nextIndex, eligibleBanners.length - 1)));
              }}
            >
              {eligibleBanners.map(banner => (
                <Pressable
                  key={banner.id}
                  style={styles.bannerCard}
                  onPress={() => openBannerLink(banner.id, banner.placement, banner.linkUrl)}
                >
                  <Image source={{ uri: getImageUrl(banner.imageUrl) }} style={styles.bannerImage} contentFit="contain" />
                </Pressable>
              ))}
            </ScrollView>
            {eligibleBanners.length > 1 && (
              <View style={styles.bannerDots}>
                {eligibleBanners.map((_, i) => (
                  <View key={i} style={[styles.bannerDot, i === activeBannerIndex && styles.bannerDotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        {(homeData?.featured?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <ThemedText style={styles.sectionTitle}>Featured Properties</ThemedText>
                <ThemedText style={styles.featuredSubtitle}>Handpicked stays for your next trip</ThemedText>
              </View>
              <Pressable onPress={() => router.push({ pathname: '/list', params: { title: 'Featured Properties' } })}>
                <ThemedText style={styles.viewAllText}>View all</ThemedText>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredScroll}
              snapToInterval={260}
              decelerationRate="fast"
            >
              {homeData?.featured?.map((property) => (
                <PropertyCard key={property.id} property={property} featured />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Popular Destinations */}
        {(destinations?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Popular Destinations</ThemedText>
              <Pressable onPress={() => router.push('/segments')}>
                <ThemedText style={styles.viewAllText}>View all</ThemedText>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationsScroll}>
              {destinations?.map((dest, i) => (
                <Pressable
                  key={dest.id}
                  style={[styles.destinationCard, { marginLeft: i === 0 ? 0 : 12 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/list',
                      params: {
                        country: dest.country,
                        state: dest.state ?? '',
                        city: dest.city ?? '',
                        title: dest.title,
                        category: 'all',
                      },
                    });
                  }}
                >
                  <Image source={{ uri: getImageUrl(dest.imageUrl) }} style={styles.destinationImg} contentFit="cover" />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.destinationGrad} />
                  <View style={styles.destinationInfo}>
                    <ThemedText style={styles.destinationName} numberOfLines={1}>{dest.city || dest.country}</ThemedText>
                    <ThemedText style={styles.destinationStays}>{Math.floor(Math.random() * 200 + 50)} Stays</ThemedText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trust Cards */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, styles.trustSectionTitle]}>Why book with StayBest?</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trustScroll}>
            {[
              { id: 'best', icon: 'award', title: 'Best Price Guarantee', color: '#ea580c' },
              { id: 'secure', icon: 'shield-check', title: 'Secure Bookings', color: '#16a34a' },
              { id: 'support', icon: 'headset', title: '24/7 Support', color: '#2563eb' },
              { id: 'cancel', icon: 'undo-alt', title: 'Easy Cancellation', color: '#7c3aed' },
            ].map((trust, i) => (
              <View key={trust.id} style={[styles.trustCard, { marginLeft: i === 0 ? 0 : 12 }]}>
                <FontAwesome5 name={trust.icon} size={20} color={trust.color} />
                <ThemedText style={styles.trustTitle}>{trust.title}</ThemedText>
              </View>
            ))}
          </ScrollView>
        </View>

        {(homeData?.offers?.length ?? 0) > 0 && (
          <View style={styles.offersSection}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Offers for you</ThemedText>
            </View>
            <ScrollView
              ref={offerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / bannerCardWidth);
                setActiveOfferIndex(Math.max(0, Math.min(nextIndex, (homeData?.offers?.length ?? 1) - 1)));
              }}
            >
              {homeData?.offers?.map((offer) => (
                <View key={offer.id} style={styles.offerCard}>
                  <LinearGradient
                    colors={['#0b1a30', '#17345f']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.offerGlow} />
                  <View style={styles.offerContent}>
                    <ThemedText style={styles.offerTitle}>{offer.title}</ThemedText>
                    <ThemedText style={styles.offerDescription} numberOfLines={2}>
                      {offer.description}
                    </ThemedText>
                    <View style={styles.offerCode}>
                      <ThemedText style={styles.offerCodeLabel}>USE CODE</ThemedText>
                      <ThemedText style={styles.offerCodeText}>{offer.couponCode}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.offerDiscount}>
                    <ThemedText style={styles.offerDiscountValue}>{offer.discountPercent}%</ThemedText>
                    <ThemedText style={styles.offerDiscountLabel}>OFF</ThemedText>
                  </View>
                </View>
              ))}
            </ScrollView>
            {(homeData?.offers?.length ?? 0) > 1 && (
              <View style={styles.bannerDots}>
                {homeData?.offers?.map((offer, index) => (
                  <View
                    key={offer.id}
                    style={[styles.bannerDot, index === activeOfferIndex && styles.bannerDotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <View style={styles.quickActions}>
        <Pressable
          style={[styles.quickAction, styles.nearMeAction]}
          onPress={handleNearMe}
          disabled={isLocating}
          accessibilityRole="button"
          accessibilityLabel="Find stays near me"
        >
          {isLocating
            ? <ActivityIndicator size="small" color="#0b1a30" />
            : <Feather name="navigation" size={16} color="#0b1a30" />}
          <ThemedText style={styles.nearMeActionText}>Near Me</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.quickAction, styles.aiAction]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/assistant');
          }}
          accessibilityRole="button"
          accessibilityLabel="Open AI travel chat"
        >
          <Feather name="message-circle" size={16} color="#fff" />
          <ThemedText style={styles.aiActionText}>AI Chat</ThemedText>
        </Pressable>
      </View>

      {/* Date Range Modal */}
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

      {/* Location Picker Modal */}
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 12) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <View>
                <ThemedText style={styles.pickerTitle}>Choose {picker}</ThemedText>
                <ThemedText style={styles.pickerSubtitle}>{picker === 'country' ? 'Find your next destination' : picker === 'state' ? country : state}</ThemedText>
              </View>
              <Pressable accessibilityLabel="Close location picker" style={styles.pickerClose} onPress={() => setPicker(null)} hitSlop={10}><Feather name="x" size={19} color="#0b1a30" /></Pressable>
            </View>
            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled">
              {locationsLoading ? (
                <View style={styles.pickerEmpty}><ActivityIndicator color="#ff6b00" /><ThemedText style={styles.pickerSubtitle}>Loading destinations…</ThemedText></View>
              ) : locationsError ? (
                <View style={styles.pickerEmpty}>
                  <ThemedText style={styles.pickerOptionText}>Unable to load destinations</ThemedText>
                  <Pressable onPress={() => void reloadLocations()} style={styles.pickerRetry}><ThemedText style={styles.pickerRetryText}>Try again</ThemedText></Pressable>
                </View>
              ) : pickerOptions.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Feather name="map-pin" size={24} color="#ff6b00" />
                  <ThemedText style={styles.pickerOptionText}>No destinations available yet</ThemedText>
                  <ThemedText style={styles.pickerEmptyText}>Locations will appear here once approved by StayBest.</ThemedText>
                </View>
              ) : null}
              {pickerOptions.map(opt => (
                <Pressable key={opt} style={styles.pickerOption} onPress={() => selectLocation(opt)}>
                  <Feather name={picker === 'country' ? 'globe' : 'map-pin'} size={17} color="#ff6b00" />
                  <ThemedText style={[styles.pickerOptionText, { flex: 1 }]}>{opt}</ThemedText>
                  {opt === (picker === 'country' ? country : picker === 'state' ? state : city) && (
                    <Feather name="check" size={20} color="#ff6b00" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Guests Picker Modal */}
      <Modal visible={guestPickerVisible} transparent animationType="fade" onRequestClose={() => setGuestPickerVisible(false)}>
        <Pressable style={styles.modalBackdropCenter} onPress={() => setGuestPickerVisible(false)}>
          <Pressable style={styles.guestDialog} onPress={e => e.stopPropagation()}>
            <ThemedText style={styles.guestDialogTitle}>Guests & Rooms</ThemedText>

            <View style={styles.guestRow}>
              <View>
                <ThemedText style={styles.guestRowTitle}>Guests</ThemedText>
              </View>
              <View style={styles.guestControls}>
                <Pressable style={styles.guestBtn} onPress={() => setGuests(Math.max(1, guests - 1))}>
                  <Feather name="minus" size={16} color="#0b1a30" />
                </Pressable>
                <ThemedText style={styles.guestValue}>{guests}</ThemedText>
                <Pressable style={styles.guestBtn} onPress={() => setGuests(guests + 1)}>
                  <Feather name="plus" size={16} color="#0b1a30" />
                </Pressable>
              </View>
            </View>

            <View style={styles.guestRow}>
              <View>
                <ThemedText style={styles.guestRowTitle}>Rooms</ThemedText>
              </View>
              <View style={styles.guestControls}>
                <Pressable style={styles.guestBtn} onPress={() => setRooms(Math.max(1, rooms - 1))}>
                  <Feather name="minus" size={16} color="#0b1a30" />
                </Pressable>
                <ThemedText style={styles.guestValue}>{rooms}</ThemedText>
                <Pressable style={styles.guestBtn} onPress={() => setRooms(rooms + 1)}>
                  <Feather name="plus" size={16} color="#0b1a30" />
                </Pressable>
              </View>
            </View>

            <Pressable style={styles.guestDoneBtn} onPress={() => setGuestPickerVisible(false)}>
              <ThemedText style={styles.guestDoneText}>Done</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerIconBtn: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  logo: { width: 168, height: 54 },
  badge: {
    position: 'absolute', top: 4, right: 6,
    backgroundColor: '#ff6b00',
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff'
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    height: 170,
    borderRadius: 24,
    paddingLeft: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffeadb',
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 5,
  },
  heroContent: {
    flex: 1.15,
    zIndex: 2,
    paddingRight: 12,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  heroEyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff6b00',
  },
  heroEyebrowText: {
    color: '#ff6b00',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  greetingTitle: {
    fontSize: 23, lineHeight: 28, fontWeight: '800', color: '#0b1a30', marginBottom: 7,
  },
  greetingSubtitle: {
    fontSize: 12.5, color: '#64748b', lineHeight: 18,
  },
  heroImageWrapper: {
    flex: 0.85,
    height: 140,
    marginRight: 12,
    shadowColor: '#0b1a30',
    shadowOffset: { width: -5, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    transform: [
      { perspective: 700 },
      { rotateY: '-5deg' },
      { rotateZ: '1deg' },
    ],
  },
  heroImageFrame: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
  },
  heroImage: { width: '100%', height: '100%' },
  heroDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  heroDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroDotActive: {
    width: 13,
    backgroundColor: '#ff6b00',
  },

  searchCard: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  searchTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  searchTab: {
    alignItems: 'center', gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  searchTabActive: {
    borderBottomWidth: 2, borderBottomColor: '#ff6b00',
  },
  searchTabText: {
    fontSize: 13, color: '#64748b', fontWeight: '500',
  },
  searchTabTextActive: {
    color: '#ff6b00', fontWeight: '700',
  },
  tabDivider: {
    height: 1, backgroundColor: '#f1f5f9',
    marginBottom: 16, marginHorizontal: -16,
  },

  locationInputRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 16,
  },
  locationIconWrapper: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff3eb',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  locationPinDot: {
    width: 14, height: 18,
    backgroundColor: '#ff6b00',
    borderTopLeftRadius: 7, borderTopRightRadius: 7,
    borderBottomLeftRadius: 7, borderBottomRightRadius: 7,
  },
  locationTextWrapper: { flex: 1 },
  inputLabel: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  inputValue: { fontSize: 14, fontWeight: '600', color: '#0b1a30' },

  hDivider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 16 },
  vDivider: { width: 1, backgroundColor: '#f1f5f9', marginHorizontal: 12 },

  detailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  detailCol: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  detailTextWrapper: { marginLeft: 8, flex: 1 },

  searchButton: {
    backgroundColor: '#ff6b00',
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
    gap: 8,
  },
  searchButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  categoriesRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 28,
  },
  categoryItem: { alignItems: 'center', gap: 8 },
  categoryIcon: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryLabel: { fontSize: 12, fontWeight: '500', color: '#0b1a30' },

  bannersSection: { marginBottom: 28 },
  bannerCard: {
    width: bannerCardWidth,
    height: 140,
    marginLeft: 20,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#fff',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerContent: {
    padding: 20,
    width: '65%',
    justifyContent: 'center', height: '100%',
  },
  bannerSubtitle: { fontSize: 12, color: '#ff6b00', fontWeight: '600', marginBottom: 4 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#0b1a30', marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  bannerBtn: {
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#ff6b00',
  },
  bannerBtnText: { color: '#ff6b00', fontSize: 12, fontWeight: 'bold' },
  limitedBadge: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: '#ff6b00',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  limitedBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  bannerDots: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  bannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#cbd5e1' },
  bannerDotActive: { backgroundColor: '#ff6b00', width: 16 },

  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#0b1a30', marginBottom: 0 },
  featuredSubtitle: { marginTop: 3, fontSize: 11, color: '#64748b' },
  featuredScroll: { paddingHorizontal: 20, paddingBottom: 10 },
  nearbyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nearbySection: {
    marginHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 4,
    borderRadius: 20,
    backgroundColor: '#fff8f2',
    borderWidth: 1,
    borderColor: '#ffeadb',
    overflow: 'hidden',
  },
  nearbySectionHeader: {
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  nearbyScroll: { paddingHorizontal: 14, paddingBottom: 10 },
  nearbyLoader: { marginVertical: 28 },
  nearbyEmpty: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nearbyEmptyText: { flex: 1, color: '#64748b', fontSize: 12, lineHeight: 17 },
  viewAllText: { fontSize: 14, color: '#ff6b00', fontWeight: '600' },

  destinationsScroll: { paddingHorizontal: 20, paddingBottom: 8 },
  destinationCard: {
    width: 140, height: 140, borderRadius: 16, overflow: 'hidden',
  },
  destinationImg: { width: '100%', height: '100%' },
  destinationGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  destinationInfo: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  destinationName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  destinationStays: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  trustScroll: { paddingHorizontal: 20 },
  trustSectionTitle: { paddingHorizontal: 20, marginBottom: 16 },
  trustCard: {
    width: 132, height: 112,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 18,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  trustTitle: {
    height: 42,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#0b1a30',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  offersSection: { marginBottom: 28 },
  offerCard: {
    width: bannerCardWidth,
    height: 150,
    marginLeft: 20,
    borderRadius: 18,
    overflow: 'hidden',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  offerGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -30,
    top: -55,
    backgroundColor: 'rgba(255,107,0,0.32)',
  },
  offerContent: { flex: 1, paddingRight: 14 },
  offerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 5 },
  offerDescription: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  offerCode: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  offerCodeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: '700' },
  offerCodeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  offerDiscount: { alignItems: 'center', minWidth: 70 },
  offerDiscountValue: { color: '#ff6b00', fontSize: 28, fontWeight: '900' },
  offerDiscountLabel: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },

  quickActions: {
    position: 'absolute',
    right: 14,
    bottom: Platform.OS === 'web' ? 92 : 86,
    gap: 8,
    alignItems: 'flex-end',
  },
  quickAction: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  nearMeAction: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nearMeActionText: { color: '#0b1a30', fontSize: 12, fontWeight: '700' },
  aiAction: { backgroundColor: '#ff6b00' },
  aiActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11,26,48,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 230, maxHeight: '55%', overflow: 'hidden' },
  pickerHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#dbe2ea', alignSelf: 'center', marginTop: 10 },
  pickerClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  pickerSubtitle: { fontSize: 12, color: '#64748b', marginTop: 3 },
  pickerContent: { paddingHorizontal: 16, paddingBottom: 8 },
  pickerEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22, paddingHorizontal: 12, gap: 9 },
  pickerEmptyText: { fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18 },
  pickerRetry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff2e8' },
  pickerRetryText: { fontSize: 13, color: '#b34700', fontWeight: '700' },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  pickerTitle: { fontSize: 17, fontWeight: 'bold', color: '#0b1a30' },
  pickerScroll: { flexGrow: 0, flexShrink: 1 },
  pickerOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 12, gap: 10, marginTop: 8, borderRadius: 12, backgroundColor: '#f8fafc',
  },
  pickerOptionText: { fontSize: 14, fontWeight: '600', color: '#0b1a30' },

  modalBackdropCenter: { flex: 1, backgroundColor: 'rgba(11,26,48,0.4)', justifyContent: 'center', alignItems: 'center' },
  guestDialog: {
    backgroundColor: '#fff', width: '80%', borderRadius: 16, padding: 24,
  },
  guestDialogTitle: { fontSize: 18, fontWeight: 'bold', color: '#0b1a30', marginBottom: 20 },
  guestRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  guestRowTitle: { fontSize: 16, fontWeight: '600', color: '#0b1a30' },
  guestControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  guestBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: '#cbd5e1',
    justifyContent: 'center', alignItems: 'center',
  },
  guestValue: { fontSize: 16, fontWeight: '600', width: 20, textAlign: 'center' },
  guestDoneBtn: {
    backgroundColor: '#ff6b00', borderRadius: 8, height: 44,
    justifyContent: 'center', alignItems: 'center', marginTop: 10,
  },
  guestDoneText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
