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
import { useProfile } from '@/hooks/useProfile';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { isLanguageCode, SUPPORTED_LANGUAGES, type LanguageCode } from '@/constants/languages';
import { SUPPORTED_NATIONALITIES } from '@/constants/nationalities';
import { MIN_AGE, MAX_AGE } from '@/utils/preferences';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences, loading, loadPreferences, updatePreferences } = usePreferences();
  const { profile } = useProfile();
  const bumpDiscoverReload = useDiscoverStore((s) => s.bumpReload);
  // BE blocks same-primary-language matches (the app's core differentiator —
  // voice translation only kicks in across language pairs). Hide the user's
  // own primary from the picker so they can't add a language that has no
  // effect on filtering.
  const ownPrimaryLanguage = profile?.language ?? null;
  const [ageRange, setAgeRange] = useState<{ min: number; max: number }>({
    min: MIN_AGE,
    max: MAX_AGE,
  });
  const [genders, setGenders] = useState<('male' | 'female' | 'other')[]>([...GENDER_OPTIONS]);
  const [languages, setLanguages] = useState<LanguageCode[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);

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
      setLanguages(
        (preferences.preferred_languages ?? []).filter(
          (c): c is LanguageCode => isLanguageCode(c) && c !== ownPrimaryLanguage,
        ),
      );
      setNationalities(preferences.preferred_nationalities ?? []);
    }
  }, [preferences, ownPrimaryLanguage]);

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

  const toggleLanguage = (code: LanguageCode) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    );
  };

  const handleSave = async () => {
    try {
      await updatePreferences({
        min_age: ageRange.min,
        max_age: ageRange.max,
        preferred_genders: genders,
        preferred_languages: languages,
        preferred_nationalities: nationalities,
      });
      // Tell the discover screen to drop its cached candidates and re-fetch
      // with the freshly-saved filters next time the user is on the tab.
      // Manual pull-to-refresh on discover still works as a fallback.
      bumpDiscoverReload();
      router.back();
    } catch (e: any) {
      showAlert({ variant: 'error', title: t('common.error'), message: e.message });
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

      <Text style={[styles.label, styles.sectionGap]}>{t('preferences.preferredLanguages')}</Text>
      <View style={styles.hintList}>
        <Text style={styles.hintLine}>{`• ${t('preferences.leaveEmptyAllLanguages')}`}</Text>
        <Text style={styles.hintLine}>{`• ${t('preferences.sameLanguageBlockedHint')}`}</Text>
      </View>
      <View style={styles.chipRow}>
        {SUPPORTED_LANGUAGES.filter((l) => l.code !== ownPrimaryLanguage).map(
          ({ code, labelKey }) => {
            const selected = languages.includes(code as LanguageCode);
            return (
              <Pressable
                key={code}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => toggleLanguage(code as LanguageCode)}
              >
                <Text style={[styles.chipText, selected && styles.chipActiveText]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          },
        )}
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
  hintList: {
    marginTop: -4,
    marginBottom: 10,
    gap: 6,
  },
  hintLine: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
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
