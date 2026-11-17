import { Pressable, Text, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle } from 'react-native';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

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

  // 로딩 중에도 글자를 투명하게 남겨 버튼 크기를 그대로 두고, 스피너는 그 위에 겹친다.
  // (글자를 스피너로 바꾸면 스피너가 글자 줄보다 낮아 버튼이 살짝 줄어들었다.)
  const content = (
    <>
      <Text
        style={[
          styles.text,
          styles[`${variant}Text` as keyof typeof styles],
          textStyle,
          loading && styles.hidden,
        ]}
      >
        {title}
      </Text>
      {loading ? (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color={variant === 'outline' ? colors.primary : colors.white}
        />
      ) : null}
    </>
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
    fontSize: fs(14),
    fontFamily: fonts.semibold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  hidden: { opacity: 0 },
  primaryText: {},
  secondaryText: {
    color: colors.text,
  },
  outlineText: {
    color: colors.primary,
  },
  dangerText: {},
});
