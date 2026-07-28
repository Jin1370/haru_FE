import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { AgeRangeSlider } from '@/components/ui/AgeRangeSlider';
import { usePreferences } from '@/hooks/usePreferences';
import { useAuthStore } from '@/stores/authStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { selectableNationalities } from '@/constants/nationalities';
import { MIN_AGE, MAX_AGE } from '@/utils/preferences';
import { userFacingError } from '@/utils/errors';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences, loading, loadPreferences, updatePreferences } = usePreferences();
  const bumpDiscoverReload = useDiscoverStore((s) => s.bumpReload);
  const [ageRange, setAgeRange] = useState<{ min: number; max: number }>({
    min: MIN_AGE,
    max: MAX_AGE,
  });
  const [genders, setGenders] = useState<('male' | 'female' | 'other')[]>([...GENDER_OPTIONS]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  // 본인 국적은 선택지에서 제외 (외국인끼리 매칭 정책 — selectableNationalities 주석 참고).
  const ownNationality = useAuthStore((s) => s.profile?.nationality);
  const nationalityOptions = selectableNationalities(ownNationality);
  const selectableCodes = new Set<string>(nationalityOptions.map((n) => n.code));

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if (preferences) {
      // Clamp incoming BE values into the FE-displayed band. The BE still
      // accepts up to 100 for backward compatibility, but the slider caps
      // at MAX_AGE so existing prefs above that fold into the ceiling
      // rather than overflowing the track.
      setAgeRange({
        min: Math.max(MIN_AGE, Math.min(preferences.min_age, MAX_AGE)),
        max: Math.max(MIN_AGE, Math.min(preferences.max_age, MAX_AGE)),
      });
      setGenders(preferences.preferred_genders);
      setNationalities(preferences.preferred_nationalities ?? []);
    }
  }, [preferences]);

  const toggleGender = (g: 'male' | 'female' | 'other') => {
    setGenders((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  };

  const toggleNationality = (code: string) => {
    setNationalities((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    );
  };

  const handleSave = async () => {
    try {
      await updatePreferences({
        min_age: ageRange.min,
        max_age: ageRange.max,
        preferred_genders: genders,
        // 지금 고를 수 있는 국가만 저장한다. 정책 도입 전에 저장된 같은 언어권
        // 국가(예: 미국 사용자의 '영국')는 화면에 안 보이는데 값만 남아 유령이
        // 되므로 저장 시점에 정리 — BE 는 어차피 무시하지만 상태를 정직하게 유지.
        preferred_nationalities: nationalities.filter((c) => selectableCodes.has(c)),
      });
      // Tell the discover screen to drop its cached candidates and re-fetch
      // with the freshly-saved filters next time the user is on the tab.
      // Manual pull-to-refresh on discover still works as a fallback.
      bumpDiscoverReload();
      router.back();
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
    }
  };

  const genderLabel = (g: typeof GENDER_OPTIONS[number]) => {
    if (g === 'male') return t('setupProfile.genderMale');
    if (g === 'female') return t('setupProfile.genderFemale');
    return t('setupProfile.genderOther');
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('profile.matchingPreferences')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.label}>{t('preferences.ageRange')}</Text>
      <AgeRangeSlider
        min={MIN_AGE}
        max={MAX_AGE}
        value={ageRange}
        onChange={setAgeRange}
        suffix={t('preferences.ageSuffix', { defaultValue: '' })}
      />

      <Text style={[styles.label, styles.sectionGap]}>{t('preferences.preferredGenders')}</Text>
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((g) => (
          <Pressable
            key={g}
            style={[styles.genderBtn, genders.includes(g) && styles.genderActive]}
            onPress={() => toggleGender(g)}
          >
            <Text style={[styles.genderText, genders.includes(g) && styles.genderActiveText]}>
              {genderLabel(g)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, styles.sectionGap]}>
        {t('preferences.preferredNationalities')}
      </Text>
      <Text style={styles.hintBlock}>{t('preferences.leaveEmptyAllNationalities')}</Text>
      <View style={styles.chipRow}>
        {nationalityOptions.map(({ code, labelKey }) => {
          const selected = nationalities.includes(code);
          return (
            <Pressable
              key={code}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => toggleNationality(code)}
            >
              <Text style={[styles.chipText, selected && styles.chipActiveText]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={t('common.save')} onPress={handleSave} loading={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    marginBottom: 8,
  },
  sectionGap: { marginTop: 16 },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  genderActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  genderText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    textTransform: 'capitalize',
  },
  genderActiveText: {
    color: colors.white,
  },
  hintBlock: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.medium },
  chipActiveText: { color: colors.white },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
