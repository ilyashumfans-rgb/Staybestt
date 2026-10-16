import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { StyleSheet, View, Pressable, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@clerk/expo';
import { ThemedText } from '@/components/ThemedText';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const [logoComplete, setLogoComplete] = useState(false);
  const [connectionTimeout, setConnectionTimeout] = useState(false);
  const [retryError, setRetryError] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setConnectionTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => setLogoComplete(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoaded && connectionTimeout) {
    return <View style={[styles.container, { padding: 28 }]}>
      <ThemedText style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Unable to connect to StayBest</ThemedText>
      <ThemedText style={{ marginTop: 14, textAlign: 'center' }}>Sign-in is taking longer than expected. Check your internet connection and try again.</ThemedText>
      <Pressable accessibilityRole="button" testID="startup-retry" style={{ marginTop: 24, backgroundColor: '#ff6b00', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 }} onPress={async () => {
        try {
          if (Platform.OS === 'web') window.location.reload();
          else await reloadAppAsync();
        } catch { setRetryError(true); }
      }}><ThemedText style={{ color: '#fff', fontWeight: '700' }}>Try again</ThemedText></Pressable>
      {retryError && <ThemedText style={{ marginTop: 12, textAlign: 'center' }}>Please close StayBest and reopen it.</ThemedText>}
    </View>;
  }
  if (!logoComplete || !isLoaded) {
    return (
      <LinearGradient colors={['#fffaf6', '#ffffff']} style={styles.container}>
        <View style={styles.glow} />
        <View style={styles.logoCard}>
          <Image
            source={require('../assets/images/staybest-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>
        <ThemedText style={styles.tagline}>Find your perfect stay</ThemedText>
        <View style={styles.loaderTrack}>
          <View style={styles.loaderFill} />
        </View>
      </LinearGradient>
    );
  }

  return <Redirect href={isSignedIn ? '/(tabs)' : '/sign-in'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,107,0,0.08)',
  },
  logoCard: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
  tagline: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  loaderTrack: {
    width: 72,
    height: 3,
    marginTop: 24,
    borderRadius: 2,
    backgroundColor: '#ffe4d1',
    overflow: 'hidden',
  },
  loaderFill: {
    width: '72%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#ff6b00',
  },
});