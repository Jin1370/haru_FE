import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, gradients, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { UNLOCK_ALL_PHOTOS_AT } from '@/utils/chat';

interface IntimacyGaugeProps {
  roundTrips: number;
}

export function IntimacyGauge({ roundTrips }: IntimacyGaugeProps) {
  const { t } = useTranslation();
  const clamped = Math.min(roundTrips, UNLOCK_ALL_PHOTOS_AT);
  const progress = clamped / UNLOCK_ALL_PHOTOS_AT;

  // photo-watercolor-pipeline sprint 후 UNLOCK_MAIN === UNLOCK_ALL — 5회 중간
  // milestone 사라짐. 10회 도달 시 원본 5장 동시 공개. 단일 카피로 단순화.
  const hint =
    roundTrips >= UNLOCK_ALL_PHOTOS_AT
      ? t('chat.intimacyAllUnlocked')
      : t('chat.intimacyUntilAll', { count: UNLOCK_ALL_PHOTOS_AT - roundTrips });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons name="heart" size={13} color={colors.primary} />
          <Text style={styles.label}>
            {t('chat.intimacy')} {clamped}/{UNLOCK_ALL_PHOTOS_AT}
          </Text>
        </View>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fillWrap, { width: `${progress * 100}%` }]}>
          <LinearGradient
            colors={[...gradients.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fill}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Guarantee spacing so the label ("Intimacy 2/10") and hint never touch
    // when a long locale string (e.g. English) fills the row and collapses the
    // space-between gap to zero.
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    flexShrink: 1,
    textAlign: 'right',
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
    position: 'relative',
  },
  fillWrap: {
    height: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
