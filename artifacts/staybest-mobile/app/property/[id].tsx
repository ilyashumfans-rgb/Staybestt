import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Platform, Dimensions, Share, Modal, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { useGetProperty, getGetPropertyQueryKey, useGetAmenityCatalog, groupSelectedAmenities } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getImageUrl } from '@/utils/images';
import { HeartButton } from '@/components/HeartButton';
import Animated from 'react-native-reanimated';
import { PropertyMap } from '@/components/PropertyMap';

const { width } = Dimensions.get('window');

type IconDef = { lib: 'feather'; name: React.ComponentProps<typeof Feather>['name'] } | { lib: 'fa'; name: string };
const AMENITY_ICON: Record<string, IconDef> = {
  pool: { lib: 'fa', name: 'swimming-pool' }, lawn: { lib: 'fa', name: 'tree' }, breakfast: { lib: 'feather', name: 'coffee' },
  wifi: { lib: 'feather', name: 'wifi' }, theatre: { lib: 'feather', name: 'film' }, bbq: { lib: 'fa', name: 'drumstick-bite' },
  bonfire: { lib: 'fa', name: 'fire' }, gazebo: { lib: 'fa', name: 'campground' }, games: { lib: 'fa', name: 'gamepad' },
  bar: { lib: 'fa', name: 'glass-martini-alt' }, tv: { lib: 'feather', name: 'tv' }, music: { lib: 'feather', name: 'music' },
  balcony: { lib: 'fa', name: 'building' }, ac: { lib: 'feather', name: 'wind' }, refrigerator: { lib: 'fa', name: 'snowflake' },
  water: { lib: 'feather', name: 'droplet' }, check: { lib: 'feather', name: 'check' },
};

function AmenityGlyph({ icon, color }: { icon: string; color: string }) {
  const def = AMENITY_ICON[icon] ?? AMENITY_ICON.check;
  return (
    <View style={[styles.iconCircle, { borderColor: color + '55' }]}>
      {def.lib === 'feather' ? <Feather name={def.name} size={15} color={color} /> : <FontAwesome5 name={def.name} size={13} color={color} />}
    </View>
  );
}

