import React from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleGetStarted = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    router.replace('/(tabs)');
  };

  const handleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.imageWrapper}>
        <Image
          source={require('../assets/images/welcome-hero.jpg')}
          style={styles.heroImage}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0)', colors.background]}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.textContent}>
          <Image
            source={require('../assets/images/staybest-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="title" weight="bold" style={styles.title}>
            Find Your{'\n'}Perfect Stay
          </ThemedText>
          <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
            Premium stays, unbeatable prices, and an AI concierge ready to plan your next getaway.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 }
            ]}
            onPress={handleGetStarted}
          >
            <ThemedText weight="bold" color="#fff" style={styles.btnText}>Start Exploring</ThemedText>
          </Pressable>

          <View style={styles.loginRow}>
            <ThemedText color={colors.mutedForeground} style={styles.loginLabel}>Already have an account? </ThemedText>
            <Link href="/sign-in" asChild onPress={handleLogin}>
              <Pressable hitSlop={12}>
                <ThemedText weight="bold" color={colors.primary} style={styles.loginLabel}>Log in</ThemedText>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageWrapper: {
    width: '100%',
    height: '60%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'flex-end',
  },
  textContent: {
    marginBottom: 48,
  },
  logo: {
    width: width * 0.28,
    height: width * 0.28,
    marginBottom: 20,
  },
  title: {
    fontSize: 40,
    lineHeight: 48,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    gap: 24,
  },
  primaryBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff6b00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  btnText: {
    fontSize: 18,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginLabel: {
    fontSize: 16,
  },
});
