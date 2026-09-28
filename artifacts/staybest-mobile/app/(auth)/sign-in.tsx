import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO, useSignIn } from '@clerk/expo';
import { useRouter, Link } from 'expo-router';
import { Animated, Easing, View, Platform, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { Feather, AntDesign } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

export const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');

export default function SignInPage() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startSSOFlow } = useSSO();
  const { signIn, errors, fetchStatus } = useSignIn();
  const logoMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(logoMotion, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoMotion, {
          toValue: -1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoMotion, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [logoMotion]);
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState('');
  const [usernameMode, setUsernameMode] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasAttemptedSignIn, setHasAttemptedSignIn] = useState(false);

  const handleOAuth = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
        router.dismissAll();
      }
    } catch (err) {
      console.error('OAuth error', err);
    }
  }, [startSSOFlow, router]);

  const handleSubmit = async () => {
    setHasAttemptedSignIn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!signIn) return;

    try {
      setLoginError('');
      if (usernameMode) {
        const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
        if (!domain) throw new Error('StayBest API domain is not configured.');
        const origin = /^https?:\/\//i.test(domain) ? domain.replace(/\/+$/, '') : `https://${domain.replace(/\/+$/, '')}`;
        const response = await fetch(`${origin}/api/customer/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: emailAddress.trim(), password }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || 'Could not sign in. Please try again.');
        }
        const body: unknown = await response.json();
        const ticket = typeof body === 'object' && body !== null && 'ticket' in body && typeof body.ticket === 'string'
          ? body.ticket : null;
        if (!ticket) throw new Error('The sign-in response was invalid. Please try again.');
        const ticketResult = await signIn.ticket({ ticket });
        if (ticketResult.error) throw ticketResult.error;
        const completed = await signIn.finalize();
        if (completed.error) throw completed.error;
        router.dismissAll();
        return;
      }
      const { error } = await signIn.password({
        emailAddress,
        password,
      });

      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (signIn.status === 'complete') {
        await signIn.finalize();
        router.dismissAll();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Could not sign in. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleContinueWithoutLogin = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    router.replace('/(tabs)');
  };

  const getError = (field: string) => {
    return errors?.fields?.[field as keyof typeof errors.fields]?.message || '';
  };

  const hasErrors = errors?.fields && Object.keys(errors.fields).length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Image
        source={require('../../assets/images/login-background.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,248,242,0.58)', 'rgba(255,250,246,0.92)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void handleContinueWithoutLogin();
            }}
            style={[styles.closeBtn, { backgroundColor: colors.card }]}
            hitSlop={12}
          >
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.logoMotion,
            {
              transform: [
                {
                  translateY: logoMotion.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [2, 0, -3],
                  }),
                },
                {
                  rotate: logoMotion.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-1.5deg', '0deg', '1.5deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/staybest-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>

        <View style={styles.loginCard}>
        <View style={styles.titleSection}>
          <ThemedText type="title" weight="bold" style={styles.title}>Welcome Back!</ThemedText>
          <ThemedText color={colors.mutedForeground} style={styles.subtitle}>
            Log in to continue your journey
          </ThemedText>
        </View>

        <View style={styles.form}>
          <Pressable onPress={() => { setUsernameMode(!usernameMode); setEmailAddress(''); setLoginError(''); }} accessibilityRole="button">
            <ThemedText style={{ color: colors.primary, textAlign: 'center' }}>
              {usernameMode ? 'Use email instead' : 'Have a customer username? Sign in with username'}
            </ThemedText>
          </Pressable>
          <View style={styles.inputWrapper}>
            <View style={[
              styles.inputContainer,
              { backgroundColor: '#f8fafc', borderColor: getError('identifier') ? colors.destructive : '#e2e8f0' }
            ]}>
              <Feather name="mail" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                autoCapitalize="none"
                value={emailAddress}
                placeholder={usernameMode ? "Username" : "Email address"}
                placeholderTextColor={colors.mutedForeground}
                onChangeText={setEmailAddress}
                keyboardType="email-address"
              />
            </View>
            {hasAttemptedSignIn && getError('identifier') ? <ThemedText type="caption" color={colors.destructive} style={styles.errorText}>{getError('identifier')}</ThemedText> : null}
          </View>

          <View style={styles.inputWrapper}>
            <View style={[
              styles.inputContainer,
              { backgroundColor: '#f8fafc', borderColor: getError('password') ? colors.destructive : '#e2e8f0' }
            ]}>
              <Feather name="lock" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                placeholder="Password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={() => setShowPassword((visible) => !visible)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
            {hasAttemptedSignIn && getError('password') ? <ThemedText type="caption" color={colors.destructive} style={styles.errorText}>{getError('password')}</ThemedText> : null}
          </View>

          {hasAttemptedSignIn && hasErrors && !getError('identifier') && !getError('password') ? (
            <ThemedText type="caption" color={colors.destructive} style={styles.errorText}>
              Invalid email or password.
            </ThemedText>
          ) : null}
          {loginError ? <ThemedText type="caption" color={colors.destructive}>{loginError}</ThemedText> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (!emailAddress || !password || fetchStatus === 'fetching') && { opacity: 0.5, shadowOpacity: 0 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleSubmit}
            disabled={!emailAddress || !password || fetchStatus === 'fetching'}
          >
            <ThemedText weight="bold" color="#fff" style={styles.primaryBtnText}>Log In</ThemedText>
          </Pressable>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <ThemedText type="caption" color={colors.mutedForeground} style={styles.orText}>OR CONTINUE WITH</ThemedText>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.oauthBtn,
              { backgroundColor: colors.background, borderColor: colors.border },
              pressed && { backgroundColor: colors.card },
            ]}
            onPress={handleOAuth}
          >
            <AntDesign name="google" size={24} color={colors.foreground} />
            <ThemedText weight="semibold" style={styles.oauthText}>Google</ThemedText>
          </Pressable>
        </View>

        <Pressable onPress={handleContinueWithoutLogin} style={styles.guestButton}>
          <ThemedText weight="bold" color="#0b1a30" style={styles.guestText}>
            Continue without login
          </ThemedText>
        </Pressable>

        <View style={styles.footer}>
          <ThemedText color={colors.mutedForeground} style={{ fontSize: 15 }}>Don't have an account? </ThemedText>
          <Link href="/sign-up" asChild>
            <Pressable hitSlop={12}>
              <ThemedText weight="bold" color={colors.primary} style={{ fontSize: 15 }}>Sign up</ThemedText>
            </Pressable>
          </Link>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff5ec',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 0,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: width * 0.8,
    height: 102,
    alignSelf: 'center',
  },
  logoMotion: {
    width: width * 0.8,
    height: 102,
    marginTop: 4,
    marginBottom: 16,
    alignSelf: 'center',
  },
  loginCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    marginTop: 22,
    marginHorizontal: 7,
    paddingHorizontal: 17,
    paddingTop: 17,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#0b1a30',
    shadowOffset: { width: -7, height: 14 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 12,
    transform: [
      { perspective: 900 },
      { rotateY: '-1.2deg' },
      { rotateX: '0.8deg' },
    ],
  },
  titleSection: {
    marginBottom: 13,
    alignItems: 'center',
  },
  title: {
    fontSize: 21,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  form: {
    gap: 9,
  },
  inputWrapper: {
    gap: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 13,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    height: '100%',
  },
  errorText: {
    paddingHorizontal: 16,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: '#ff6b00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 15,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  line: {
    flex: 1,
    height: 1,
  },
  orText: {
    paddingHorizontal: 16,
    letterSpacing: 1,
  },
  oauthBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    gap: 12,
  },
  googleIcon: {
    width: 24,
    height: 24,
  },
  oauthText: {
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  guestButton: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  guestText: {
    fontSize: 13,
    color: '#0b1a30',
  },
});
