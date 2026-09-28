import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Platform, Dimensions, Share } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useGetProperty, getGetPropertyQueryKey } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getImageUrl } from '@/utils/images';
import { HeartButton } from '@/components/HeartButton';
import Animated from 'react-native-reanimated';
import { PropertyMap } from '@/components/PropertyMap';

const { width } = Dimensions.get('window');

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
    try {
      await Share.share({
        message: `Check out ${property.name} on StayBest!`,
        url: `https://staybest.com/property/${property.id}`, // Mock URL
      });
    } catch (error) {}
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
            <View style={styles.amenitiesGrid}>
              {property.amenities?.map((amenity, i) => (
                <View key={i} style={styles.amenityItem}>
                  <Feather name="check" size={18} color={colors.primary} />
                  <ThemedText color={colors.foreground}>{amenity}</ThemedText>
                </View>
              ))}
            </View>
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
