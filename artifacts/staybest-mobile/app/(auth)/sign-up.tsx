import React, { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO, useSignUp } from '@clerk/expo';
import { useRouter, Link } from 'expo-router';
import { View, Platform, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWarmUpBrowser } from './sign-in';

export default function SignUpPage() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startSSOFlow } = useSSO();
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!signUp) return;

    try {
      const { error } = await signUp.password({
        emailAddress,
        password,
      });

      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await signUp.verifications.sendEmailCode();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleVerify = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!signUp) return;

    try {
      await signUp.verifications.verifyEmailCode({ code });

      if (signUp.status === 'complete') {
        await signUp.finalize();
        router.dismissAll();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const getError = (field: string) => {
    return errors?.fields?.[field as keyof typeof errors.fields]?.message || '';
  };
  
  const hasErrors = errors?.fields && Object.keys(errors.fields).length > 0;

  const renderVerification = () => (
    <>
      <ThemedText type="title" style={styles.title}>Check your email.</ThemedText>
      <ThemedText type="default" color={colors.mutedForeground} style={styles.subtitle}>
        We sent a verification code to {emailAddress}.
      </ThemedText>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <ThemedText type="caption" weight="medium">Verification Code</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: getError('code') ? colors.destructive : colors.border }]}
            value={code}
            placeholder="Enter code"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setCode}
            keyboardType="numeric"
            maxLength={6}
          />
          {getError('code') ? <ThemedText type="caption" color={colors.destructive}>{getError('code')}</ThemedText> : null}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            (!code || fetchStatus === 'fetching') && { opacity: 0.7 },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleVerify}
          disabled={!code || fetchStatus === 'fetching'}
        >
          <ThemedText style={styles.buttonText} weight="semibold">Verify</ThemedText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => signUp?.verifications.sendEmailCode()}
        >
          <ThemedText color={colors.primary} weight="medium">Resend Code</ThemedText>
        </Pressable>
      </View>
    </>
  );

  const renderForm = () => (
    <>
      <ThemedText type="title" style={styles.title}>Create account.</ThemedText>
      <ThemedText type="default" color={colors.mutedForeground} style={styles.subtitle}>
        Join StayBest and start exploring weekend escapes.
      </ThemedText>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <ThemedText type="caption" weight="medium">Email</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: getError('emailAddress') ? colors.destructive : colors.border }]}
            autoCapitalize="none"
            value={emailAddress}
            placeholder="Enter your email"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setEmailAddress}
            keyboardType="email-address"
          />
          {getError('emailAddress') ? <ThemedText type="caption" color={colors.destructive}>{getError('emailAddress')}</ThemedText> : null}
        </View>

        <View style={styles.inputGroup}>
          <ThemedText type="caption" weight="medium">Password</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: getError('password') ? colors.destructive : colors.border }]}
            value={password}
            placeholder="Create a password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            onChangeText={setPassword}
          />
          {getError('password') ? <ThemedText type="caption" color={colors.destructive}>{getError('password')}</ThemedText> : null}
        </View>

        {hasErrors && !getError('emailAddress') && !getError('password') ? (
            <ThemedText type="caption" color={colors.destructive} style={{marginBottom: 8}}>
              Something went wrong. Please try again.
            </ThemedText>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            (!emailAddress || !password || fetchStatus === 'fetching') && { opacity: 0.7 },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSubmit}
          disabled={!emailAddress || !password || fetchStatus === 'fetching'}
        >
          <ThemedText style={styles.buttonText} weight="semibold">Sign Up</ThemedText>
        </Pressable>

        <View style={styles.divider}>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
          <ThemedText type="caption" color={colors.mutedForeground} style={styles.orText}>OR</ThemedText>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.oauthBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleOAuth}
        >
          <Feather name="chrome" size={20} color={colors.foreground} />
          <ThemedText style={styles.oauthText} weight="medium">Continue with Google</ThemedText>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <ThemedText type="default" color={colors.mutedForeground}>Already have an account? </ThemedText>
        <Link href="/sign-in" asChild>
          <Pressable hitSlop={10}>
            <ThemedText type="default" color={colors.primary} weight="semibold">Sign in</ThemedText>
          </Pressable>
        </Link>
      </View>
    </>
  );

  const isVerifying = 
    signUp?.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: colors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={24} color={colors.foreground} />
        </Pressable>

        {isVerifying ? renderVerification() : renderForm()}
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    marginTop: 40,
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 32,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  line: {
    flex: 1,
    height: 1,
  },
  orText: {
    paddingHorizontal: 16,
  },
  oauthBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    gap: 12,
  },
  oauthText: {
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: 32,
  },
});
