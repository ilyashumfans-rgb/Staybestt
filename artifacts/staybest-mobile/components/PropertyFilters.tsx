import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { amenityKey, getGetAmenityCatalogQueryKey, getListPropertyCategoriesQueryKey, useGetAmenityCatalog, useListPropertyCategories, type SearchPropertiesParams } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';

export function PropertyFilters({ value, onChange, sortOnly = false }: {
  value: SearchPropertiesParams;
  onChange: (value: SearchPropertiesParams) => void;
  sortOnly?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const categories = useListPropertyCategories({ query: { queryKey: getListPropertyCategoriesQueryKey(), staleTime: 30000, enabled: visible } });
  const catalog = useGetAmenityCatalog({ query: { queryKey: getGetAmenityCatalogQueryKey(), staleTime: 30000, enabled: visible } });
  const update = (patch: Partial<SearchPropertiesParams>) => onChange({ ...value, ...patch });
  const choice = (label: string, checked: boolean, action: () => void) => (
    <Pressable key={label} accessibilityRole="checkbox" accessibilityState={{ checked }}
      onPress={action} style={{ paddingVertical: 12, flexDirection: 'row', gap: 10 }}>
      <ThemedText color={checked ? colors.primary : colors.mutedForeground}>{checked ? '☑' : '□'}</ThemedText>
      <ThemedText style={{ flex: 1 }} color={checked ? colors.primary : colors.foreground}>{label}</ThemedText>
    </Pressable>
  );
  const selected = (value.amenities ?? '').split(',').filter(Boolean);
  const preferenceFlag = (name: string) => {
    const key = amenityKey(name);
    return key === 'freecancellation' ? 'freeCancellation' : key === 'breakfastincluded' ? 'breakfastIncluded' : undefined;
  };
  const isSelected = (name: string) => {
    const flag = preferenceFlag(name);
    return !!(flag && value[flag]) || selected.some(item => amenityKey(item) === amenityKey(name));
  };
  const toggle = (name: string) => {
    const flag = preferenceFlag(name);
    const remaining = selected.filter(item => amenityKey(item) !== amenityKey(name));
    if (!flag && !isSelected(name)) remaining.push(name);
    update({ amenities: remaining.join(',') || undefined, ...(flag ? { [flag]: !isSelected(name) || undefined } : {}) });
  };
  const groupList = [...(catalog.data?.categories ?? [])].sort((a, b) =>
    Number(b.name.toLowerCase() === 'preferences') - Number(a.name.toLowerCase() === 'preferences'));
  return <>
    <Pressable testID={sortOnly ? 'property-sort' : 'property-filters'} onPress={() => setVisible(true)} style={{ padding: 12 }}>
      <ThemedText weight="semibold" color={colors.primary}>{sortOnly ? 'Sort' : 'Filters'}</ThemedText>
    </Pressable>
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12), paddingBottom: insets.bottom + 12 }}>
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ThemedText type="subtitle" weight="bold">{sortOnly ? 'Sort results' : 'Filters'}</ThemedText>
          <Pressable onPress={() => setVisible(false)} style={{ padding: 12 }}><ThemedText color={colors.primary}>Done</ThemedText></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {!sortOnly && <>
            <ThemedText weight="bold">Category</ThemedText>
            {categories.isLoading && <ThemedText>Loading categories…</ThemedText>}
            {categories.isError && <Pressable onPress={() => categories.refetch()}><ThemedText>Could not load categories. Retry</ThemedText></Pressable>}
            {choice('All categories', !value.category, () => update({ category: undefined, subcategory: undefined }))}
            {categories.data?.filter(item => item.active).map(item => choice(item.name, value.category === item.slug,
              () => update({ category: item.slug, subcategory: undefined })))}
            {!!value.category && <View style={{ marginVertical: 16 }}>
              <ThemedText weight="bold">Subcategories</ThemedText>
              {(categories.data?.find(item => item.slug === value.category)?.subcategories ?? []).map(name =>
                choice(name, value.subcategory === name, () => update({ subcategory: value.subcategory === name ? undefined : name })))}
            </View>}
            {catalog.isLoading && <ThemedText>Loading preferences and amenities…</ThemedText>}
            {catalog.isError && <Pressable onPress={() => catalog.refetch()}><ThemedText>Could not load amenities. Retry</ThemedText></Pressable>}
            {groupList.map(group => {
              const expanded = open[group.id] ?? group.name.toLowerCase() === 'preferences';
              return <View key={group.id} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen({ ...open, [group.id]: !expanded })} style={{ paddingVertical: 12 }}>
                  <ThemedText weight="bold">{group.name} {expanded ? '−' : '+'}</ThemedText>
                </Pressable>
                {expanded && group.amenities.map(item => choice(item.name, isSelected(item.name), () => toggle(item.name)))}
              </View>;
            })}
            <ThemedText weight="bold" style={{ marginTop: 20 }}>Nightly price</ThemedText>
            {choice('Any price', !value.maxPrice, () => update({ minPrice: undefined, maxPrice: undefined }))}
            {[1000, 2500, 5000, 10000].map(price => choice(`Up to ₹${price.toLocaleString('en-IN')}`, value.maxPrice === price, () => update({ maxPrice: price })))}
            <ThemedText weight="bold" style={{ marginTop: 20 }}>Minimum rating</ThemedText>
            {choice('Any rating', !value.minRating, () => update({ minRating: undefined }))}
            {[3, 4, 4.5].map(rating => choice(`${rating}+`, value.minRating === rating, () => update({ minRating: rating })))}
          </>}
          <ThemedText weight="bold" style={{ marginTop: 20 }}>Sort by</ThemedText>
          {[
            ['popular', 'Popularity'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating_desc', 'Highest rated'],
            ...(value.latitude != null ? [['distance', 'Nearest first']] : []),
          ].map(([sort, label]) => choice(label, value.sort === sort, () => update({ sort })))}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Pressable onPress={() => update({ category: undefined, subcategory: undefined, amenities: undefined, freeCancellation: undefined, breakfastIncluded: undefined, minPrice: undefined, maxPrice: undefined, minRating: undefined, sort: undefined })} style={{ padding: 14 }}><ThemedText>Clear filters</ThemedText></Pressable>
          <Pressable onPress={() => setVisible(false)} style={{ padding: 14 }}><ThemedText weight="bold" color={colors.primary}>Show results</ThemedText></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
