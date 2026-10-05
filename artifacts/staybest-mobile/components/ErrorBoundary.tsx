import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const colors = useColors();

  return (
    <StartupErrorBoundary><React.Suspense
      fallback={
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      }
    >
      {children}
    </React.Suspense></StartupErrorBoundary>
  );
}

// Suspense only handles loading; it does not catch startup/render exceptions.
export class StartupErrorBoundary extends React.Component<
  { children: React.ReactNode }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <View style={[styles.centered, { padding: 24, backgroundColor: '#fff' }]}>
          <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>StayBest couldn’t start</Text>
          <Text style={{ textAlign: 'center', marginBottom: 24 }}>Please try again. If this continues, install the latest app update or contact StayBest support.</Text>
          <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
