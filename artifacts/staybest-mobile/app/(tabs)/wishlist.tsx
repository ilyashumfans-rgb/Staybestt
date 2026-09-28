import React from 'react';
import { StyleSheet, View, Pressable, ScrollView, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useGetWishlist, getGetWishlistQueryKey } from '@workspace/api-client-react';
import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { PropertyCard } from '@/components/PropertyCard';

export default function WishlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const email = user?.primaryEmailAddress?.emailAddress;

  const { data: wishlist, isLoading } = useGetWishlist(
    { email },
    { query: { enabled: !!isSignedIn, queryKey: getGetWishlistQueryKey({ email }) } }
  );

  const paddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top + 20;
  const paddingBottom = Platform.OS === 'web' ? 84 + 20 : 100;

  if (!isSignedIn) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.centerContent, { paddingTop }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
            <Feather name="heart" size={32} color={colors.primary} />
          </View>
          <ThemedText type="title" weight="bold" style={styles.title}>Log in to view your wishlists</ThemedText>
          <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
            You can create, view, or edit wishlists once you've logged in.
          </ThemedText>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/sign-in')}
          >
            <ThemedText weight="semibold" color="#fff">Log In</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop, paddingBottom, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="title" weight="bold">Wishlist</ThemedText>
        </View>

        {isLoading ? (
          <View style={styles.centerMsg}>
            <ThemedText color={colors.mutedForeground}>Loading your favorites...</ThemedText>
          </View>
        ) : wishlist?.length === 0 ? (
          <View style={styles.centerMsg}>
            <Feather name="heart" size={48} color={colors.border} style={{ marginBottom: 16 }} />
            <ThemedText type="subtitle" weight="semibold">No favorites yet</ThemedText>
            <ThemedText color={colors.mutedForeground} style={{ textAlign: 'center', marginTop: 8 }}>
              As you search, tap the heart icon to save your favorite properties.
            </ThemedText>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.foreground, marginTop: 24 }]}
              onPress={() => router.push('/search')}
            >
              <ThemedText weight="semibold" color={colors.background}>Start Searching</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {wishlist?.map(prop => (
              <View key={prop.id} style={styles.gridItem}>
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
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  btn: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  centerMsg: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  grid: {
    paddingHorizontal: 16,
    gap: 16,
  },
  gridItem: {
    width: '100%',
  },
});
