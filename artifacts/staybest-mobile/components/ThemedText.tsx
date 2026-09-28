import { StyleSheet, Text, TextProps } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface ThemedTextProps extends TextProps {
  type?: 'default' | 'title' | 'subtitle' | 'caption' | 'link';
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

export function ThemedText({
  style,
  type = 'default',
  color,
  weight,
  ...rest
}: ThemedTextProps) {
  const colors = useColors();

  const getFontFamily = () => {
    if (weight === 'bold') return 'PlusJakartaSans_700Bold';
    if (weight === 'semibold') return 'PlusJakartaSans_600SemiBold';
    if (weight === 'medium') return 'PlusJakartaSans_500Medium';
    return 'PlusJakartaSans_400Regular';
  };

  return (
    <Text
      style={[
        { color: color || colors.foreground, fontFamily: getFontFamily() },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'caption' ? styles.caption : undefined,
        type === 'link' ? [styles.link, { color: colors.primary }] : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
  },
});
