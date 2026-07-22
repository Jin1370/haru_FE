import { useState } from 'react';
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
import { showAlert } from '@/stores/alertStore';
import { usePreferences } from '@/hooks/usePreferences';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SUPPORTED_NATIONALITIES } from '@/constants/nationalities';
import { MIN_AGE, MAX_AGE } from '@/utils/preferences';
import { userFacingError } from '@/utils/errors';
import type { PreferenceUpdateRequest } from '@/types';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

export default function SetupStep4() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { updatePreferences, loading: prefSaving } = usePreferences();

  const [ageRange, setAgeRange] = useState<{ min: number; max: number }>({
    min: MIN_AGE,
    max: MAX_AGE,
  });
  const [genders, setGenders] = useState<('male' | 'female' | 'other')[]>([
    ...GENDER_OPTIONS,
  ]);
  const [nationalities, setNationalities] = useState<string[]>([]);

  const toggleGender = (g: 'male' | 'female' | 'other') => {
    setGenders((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const toggleNationality = (code: string) => {
    setNationalities((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    );
  };

  const genderLabel = (g: typeof GENDER_OPTIONS[number]) => {
    if (g === 'male') return t('setupProfile.genderMale');
    if (g === 'female') return t('setupProfile.genderFemale');
    return t('setupProfile.genderOther');
  };

  const handleNext = async () => {
    if (prefSaving) return;
    const prefs: PreferenceUpdateRequest = {
      min_age: ageRange.min,
      max_age: ageRange.max,
      preferred_genders: genders,
      preferred_nationalities: nationalities,
    };
    // Wizard position 3: profile row already exists (INSERTed at position 2),
    // so write preferences straight to BE. Reloading at any point past this
    // returns the user to discover (per the simplified routing gate) without
    // losing what they configured.
    try {
      await updatePreferences(prefs);
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
      return;
    }
    router.push('/(main)/setup/step2');
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        step={3}
        title={t('signupWizard.step4Title')}
        subtitle={t('signupWizard.step4Subtitle')}
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
          {SUPPORTED_NATIONALITIES.map(({ code, labelKey }) => {
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
        <Button
          title={t('common.next')}
          onPress={handleNext}
          loading={prefSaving}
          disabled={prefSaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text, marginBottom: 8 },
  sectionGap: { marginTop: 16 },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  genderBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  genderActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  genderText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    textTransform: 'capitalize',
  },
  genderActiveText: { color: colors.white },
  hintBlock: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
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
