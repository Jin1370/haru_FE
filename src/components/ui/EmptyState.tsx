import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from './Button';
import { colors, gradients, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  ctaLabel?: string;
  onCtaPress?: () => void;
  style?: ViewStyle;
  /** CTA 아래에 붙는 보조 액션 (예: "넘긴 사람 다시 보기"). */
  children?: React.ReactNode;
}

export function EmptyState({
  title,
  subtitle,
  iconName,
  ctaLabel,
  onCtaPress,
  style,
  children,
}: EmptyStateProps) {
  const showCta = Boolean(ctaLabel && onCtaPress);
  return (
    <View style={[styles.container, style]}>
      {iconName ? (
        <LinearGradient
          colors={[...gradients.glow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.iconHalo, shadows.glow]}
        >
          <Ionicons name={iconName} size={40} color={colors.white} />
        </LinearGradient>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {showCta ? (
        <Button
          title={ctaLabel!}
          onPress={onCtaPress!}
          style={styles.cta}
          textStyle={styles.ctaText}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  iconHalo: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 0.2,
    // Rescues contrast when the state sits directly on the photo background
    // without a card — the shadow is invisible on cream surfaces.
    textShadowColor: 'rgba(255,244,238,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 21,
    textShadowColor: 'rgba(255,244,238,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cta: {
    marginTop: 28,
  },
  ctaText: {
    paddingHorizontal: 12,
  },
});
