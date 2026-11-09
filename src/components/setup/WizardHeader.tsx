import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fonts, fs, HEADER_FONT_WEIGHT } from '@/constants/fonts';

interface WizardHeaderProps {
  step?: 1 | 2 | 3 | 4 | 5;
  total?: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  // Single-step screens (settings → edit-bio / edit-profile / edit-interests)
  // don't benefit from a step indicator, so `compact` collapses the header to
  // a standard nav bar: [back][centered title][─]. The large 26pt title is
  // dropped (the centered nav title carries identity) while the subtitle is
  // retained as the page lead below the header.
  compact?: boolean;
}

export function WizardHeader({ step, total = 5, title, subtitle, onBack, compact = false }: WizardHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.topRow, compact && styles.topRowCompact]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        {compact ? (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Text style={styles.progress}>
            {t('signupWizard.progress', { current: step ?? 1, total })}
          </Text>
        )}
        <View style={styles.backBtn} />
      </View>

      {compact ? null : <Text style={styles.title}>{title}</Text>}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  wrapCompact: {
    paddingBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topRowCompact: {
    marginBottom: 0,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: fs(17),
    fontFamily: fonts.bold,
    fontWeight: HEADER_FONT_WEIGHT,
    color: colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    fontSize: fs(13),
    fontFamily: fonts.semibold,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: fs(26),
    fontFamily: fonts.bold,
    fontWeight: HEADER_FONT_WEIGHT,
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fs(14),
    color: colors.textSecondary,
    lineHeight: fs(20),
    fontFamily: fonts.regular,
  },
});
