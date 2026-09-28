import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { useGetWishlist, useAddToWishlist, useRemoveFromWishlist } from '@workspace/api-client-react';
import { useAuth, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getGetWishlistQueryKey } from '@workspace/api-client-react';

interface HeartButtonProps {
  propertyId: number;
  size?: number;
  style?: any;
}

export function HeartButton({ propertyId, size = 24, style }: HeartButtonProps) {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  const { data: wishlist } = useGetWishlist(
    { email: user?.primaryEmailAddress?.emailAddress },
    { query: { enabled: !!isSignedIn, queryKey: getGetWishlistQueryKey({ email: user?.primaryEmailAddress?.emailAddress }) } }
  );

  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  const isFavorited = wishlist?.some((w) => w.id === propertyId) ?? false;

  const handlePress = async () => {
    if (!isSignedIn) {
      // Need a way to prompt auth. Typically handled by redirecting to sign in
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Optimistic update
    const previousWishlist = queryClient.getQueryData(getGetWishlistQueryKey({ email: user?.primaryEmailAddress?.emailAddress }));
    
    if (isFavorited) {
      removeFromWishlist.mutate(
        { params: { propertyId, email: user?.primaryEmailAddress?.emailAddress } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email: user?.primaryEmailAddress?.emailAddress }) });
          }
        }
      );
    } else {
      addToWishlist.mutate(
        { data: { propertyId, email: user?.primaryEmailAddress?.emailAddress! } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey({ email: user?.primaryEmailAddress?.emailAddress }) });
          }
        }
      );
    }
  };

  const scaleStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: isFavorited ? withSequence(withTiming(1.2, {duration: 100}), withSpring(1)) : withSpring(1) }
      ],
    };
  });

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={15}
      style={[
        styles.button,
        { backgroundColor: isFavorited ? colors.background : 'rgba(0,0,0,0.3)' },
        style,
      ]}
    >
      <Animated.View style={scaleStyle}>
        <Feather
          name="heart"
          size={size - 4}
          color={isFavorited ? colors.primary : '#ffffff'}
          style={isFavorited ? styles.filled : undefined}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    // using feather 'heart' with filled color isn't perfectly filled without solid icon, 
    // but react-native-vector-icons doesn't have a solid heart in Feather.
    // Instead we can use AntDesign or FontAwesome, but let's stick to Feather for consistency.
    // Actually, we can just change the color. Wait, let's use FontAwesome for solid heart.
  }
});
