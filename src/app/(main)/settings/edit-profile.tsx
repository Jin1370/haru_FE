import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  type LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/ui/FormField';
import { ErrorText } from '@/components/ui/ErrorText';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useProfile } from '@/hooks/useProfile';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SUPPORTED_NATIONALITIES, type NationalityCode } from '@/constants/nationalities';
import { INTEREST_SECTIONS, MAX_INTERESTS } from '@/constants/interests';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { isLanguageCode, type LanguageCode } from '@/constants/languages';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';

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
    language: LanguageCode | null;
  }>({
    display_name: profile?.display_name ?? '',
    birth_date: profile?.birth_date ?? '',
    gender: profile?.gender ?? 'male',
    nationality: profile?.nationality ?? '',
    language: profile && isLanguageCode(profile.language)
      ? (profile.language as LanguageCode)
      : null,
  });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [nationalityError, setNationalityError] = useState<string | null>(null);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // Auto-scroll target tracking. ScrollView measures each labeled section's
  // y-offset via onLayout so handleSave can scroll the first invalid field
  // back into view if it's been pushed offscreen by long content above.
  type FieldKey = 'display_name' | 'birth_date' | 'nationality' | 'language';
  const scrollRef = useRef<ScrollView>(null);
  const fieldYRef = useRef<Record<FieldKey, number>>({
    display_name: 0,
    birth_date: 0,
    nationality: 0,
    language: 0,
  });
  const onFieldLayout = (key: FieldKey) => (e: LayoutChangeEvent) => {
    fieldYRef.current[key] = e.nativeEvent.layout.y;
  };
  // 16px breathing room above the field once it's parked at the top of the
  // scroll viewport — keeps the label visible instead of clipping it under
  // the WizardHeader.
  const SCROLL_PAD = 16;
  const scrollToField = (key: FieldKey) => {
    const y = fieldYRef.current[key];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_PAD), animated: true });
  };

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name,
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        language: isLanguageCode(profile.language)
          ? (profile.language as LanguageCode)
          : null,
      });
      setInterests(profile.interests);
    }
  }, [profile]);

  // Storage moved from "current-locale label" to canonical id (see
  // useInterestResolver doc) so the displayed label always reflects the
  // current app language. Legacy stored labels still resolve to ids.
  const { resolveId } = useInterestResolver();

  const selectedInterestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const stored of interests) {
      const id = resolveId(stored);
      if (id) ids.add(id);
    }
    return ids;
  }, [interests, resolveId]);

  const toggleInterest = (id: string) => {
    if (selectedInterestIds.has(id)) {
      setInterests((prev) =>
        prev.filter((v) => v !== id && resolveId(v) !== id),
      );
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    setInterests((prev) => [...prev, id]);
  };

  const handleSave = async () => {
    // Inline-error UX: every required field surfaces its violation under
    // itself. Validate all of them together so a save tap shows every
    // mistake at once instead of doling them out one-per-tap. We scroll to
    // the FIRST invalid field so its message is guaranteed to be in view.
    const nameErr = validateDisplayName(form.display_name);
    const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.birth_date);
    const nationalityMissing = !form.nationality;
    const languageMissing = !form.language;

    setDisplayNameError(nameErr ? t(nameErr.key, nameErr.vars) : null);
    setBirthDateError(dateValid ? null : t('validation.birthDateInvalid'));
    setNationalityError(
      nationalityMissing ? t('setupProfile.selectNationalityRequired') : null,
    );
    setLanguageError(
      languageMissing ? t('setupProfile.selectLanguageRequired') : null,
    );

    if (nameErr) {
      scrollToField('display_name');
      return;
    }
    if (!dateValid) {
      scrollToField('birth_date');
      return;
    }
    if (nationalityMissing) {
      scrollToField('nationality');
      return;
    }
    if (languageMissing || !form.language) {
      scrollToField('language');
      return;
    }
    try {
      await upsertProfile({
        display_name: form.display_name,
        birth_date: form.birth_date,
        gender: form.gender,
        nationality: form.nationality,
        language: form.language,
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
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={onFieldLayout('display_name')}>
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
            maxLength={DISPLAY_NAME_MAX}
            error={displayNameError}
            inputStyle={styles.inputCompact}
            errorTestID="edit-profile-display-name-error"
          />
        </View>
        <View onLayout={onFieldLayout('birth_date')}>
          <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.birthDate')}</Text>
          <FormField
            value={form.birth_date}
            onChangeText={(v) => {
              setForm((f) => ({ ...f, birth_date: formatBirthDate(v) }));
              if (birthDateError) setBirthDateError(null);
            }}
            placeholder={t('setupProfile.birthDatePlaceholder')}
            keyboardType="number-pad"
            maxLength={10}
            error={birthDateError}
            inputStyle={styles.inputCompact}
            errorTestID="edit-profile-birth-date-error"
          />
        </View>

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

        <View onLayout={onFieldLayout('nationality')}>
          <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.nationality')}</Text>
          <Pressable
            style={[
              styles.selectBtn,
              nationalityOpen && styles.selectBtnOpen,
              nationalityError ? styles.selectBtnError : null,
            ]}
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
                      if (nationalityError) setNationalityError(null);
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
          <ErrorText testID="edit-profile-nationality-error">{nationalityError}</ErrorText>
        </View>

        <View onLayout={onFieldLayout('language')}>
          <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.language')}</Text>
          <LanguagePicker
            mode="single"
            value={form.language}
            onChange={(next) => {
              setForm((f) => ({ ...f, language: next }));
              if (languageError && next) setLanguageError(null);
            }}
            hasError={!!languageError}
          />
          <ErrorText testID="edit-profile-language-error">{languageError}</ErrorText>
        </View>

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
                    onPress={() => toggleInterest(id)}
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
  selectBtnError: { borderColor: colors.error },
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
