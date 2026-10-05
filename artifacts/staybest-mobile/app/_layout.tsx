import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, View, Text } from 'react-native';
import Constants from 'expo-constants';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, StartupErrorBoundary } from '@/components/ErrorBoundary';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { ClerkProvider, useAuth } from '@clerk/expo';
import {
  addNotificationResponseListener,
  configureForegroundNotifications,
  getLastNotificationResponse,
  type NotificationResponse,
} from '@/utils/notificationService';
import { getSecureItem, setSecureItem } from '@/utils/secureStorage';

configureForegroundNotifications();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

const queryClient = new QueryClient();

const tokenCache = {
  async getToken(key: string) {
    try {
      return await getSecureItem(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await setSecureItem(key, value);
    } catch (err) {
      return;
    }
  },
};

function AuthSetup({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    const openNotification = (response: NotificationResponse) => {
      if (!isSignedIn) return;
      const candidate = response.notification.request.content.data?.url;
      // Only permit internal, known routes from a push payload.
      if (typeof candidate === 'string' && /^(\/(property\/\d+|booking-confirmed|trips|wishlist|profile|list)(\?.*)?)$/.test(candidate)) {
        router.push(candidate as never);
      }
    };
    const responseSubscription = addNotificationResponseListener(openNotification);
    getLastNotificationResponse().then((response) => {
      if (response) openNotification(response);
    }).catch(() => undefined);
    return () => responseSubscription.remove();
  }, [isSignedIn, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
      <Stack.Screen name="property/[id]" />
      <Stack.Screen name="segments" />
      <Stack.Screen name="list" />
      <Stack.Screen name="booking-confirmed" />
      <Stack.Screen name="payment-result" />
      <Stack.Screen name="assistant" />
    </Stack>
  );
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  Constants.expoConfig?.extra?.clerkPublishableKey;

export default function RootLayout() {
  return <StartupErrorBoundary><ConfiguredRootLayout /></StartupErrorBoundary>;
}

function ConfiguredRootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  if (typeof publishableKey !== 'string' || !/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(publishableKey)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>StayBest update required</Text>
        <Text style={{ textAlign: 'center' }}>This app build is missing its sign-in configuration. Please install the latest update or contact StayBest support.</Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AuthSetup>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </AuthSetup>
    </ClerkProvider>
  );
}