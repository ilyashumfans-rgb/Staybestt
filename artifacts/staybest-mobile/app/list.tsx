import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { useSearchProperties, getSearchPropertiesQueryKey, useListPropertyCategories } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PropertyCard } from '@/components/PropertyCard';
import { PropertyFilters } from '@/components/PropertyFilters';
import type { SearchPropertiesParams } from '@workspace/api-client-react';

export default function HotelListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { q, city, category, subcategory: initialSubcategory, country, state, title, maxPrice, latitude, longitude, radiusKm, sort } = useLocalSearchParams<{
    q?: string;
    city?: string;
    category?: string;
    subcategory?: string;
    country?: string;
    state?: string;
    title?: string;
    maxPrice?: string;
    latitude?: string;
    longitude?: string;
    radiusKm?: string;
    sort?: string;
  }>();

  const { data: categories = [] } = useListPropertyCategories();
  const [filters, setFilters] = useState<SearchPropertiesParams>({ category: category === 'all' ? undefined : category, subcategory: initialSubcategory, maxPrice: maxPrice ? Number(maxPrice) : undefined, sort });
  useEffect(() => {
    setFilters({ category: category === 'all' ? undefined : category, subcategory: initialSubcategory, maxPrice: maxPrice ? Number(maxPrice) : undefined, sort });
  }, [category, initialSubcategory, maxPrice, sort, q, city, country, state]);
  const currentCategory = categories.find(item => item.slug === filters.category);
  const searchParams = {
    ...filters,
    q,
    city: city || undefined,
    country: country || undefined,
    state: state || undefined,
    latitude: latitude ? Number(latitude) : undefined,
    longitude: longitude ? Number(longitude) : undefined,
    radiusKm: radiusKm ? Number(radiusKm) : undefined,
  };

  const { data: properties, isLoading } = useSearchProperties(
    searchParams,
    { query: { queryKey: getSearchPropertiesQueryKey(searchParams) } }
  );

  const getCategoryName = () => {
    if (currentCategory) return currentCategory.name;
    return 'Stays';
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="subtitle" weight="bold" numberOfLines={1}>
            {title || ((q || city || state || country) ? `${getCategoryName()} in ${q || city || state || country}` : getCategoryName())}
          </ThemedText>
        </View>
      </View>

      {!!currentCategory?.subcategories?.length && <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {currentCategory.subcategories.map(name => <Pressable key={name}
            accessibilityRole="checkbox" accessibilityState={{ checked: filters.subcategory === name }}
            onPress={() => setFilters({ ...filters, subcategory: filters.subcategory === name ? undefined : name })}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 10, backgroundColor: filters.subcategory === name ? colors.primary : colors.card }}>
            <ThemedText type="caption" color={filters.subcategory === name ? "#fff" : colors.foreground}>{name}</ThemedText>
          </Pressable>)}
        </ScrollView>
      </View>}
      <View style={[styles.subHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText weight="medium">
          {isLoading ? 'Searching...' : `${properties?.length || 0} Properties Found`}
        </ThemedText>
        <View style={styles.actions}>
          <PropertyFilters value={searchParams} onChange={setFilters} />
          <PropertyFilters value={searchParams} onChange={setFilters} sortOnly />
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : properties?.length === 0 ? (
          <View style={styles.centerMsg}>
            <Feather name="search" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <ThemedText type="subtitle" weight="semibold">No results found</ThemedText>
            <ThemedText color={colors.mutedForeground} style={{ textAlign: 'center', marginTop: 8 }}>
              We couldn't find any {getCategoryName().toLowerCase()}{(q || city || state || country) ? ` in ${q || city || state || country}` : ''}.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.resultsGrid}>
            {properties?.map(prop => (
              <View key={prop.id} style={styles.resultItem}>
                <PropertyCard property={prop} fullWidth />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },
  centerMsg: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  resultsGrid: {
    gap: 16,
  },
  resultItem: {
    width: '100%',
  },
});