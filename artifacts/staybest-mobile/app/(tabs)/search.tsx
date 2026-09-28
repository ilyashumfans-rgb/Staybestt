import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSearchProperties, getSearchPropertiesQueryKey, useListPropertyCategories } from '@workspace/api-client-react';
import { PropertyCard } from '@/components/PropertyCard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState((params.city as string) || '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>((params.category as string) || null);
  const [isLocating, setIsLocating] = useState(false);
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);
  
  const debouncedQuery = useDebounce(query, 500);
  const { data: categories = [] } = useListPropertyCategories();

  const searchParams = {
    q: debouncedQuery,
    category: selectedCategory || undefined,
    latitude: nearby?.latitude,
    longitude: nearby?.longitude,
    radiusKm: nearby ? 50 : undefined,
    sort: nearby ? 'distance' : undefined,
  };

  const { data: properties, isLoading } = useSearchProperties(
    searchParams,
    { query: { queryKey: getSearchPropertiesQueryKey(searchParams) } }
  );

  const paddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top + 20;
  const paddingBottom = Platform.OS === 'web' ? 84 + 20 : 100;

  const handleNearMe = async () => {
    if (nearby) {
      setNearby(null);
      return;
    }
    try {
      setIsLocating(true);
      if (Platform.OS === 'web') {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            setNearby({ latitude: coords.latitude, longitude: coords.longitude });
            setIsLocating(false);
          },
          () => {
            setIsLocating(false);
            Alert.alert('Location unavailable', 'Allow location access and try again.');
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
        );
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location unavailable', 'Allow location access in your device settings and try again.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setNearby({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch {
      Alert.alert('Location unavailable', 'We could not determine your location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop }]}>
        <View>
          <ThemedText style={styles.pageTitle}>Find your perfect stay</ThemedText>
          <ThemedText style={styles.pageSubtitle}>Search nearby or browse by category</ThemedText>
        </View>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={20} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Search by city, property, area..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Feather name="x-circle" size={20} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable
            onPress={handleNearMe}
            disabled={isLocating}
            style={[
              styles.filterChip,
              {
                backgroundColor: nearby ? colors.primary : colors.card,
                borderColor: nearby ? colors.primary : colors.border,
              },
            ]}
          >
            {isLocating
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="navigation" size={15} color={nearby ? '#fff' : colors.primary} />}
            <ThemedText type="caption" weight="bold" color={nearby ? '#fff' : colors.foreground}>
              Near Me
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setSelectedCategory(null)}
            style={[
              styles.filterChip,
              {
                backgroundColor: selectedCategory === null ? colors.primary : colors.card,
                borderColor: selectedCategory === null ? colors.primary : colors.border,
              },
            ]}
          >
            <ThemedText type="caption" weight="bold" color={selectedCategory === null ? '#fff' : colors.foreground}>
              All
            </ThemedText>
          </Pressable>
          {categories.map(category => {
            const isSelected = selectedCategory === category.slug;
            return (
              <Pressable
                key={category.id}
                onPress={() => setSelectedCategory(isSelected ? null : category.slug)}
                style={[
                  styles.filterChip,
                  { 
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border
                  }
                ]}
              >
                <ThemedText
                  type="caption"
                  weight={isSelected ? 'bold' : 'medium'}
                  color={isSelected ? '#fff' : colors.foreground}
                  style={{ textTransform: 'capitalize' }}
                >
                  {category.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {!isLoading && (
          <View style={styles.resultsHeader}>
            <ThemedText style={styles.resultsTitle}>
              {nearby ? 'Properties near you' : selectedCategory
                ? `${categories.find(category => category.slug === selectedCategory)?.name ?? 'Category'} stays`
                : 'All properties'}
            </ThemedText>
            <ThemedText style={styles.resultsCount}>{properties?.length ?? 0} found</ThemedText>
          </View>
        )}
        {isLoading ? (
          <View style={styles.centerMsg}>
            <ThemedText color={colors.mutedForeground}>Searching...</ThemedText>
          </View>
        ) : properties?.length === 0 ? (
          <View style={styles.centerMsg}>
            <Feather name="search" size={48} color={colors.border} style={{ marginBottom: 16 }} />
            <ThemedText type="subtitle" weight="semibold">{nearby ? 'No hotels nearby' : 'No results found'}</ThemedText>
            <ThemedText color={colors.mutedForeground} style={{ textAlign: 'center', marginTop: 8 }}>
              {nearby
                ? 'No hotels with confirmed locations were found within 50 km.'
                : 'Try adjusting your filters or search query to find your perfect stay.'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.resultsGrid}>
            {properties?.map(prop => (
              <View key={prop.id} style={styles.resultItem}>
                <PropertyCard property={prop} compact />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    backgroundColor: '#fff8f2',
  },
  pageTitle: {
    color: '#0b1a30',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  pageSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 13,
    gap: 8,
    borderWidth: 1,
    shadowColor: '#0b1a30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  filters: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    flexGrow: 1,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultsTitle: { color: '#0b1a30', fontSize: 16, fontWeight: '800' },
  resultsCount: { color: '#ff6b00', fontSize: 11, fontWeight: '700' },
  centerMsg: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  resultsGrid: {
    gap: 12,
  },
  resultItem: {
    width: '100%',
  },
});
