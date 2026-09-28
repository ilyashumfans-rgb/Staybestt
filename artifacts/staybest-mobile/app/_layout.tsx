import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
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
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
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