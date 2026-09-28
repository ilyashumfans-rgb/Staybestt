import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from './ThemedText';
import { getImageUrl } from '@/utils/images';
import { PropertySummary } from '@workspace/api-client-react';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { HeartButton } from './HeartButton';
import { Link } from 'expo-router';

interface PropertyCardProps {
  property: PropertySummary;
  featured?: boolean;
  fullWidth?: boolean;
  compact?: boolean;
}

export function PropertyCard({ property, featured = false, fullWidth = false, compact = false }: PropertyCardProps) {
  const colors = useColors();

  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable style={StyleSheet.flatten([
        styles.container as object,
        featured ? (styles.featuredContainer as object) : undefined,
        fullWidth ? (styles.fullWidthContainer as object) : undefined,
        compact ? (styles.compactContainer as object) : undefined,
        fullWidth ? {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }
      ])}>
        <View style={[
          styles.imageContainer,
          featured ? styles.featuredImageContainer : undefined,
          compact ? styles.compactImageContainer : undefined,
        ]}>
          <Image
            source={{ uri: getImageUrl(property.imageUrl) }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={180}
          />
          <HeartButton propertyId={property.id} style={styles.heartButton} />
          
          {property.featured && (
            <View style={[styles.badge, { backgroundColor: colors.foreground }]}>
              <ThemedText type="caption" color={colors.background} weight="semibold" style={styles.badgeText}>
                STAYBEST PICK
              </ThemedText>
            </View>
          )}
        </View>

        <View style={[
          styles.content,
          featured ? styles.featuredContent : undefined,
          compact ? styles.compactContent : undefined,
        ]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" weight="semibold" numberOfLines={1}>
                {property.name}
              </ThemedText>
              <ThemedText type="caption" color={colors.mutedForeground} style={styles.location}>
                {property.area}, {property.city}
              </ThemedText>
            </View>
            <View style={[styles.rating, { backgroundColor: colors.accent }]}>
              <FontAwesome name="star" size={14} color={colors.primary} />
              <ThemedText type="caption" weight="semibold">{property.rating.toFixed(1)}</ThemedText>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.priceRow}>
              <ThemedText type="subtitle" weight="bold">₹{property.startingPrice.toLocaleString()}</ThemedText>
              <ThemedText type="caption" color={colors.mutedForeground}> / night</ThemedText>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              {property.freeCancellation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="check" size={12} color="#10b981" />
                  <ThemedText type="caption" color="#10b981">Free cancellation</ThemedText>
                </View>
              )}
              {property.breakfastIncluded && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="coffee" size={12} color={colors.primary} />
                  <ThemedText type="caption" color={colors.primary}>Breakfast inc.</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    marginRight: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredContainer: {
    width: 244,
    borderRadius: 18,
  },
  fullWidthContainer: {
    width: '100%',
    marginRight: 0,
  },
  compactContainer: {
    width: '100%',
    height: 138,
    marginRight: 0,
    flexDirection: 'row',
    borderRadius: 18,
  },
  imageContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#e2e8f0',
  },
  featuredImageContainer: {
    height: 142,
  },
  compactImageContainer: {
    width: 126,
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  heartButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  featuredContent: {
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  compactContent: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 11,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  location: {
    marginTop: 2,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  footer: {
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});