export default function PropertyDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const propertyId = Number(id);

  const { data: property, isLoading } = useGetProperty(
    propertyId,
    { query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) } }
  );

  const [activeImage, setActiveImage] = useState(0);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const { data: catalog } = useGetAmenityCatalog();
  const selectedAmenities = property?.amenities;
  const amenityGroups = useMemo(
    () => groupSelectedAmenities(catalog?.categories ?? [], selectedAmenities ?? []),
    [catalog, selectedAmenities],
  );

  if (isLoading || !property) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.loadingCenter, { paddingTop: insets.top }]}>
          <ThemedText color={colors.mutedForeground}>Loading property details...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const handleShare = async () => {
    const url = `https://www.staybestt.com/property/${property.id}`;
    const message = `Check out ${property.name} on StayBest!`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          try {
            await navigator.share({ title: property.name, text: message, url });
            return;
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          Alert.alert('Link copied', 'The property link is ready to share.');
        } catch {
          window.prompt('Copy this property link to share:', url);
        }
        return;
      }
      await Share.share({
        title: property.name,
        message: Platform.OS === 'ios' ? message : `${message}\n${url}`,
        ...(Platform.OS === 'ios' ? { url } : {}),
      });
    } catch {
      Alert.alert('Could not share', 'Please try sharing this property again.');
    }
  };

  const images = property.images?.length > 0 ? property.images : [property.imageUrl];

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageHeader}>
          <ScrollView 
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              setActiveImage(Math.round(x / width));
            }}
            scrollEventThrottle={16}
          >
            {images.map((img, i) => (
              <Image 
                key={i} 
                source={{ uri: getImageUrl(img) }} 
                style={{ width, height: 300 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
              />
            ))}
          </ScrollView>

          {/* Top Actions */}
          <View style={[styles.topBar, { top: insets.top || 20 }]}>
            <Pressable 
              style={[styles.circleBtn, { backgroundColor: colors.background }]}
              onPress={() => router.back()}
            >
              <Feather name="chevron-left" size={24} color={colors.foreground} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable 
                style={[styles.circleBtn, { backgroundColor: colors.background }]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={`Share ${property.name}`}
                testID="button-share-property"
              >
                <Feather name="share" size={20} color={colors.foreground} />
              </Pressable>
              <HeartButton propertyId={property.id} style={[styles.circleBtn, { backgroundColor: colors.background, position: 'relative', right: 0, top: 0 }]} />
            </View>
          </View>

          {/* Pagination dots */}
          {images.length > 1 && (
            <View style={styles.pagination}>
              {images.map((_, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.dot, 
                    { backgroundColor: i === activeImage ? '#fff' : 'rgba(255,255,255,0.5)' }
                  ]} 
                />
              ))}
            </View>
          )}
        </View>

        <Animated.View style={styles.content}>
          <View style={styles.titleRow}>
            <ThemedText type="title" weight="bold" style={{ flex: 1 }}>{property.name}</ThemedText>
          </View>
          
          <ThemedText color={colors.mutedForeground} style={styles.address}>
            {property.address}
          </ThemedText>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Feather name="star" size={16} color={colors.primary} />
              <ThemedText weight="semibold">{property.rating.toFixed(1)}</ThemedText>
              <ThemedText color={colors.mutedForeground}>({property.reviewCount} reviews)</ThemedText>
            </View>
            <View style={styles.stat}>
              <Feather name="map-pin" size={16} color={colors.primary} />
              <ThemedText weight="medium" style={{ textTransform: 'capitalize' }}>
                {property.category}
              </ThemedText>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>About</ThemedText>
            <ThemedText color={colors.mutedForeground} style={{ lineHeight: 24 }}>
              {property.description}
            </ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Amenities</ThemedText>
            {amenityGroups.length === 0 ? (
              <ThemedText color={colors.mutedForeground}>No amenities have been listed for this property.</ThemedText>
            ) : (
              <>
                <View style={styles.amenitiesGrid}>
                  {amenityGroups.flatMap(g => g.amenities).slice(0, 6).map(a => (
                    <View key={`${a.id}-${a.name}`} style={styles.amenityItem}>
                      <AmenityGlyph icon={a.icon} color={colors.foreground} />
                      <ThemedText color={colors.foreground} style={{ flex: 1 }} numberOfLines={2}>{a.name}</ThemedText>
                    </View>
                  ))}
                </View>
                <Pressable
                  style={[styles.viewAllBtn, { borderColor: colors.border }]}
                  onPress={() => setAmenitiesOpen(true)}
                  accessibilityRole="button"
                >
                  <ThemedText weight="semibold">View all amenities</ThemedText>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <ThemedText type="subtitle" weight="bold" style={styles.sectionTitle}>Rooms</ThemedText>
            <View style={{ gap: 16 }}>
              {property.rooms?.map(room => (
                <View key={room.id} style={[styles.roomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={{ uri: getImageUrl(room.imageUrl) }} style={styles.roomImage} contentFit="cover" cachePolicy="memory-disk" transition={180} />
                  <View style={styles.roomContent}>
                    <ThemedText weight="bold">{room.name}</ThemedText>
                    <ThemedText type="caption" color={colors.mutedForeground}>
                      Up to {room.maxGuests} guests
                    </ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                      <ThemedText weight="bold">₹{room.pricePerNight.toLocaleString()}</ThemedText>
                      <ThemedText type="caption" color={colors.mutedForeground}> / night</ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {property.latitude != null && property.longitude != null && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <PropertyMap
                  latitude={property.latitude}
                  longitude={property.longitude}
                  name={property.name}
                />
              </View>
            </>
          )}

        </Animated.View>
      </ScrollView>

      <Modal visible={amenitiesOpen} animationType="slide" transparent onRequestClose={() => setAmenitiesOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAmenitiesOpen(false)} accessibilityLabel="Close amenities" />
          <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText type="subtitle" weight="bold">USP & Amenities</ThemedText>
              <Pressable onPress={() => setAmenitiesOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {amenityGroups.map((g, gi) => (
                <View key={g.id} style={[styles.modalGroup, gi > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <ThemedText weight="semibold" style={{ marginBottom: 12 }}>{g.name}</ThemedText>
                  <View style={styles.amenitiesGrid}>
                    {g.amenities.map(a => (
                      <View key={`${a.id}-${a.name}`} style={styles.amenityItem}>
                        <AmenityGlyph icon={a.icon} color={colors.foreground} />
                        <ThemedText color={colors.foreground} style={{ flex: 1 }}>{a.name}</ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Booking Bar */}
      <Animated.View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom || 24 }]}>
        <View style={styles.bottomBarContent}>
          <View>
            <ThemedText type="subtitle" weight="bold">₹{property.startingPrice.toLocaleString()}</ThemedText>
            <ThemedText type="caption" color={colors.mutedForeground}>avg / night</ThemedText>
          </View>
          <Pressable 
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/property/${property.id}/book`)}
          >
            <ThemedText weight="bold" color="#fff">Check Availability</ThemedText>
          </Pressable>
        </View>
      </Animated.View>
    </ThemedView>
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
  imageHeader: {
    height: 300,
    position: 'relative',
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  address: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 16,
  },
  section: {},
  sectionTitle: {
    marginBottom: 12,
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '48%',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11,26,48,0.45)',
  },
  modalSheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalGroup: {
    paddingVertical: 16,
  },
  roomCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  roomImage: {
    width: 100,
    height: 100,
  },
  roomContent: {
    padding: 12,
    flex: 1,
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
