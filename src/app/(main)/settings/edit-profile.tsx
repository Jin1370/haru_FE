import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { LanguageProficiencyEditor } from '@/components/ui/LanguageProficiencyEditor';
import { useProfile } from '@/hooks/useProfile';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SUPPORTED_NATIONALITIES, type NationalityCode } from '@/constants/nationalities';
import { INTEREST_OPTIONS, INTEREST_SECTIONS, MAX_INTERESTS } from '@/constants/interests';
import { validateDisplayName } from '@/utils/validators';
import type { LanguageProficiency } from '@/types';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

const formatBirthDate = (input: string): string => {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, loading, upsertProfile } = useProfile();

  const [form, setForm] = useState<{
    display_name: string;
    birth_date: string;
    gender: 'male' | 'female' | 'other';
    nationality: string;
    languages: LanguageProficiency[];
  }>({
    display_name: profile?.display_name ?? '',
    birth_date: profile?.birth_date ?? '',
    gender: profile?.gender ?? 'male',
    nationality: profile?.nationality ?? '',
    languages:
      profile?.languages && profile.languages.length > 0
        ? profile.languages
        : profile?.language
          ? [{ code: profile.language, level: 3 }]
          : [],
  });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      // Pre-006 rows may not have `languages` populated. Fall back to a
      // synthesized Lv.3 entry built from the legacy primary language.
      const initialLanguages: LanguageProficiency[] =
        profile.languages && profile.languages.length > 0
          ? profile.languages
          : profile.language
            ? [{ code: profile.language, level: 3 }]
            : [];
      setForm({
        display_name: profile.display_name,
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        languages: initialLanguages,
      });
      setInterests(profile.interests);
    }
  }, [profile]);

  const labelToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of INTEREST_OPTIONS) map.set(t(opt.labelKey), opt.id);
    return map;
  }, [t]);

  const selectedInterestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const label of interests) {
      const id = labelToId.get(label);
      if (id) ids.add(id);
    }
    return ids;
  }, [interests, labelToId]);

  const toggleInterest = (id: string, label: string) => {
    if (selectedInterestIds.has(id)) {
      setInterests((prev) => prev.filter((v) => v !== label));
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    setInterests((prev) => [...prev, label]);
  };

  const handleSave = async () => {
    // Inline-error UX: display_name violations now render under the field
    // instead of an Alert. Birth date / nationality / language failures keep
    // the existing Alert path per scope (only display_name was in scope).
    const nameErr = validateDisplayName(form.display_name);
    if (nameErr) {
      setDisplayNameError(t(nameErr.key, nameErr.vars));
      return;
    }
    setDisplayNameError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birth_date)) {
      Alert.alert(t('common.error'), t('signupWizard.birthDateRequired'));
      return;
    }
    if (!form.nationality) {
      Alert.alert(t('common.error'), t('setupProfile.selectNationalityRequired'));
      return;
    }
    if (form.languages.length === 0) {
      Alert.alert(t('common.error'), t('setupProfile.addAtLeastOneLanguage'));
      return;
    }
    try {
      const { languages, ...rest } = form;
      await upsertProfile({
        ...rest,
        languages,
        voice_intro: profile?.voice_intro ?? null,
        interests,
      });
      router.back();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
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
        title={t('profile.editProfile')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>{t('setupProfile.displayName')}</Text>
        <FormField
          value={form.display_name}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, display_name: v }));
            // Clear the field-level error as soon as the user starts typing
            // so the message doesn't linger past the correction.
            if (displayNameError) setDisplayNameError(null);
          }}
          placeholder={t('setupProfile.displayNamePlaceholder')}
          maxLength={50}
          error={displayNameError}
          inputStyle={styles.inputCompact}
          errorTestID="edit-profile-display-name-error"
        />
        <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.birthDate')}</Text>
        <Input
          value={form.birth_date}
          onChangeText={(v) => setForm((f) => ({ ...f, birth_date: formatBirthDate(v) }))}
          placeholder={t('setupProfile.birthDatePlaceholder')}
          keyboardType="number-pad"
          maxLength={10}
          style={styles.inputCompact}
        />

        <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.gender')}</Text>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map((g) => (
            <Pressable
              key={g}
              style={[styles.genderBtn, form.gender === g && styles.genderActive]}
              onPress={() => setForm((f) => ({ ...f, gender: g }))}
            >
              <Text style={[styles.genderText, form.gender === g && styles.genderActiveText]}>
                {genderLabel(g)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.nationality')}</Text>
        <Pressable
          style={[styles.selectBtn, nationalityOpen && styles.selectBtnOpen]}
          onPress={() => setNationalityOpen((v) => !v)}
        >
          <Text style={[styles.selectText, !form.nationality && styles.selectPlaceholder]}>
            {form.nationality
              ? t(`nationalities.${form.nationality}`)
              : t('setupProfile.nationalityPlaceholder')}
          </Text>
          <Ionicons
            name={nationalityOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        {nationalityOpen && (
          <View style={[styles.chipRow, styles.dropdownPanel]}>
            {SUPPORTED_NATIONALITIES.map(({ code, labelKey }) => {
              const selected = form.nationality === code;
              return (
                <Pressable
                  key={code}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => {
                    setForm((f) => ({ ...f, nationality: code as NationalityCode }));
                    setNationalityOpen(false);
                  }}
                >
                  <Text style={[styles.chipText, selected && styles.chipActiveText]}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.languages')}</Text>
        <LanguageProficiencyEditor
          value={form.languages}
          onChange={(next) => setForm((f) => ({ ...f, languages: next }))}
          showPrimary
        />

        <Text style={[styles.label, styles.sectionGap]}>
          {t('setupProfile.interests', { count: interests.length })}
        </Text>
        <Text style={styles.hintBlock}>{t('setupProfile.interestsHint')}</Text>
        {INTEREST_SECTIONS.map((section) => (
          <View key={section.id} style={styles.interestSection}>
            <Text style={styles.interestSectionTitle}>{t(section.titleKey)}</Text>
            <View style={styles.chipRow}>
              {section.items.map(({ id, labelKey }) => {
                const label = t(labelKey);
                const selected = selectedInterestIds.has(id);
                const disabled = !selected && interests.length >= MAX_INTERESTS;
                return (
                  <Pressable
                    key={id}
                    disabled={disabled}
                    style={[
                      styles.chip,
                      selected && styles.chipActive,
                      disabled && styles.chipDisabled,
                    ]}
                    onPress={() => toggleInterest(id, label)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipActiveText,
                        disabled && styles.chipDisabledText,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={t('common.save')} onPress={handleSave} loading={loading} />
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
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  selectBtnOpen: { borderColor: colors.primary, backgroundColor: colors.white },
  inputCompact: { fontSize: 14 },
  selectText: { fontSize: 14, color: colors.text, fontFamily: fonts.medium },
  selectPlaceholder: { color: colors.textLight },
  dropdownPanel: {
    padding: 12,
    marginTop: -4,
    marginBottom: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
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
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.medium },
  chipActiveText: { color: colors.white },
  chipDisabledText: { color: colors.textLight },
  hintBlock: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
  interestSection: {
    marginBottom: 8,
  },
  interestSectionTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
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
