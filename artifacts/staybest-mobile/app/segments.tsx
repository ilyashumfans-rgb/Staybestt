import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function SegmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { city } = useLocalSearchParams<{ city: string }>();

  const segments = [
    {
      id: 'budget',
      title: 'Budget Hotels',
      subtitle: 'Comfortable stays at affordable prices',
      icon: 'bed',
      bgColor: '#fff3eb',
    },
    {
      id: 'prime',
      title: 'Premium Hotels',
      subtitle: 'Great comfort & quality',
      icon: 'building',
      bgColor: '#f0f3f7',
    },
    {
      id: 'luxury',
      title: 'Luxury Hotels',
      subtitle: 'Indulge in luxury experiences',
      icon: 'crown',
      bgColor: '#fff3eb',
    },
    {
      id: 'package',
      title: 'Tour Packages',
      subtitle: 'All-inclusive getaways',
      icon: 'suitcase',
      bgColor: '#f0f3f7',
    }
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="subtitle" weight="bold">Explore Hotels</ThemedText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText color={colors.mutedForeground} style={{ marginBottom: 24 }}>
          {city ? `Choose a segment in ${city}` : 'Choose a segment'}
        </ThemedText>

        <View style={styles.list}>
          {segments.map(seg => (
            <Pressable 
              key={seg.id}
              style={[styles.card, { backgroundColor: seg.bgColor }]}
              onPress={() => router.push({ pathname: '/list', params: { city, category: seg.id } })}
            >
              <View style={[styles.iconBox, { backgroundColor: '#fff' }]}>
                <FontAwesome5 name={seg.icon} size={24} color={colors.primary} />
              </View>
              <View style={styles.cardContent}>
                <ThemedText weight="bold" type="subtitle">{seg.title}</ThemedText>
                <ThemedText type="caption" color={colors.mutedForeground} style={{ marginTop: 4 }}>
                  {seg.subtitle}
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={24} color={colors.primary} />
            </Pressable>
          ))}
        </View>
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
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  content: {
    padding: 24,
  },
  list: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
});