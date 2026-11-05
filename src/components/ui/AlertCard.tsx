import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

export type AlertCardVariant = 'error' | 'confirm' | 'info';

export interface AlertCardAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  variant?: 'primary' | 'secondary';
}

interface AlertCardProps {
  variant: AlertCardVariant;
  /** 생략하면 본문(message)만 보여준다 — 짧은 확인 모달용. */
  title?: string;
  message?: string;
  primary: AlertCardAction;
  secondary?: AlertCardAction;
  /** Override slot for custom content between message and actions (e.g. avatars). */
  children?: ReactNode;
  style?: ViewStyle;
  /** 본문에서 분홍색으로 강조할 부분. */
  messageHighlight?: string;
  /** Stack actions vertically (primary on top, secondary below) instead of side-by-side. */
  stackedActions?: boolean;
}

// The variant's only remaining job is to color the primary CTA — error reads
// as red, confirm as rose, info as lavender. Everything else (plate, glyph,
// border) was stripped to keep the surface neutral and pixel-flat.
const VARIANT_ACCENTS: Record<AlertCardVariant, string> = {
  error: colors.error,
  confirm: colors.primary,
  info: colors.primary,
};

// text 안의 highlight 첫 위치만 분홍색으로 감싼다. 없으면 text 그대로.
export function highlightText(text: string, highlight?: string) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <Text style={styles.highlight}>{highlight}</Text>
      {text.slice(at + highlight.length)}
    </>
  );
}

export function AlertCard({
  variant,
  title,
  message,
  messageHighlight,
  primary,
  secondary,
  children,
  style,
  stackedActions = false,
}: AlertCardProps) {
  const accent = VARIANT_ACCENTS[variant];
  const a11yRole = variant === 'error' ? 'alert' : 'none';

  return (
    <View accessibilityRole={a11yRole} style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? (
        <Text style={[styles.message, !title && styles.messageOnly]}>
          {highlightText(message, messageHighlight)}
        </Text>
      ) : null}

      {children}

      <View style={[styles.actions, stackedActions && styles.actionsStacked]}>
        {secondary ? (
          <Pressable
            onPress={secondary.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            style={({ pressed }) => [
              styles.btn,
              stackedActions && styles.btnStacked,
              styles.btnSecondary,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={[styles.btnText, styles.btnSecondaryText]}>{secondary.label}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={primary.onPress}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          style={({ pressed }) => [
            styles.btn,
            stackedActions && styles.btnStacked,
            styles.btnPrimary,
            { backgroundColor: primary.destructive ? colors.error : accent },
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={[styles.btnText, styles.btnPrimaryText]}>{primary.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 340,
    ...shadows.card,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 22,
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  // 제목 없는 모달: 본문이 맨 위라 간격 제거 + 본문 색을 제목처럼 진하게.
  messageOnly: {
    marginTop: 4,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  highlight: {
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  actionsStacked: {
    // column-reverse so JSX order (secondary, then primary) renders with the
    // primary on top — convention for stacked confirm dialogs.
    flexDirection: 'column-reverse',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  btnPrimary: {
    borderWidth: 2,
    borderColor: 'transparent',
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.borderSoft,
  },
  btnText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  btnPrimaryText: {
    color: colors.white,
  },
  btnSecondaryText: {
    color: colors.text,
  },
});
