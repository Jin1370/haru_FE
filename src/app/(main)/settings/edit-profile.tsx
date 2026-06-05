import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useProfile } from '@/hooks/useProfile';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SUPPORTED_NATIONALITIES, type NationalityCode } from '@/constants/nationalities';
import { MAX_INTERESTS } from '@/constants/interests';
import { InterestSelector } from '@/components/profile/InterestSelector';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { isLanguageCode, type LanguageCode } from '@/constants/languages';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';
import { isValidAdultBirthDate } from '@/utils/age';

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
  // Lift the absolute footer above the keyboard and extend ScrollView
  // paddingBottom by kbHeight (root KeyboardProvider feeds a unified value
  // for both platforms — keeps the layout math identical everywhere).
  const kbHeight = useKeyboardState((s) => s.height);

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

  // The Save button is disabled until `canSave` (below), so handleSave runs
  // only on a valid form — no inline errors. The `!form.language` guard is
  // defensive and narrows the type from `LanguageCode | null` for TS.
  const handleSave = async () => {
    if (!form.language) return;
    try {
      await upsertProfile({
        display_name: form.display_name.trim(),
        birth_date: form.birth_date,
        gender: form.gender,
        nationality: form.nationality,
        language: form.language,
        voice_intro: profile?.voice_intro ?? null,
        interests,
      });
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

  // Save stays disabled until every required field is valid: name (valid after
  // trimming), a real calendar birth date for an 18+ user, and a selected
  // nationality + language. Replaces the old tap-time inline errors.
  const canSave =
    validateDisplayName(form.display_name.trim()) === null &&
    isValidAdultBirthDate(form.birth_date) &&
    !!form.nationality &&
    !!form.language;

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('profile.editProfile')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 + kbHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <RequiredLabel text={t('setupProfile.displayName')} />
          <FormField
            value={form.display_name}
            onChangeText={(v) => setForm((f) => ({ ...f, display_name: v }))}
            placeholder={t('setupProfile.displayNamePlaceholder')}
            maxLength={DISPLAY_NAME_MAX}
            inputStyle={styles.inputCompact}
          />
        </View>
        <View>
          <RequiredLabel text={t('setupProfile.birthDate')} gap />
          <FormField
            value={form.birth_date}
            onChangeText={(v) =>
              setForm((f) => ({ ...f, birth_date: formatBirthDate(v) }))
            }
            placeholder={t('setupProfile.birthDatePlaceholder')}
            keyboardType="number-pad"
            maxLength={10}
            inputStyle={styles.inputCompact}
          />
        </View>

        <RequiredLabel text={t('setupProfile.gender')} gap />
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

        <View>
          <RequiredLabel text={t('setupProfile.nationality')} gap />
          <Pressable
            style={[
              styles.selectBtn,
              nationalityOpen && styles.selectBtnOpen,
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
        </View>

        <View>
          <RequiredLabel text={t('setupProfile.language')} gap />
          <LanguagePicker
            mode="single"
            value={form.language}
            onChange={(next) => setForm((f) => ({ ...f, language: next }))}
          />
        </View>

        <Text style={[styles.label, styles.sectionGap]}>
          {t('setupProfile.interests', { count: interests.length })}
        </Text>
        <Text style={styles.hintBlock}>{t('setupProfile.interestsHint')}</Text>
        <InterestSelector
          selectedIds={selectedInterestIds}
          totalSelected={interests.length}
          onToggle={toggleInterest}
        />
      </ScrollView>

      {/* Footer is intentionally pinned at bottom: 0 (no kbHeight lift) so the
          Save button stays put when the keyboard opens — the user only needs
          the focused FormField visible above the keyboard, not the Save CTA.
          ScrollView paddingBottom still adds kbHeight so the input can be
          scrolled above the keyboard line. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={t('common.save')} onPress={handleSave} loading={loading} disabled={!canSave || loading} />
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
  },
  selectBtnOpen: { borderColor: colors.primary, backgroundColor: colors.white },
  inputCompact: { fontSize: 14 },
  selectText: { fontSize: 14, color: colors.text, fontFamily: fonts.medium },
  selectPlaceholder: { color: colors.textLight },
  dropdownPanel: {
    padding: 12,
    marginTop: 4,
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
