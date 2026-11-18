import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BackIcon } from '@/components/ui/BackIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fonts, fs, HEADER_FONT_WEIGHT } from '@/constants/fonts';

interface WizardHeaderProps {
  step?: 1 | 2 | 3 | 4;
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
  // compact 헤더 오른쪽 자리 (예: 별사탕 칩). 있으면 양옆 칸을 같은 너비로 늘려 제목을 가운데에 둔다.
  right?: ReactNode;
}

export function WizardHeader({ step, total = 4, title, subtitle, onBack, compact = false, right }: WizardHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.topRow, compact && styles.topRowCompact]}>
        <View style={right ? styles.sideLeft : undefined}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.backBtn}
            >
              <BackIcon color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>
        {compact ? (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Text style={styles.progress}>
            {t('signupWizard.progress', { current: step ?? 1, total })}
          </Text>
        )}
        {right ? (
          <View style={styles.sideRight}>
            <View style={styles.rightPull}>{right}</View>
          </View>
        ) : (
          <View style={styles.backBtn} />
        )}
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
  sideLeft: { flex: 1, alignItems: 'flex-start' },
  sideRight: { flex: 1, alignItems: 'flex-end' },
  // 별사탕 칩은 탭 헤더용 오른쪽 여백(16)을 자체로 갖고 있어, 이 헤더의 좌우 여백(20)만큼 당겨 탭 헤더와 같은 위치에 둔다.
  // 당기는 여백은 안쪽에 둔다 — sideRight 자체에 주면 양옆 칸 너비가 달라져 제목이 오른쪽으로 10 밀린다.
  rightPull: { marginRight: -20 },
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
