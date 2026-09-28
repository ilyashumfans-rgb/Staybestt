import { StyleSheet, View, ViewProps } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface ThemedViewProps extends ViewProps {
  variant?: 'background' | 'card' | 'secondary' | 'transparent';
}

export function ThemedView({ style, variant = 'background', ...rest }: ThemedViewProps) {
  const colors = useColors();

  let backgroundColor = colors.background;
  if (variant === 'card') backgroundColor = colors.card;
  if (variant === 'secondary') backgroundColor = colors.secondary;
  if (variant === 'transparent') backgroundColor = 'transparent';

  return <View style={StyleSheet.flatten([{ backgroundColor }, style])} {...rest} />;
}
