import { Pressable, Text, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle } from 'react-native';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
  /**
   * Optional override for the screen-reader label. Defaults to `title`;
   * provide it when the visible text is an icon or a symbol.
   */
  accessibilityLabel?: string;
}

export function isButtonDisabled(disabled?: boolean, loading?: boolean): boolean {
  return Boolean(disabled) || Boolean(loading);
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = isButtonDisabled(disabled, loading);
  const isPrimary = variant === 'primary';

  const content = loading ? (
    <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.white} />
  ) : (
    <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles], textStyle]}>
      {title}
    </Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.shell,
        isPrimary && shadows.soft,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={[styles.base, styles[variant]]}>{content}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  base: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primaryMid,
  },
  secondary: {
    backgroundColor: colors.secondary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: {
    backgroundColor: colors.error,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  primaryText: {},
  secondaryText: {
    color: colors.text,
  },
  outlineText: {
    color: colors.primary,
  },
  dangerText: {},
});
