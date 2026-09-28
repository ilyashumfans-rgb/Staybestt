import React from 'react';
import { StyleSheet, View, Image, Text, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const colors = useColors();

  return (
    <React.Suspense
      fallback={
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      }
    >
      {children}
    </React.Suspense>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
