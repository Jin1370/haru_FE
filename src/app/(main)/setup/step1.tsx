import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  BackHandler,
  type LayoutChangeEvent,
} from 'react-native';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { ErrorText } from '@/components/ui/ErrorText';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useAuthStore } from '@/stores/authStore';
import { useSignupDraftStore, type Gender } from '@/stores/signupDraftStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { SUPPORTED_NATIONALITIES, type NationalityCode } from '@/constants/nationalities';
import { INTEREST_SECTIONS, MAX_INTERESTS } from '@/constants/interests';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';
import type { LanguageCode } from '@/constants/languages';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

const formatBirthDate = (input: string): string => {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

export default function SetupStep1() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const draft = useSignupDraftStore();
  // Lift the absolute footer above the keyboard and extend ScrollView
  // paddingBottom by kbHeight so the focused FormField scrolls into view
  // on iOS (Android's adjustResize already shrinks the viewport, but the
  // KeyboardProvider feeds the same kbHeight on both platforms — using it
  // uniformly keeps the layout math identical everywhere).
  const kbHeight = useKeyboardState((s) => s.height);

  // Wizard entry: swipe-back / hardware-back = logout. Focus-gated so the
  // listeners only fire while step1 is the visible screen — otherwise step1
  // remains mounted in the stack after pushing step2~5 and would intercept
  // back presses from later screens (including the post-wizard tabs).
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        useAuthStore.getState().logout();
        return true;
      };
      const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
        e.preventDefault();
        useAuthStore.getState().logout();
      });
      const backHandler = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => {
        unsubscribe();
        backHandler.remove();
      };
    }, [navigation]),
  );

  const [form, setForm] = useState({
    display_name: draft.display_name,
    birth_date: draft.birth_date,
    gender: draft.gender as Gender,
    nationality: draft.nationality,
    language: draft.language,
  });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>(draft.interests);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [nationalityError, setNationalityError] = useState<string | null>(null);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // Auto-scroll target tracking. Mirrors edit-profile.tsx — handleNext scrolls
  // the first invalid field back into view if it's been pushed offscreen by
  // the long interests grid below.
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
  const SCROLL_PAD = 16;
  const scrollToField = (key: FieldKey) => {
    const y = fieldYRef.current[key];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_PAD), animated: true });
  };

  const setLanguage = (next: LanguageCode | null) => {
    setForm((f) => ({ ...f, language: next }));
    if (languageError && next) setLanguageError(null);
  };

  // Storage moved from "current-locale label" to canonical id so the
  // displayed label survives both language toggles and re-loads from BE.
  // The resolver also recognises legacy stored labels (any supported
  // language) so existing profiles keep their selection state intact.
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
      // Drop both forms: the canonical id and any legacy localized label
      // that points at this id (covers profiles registered before the
      // canonicalization).
      setInterests((prev) =>
        prev.filter((v) => v !== id && resolveId(v) !== id),
      );
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    setInterests((prev) => [...prev, id]);
  };

  const handleNext = () => {
    // Validate everything together so the user sees every mistake at once
    // instead of one-per-tap. Scroll to the first invalid field for the
    // user's convenience (long interests grid below pushes the top fields
    // off the visible viewport on smaller screens).
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
    const step1Payload = {
      display_name: form.display_name.trim(),
      birth_date: form.birth_date,
      gender: form.gender,
      nationality: form.nationality,
      language: form.language,
    };
    draft.setStep1(step1Payload);
    draft.setInterests(interests);
    // No BE write here — wizard order is now basics → photos → prefs → voice
    // clone → voice intro, and the photos step performs the INSERT once both
    // mandatory blocks (basics + ≥1 photo) are filled. Reloading anywhere
    // before that returns the user to step1 because no profile row exists.
    router.push('/(main)/setup/step5');
  };

  const genderLabel = (g: typeof GENDER_OPTIONS[number]) => {
    if (g === 'male') return t('setupProfile.genderMale');
    if (g === 'female') return t('setupProfile.genderFemale');
    return t('setupProfile.genderOther');
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        step={1}
        title={t('signupWizard.step1Title')}
        subtitle={t('signupWizard.step1Subtitle')}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 + kbHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <View onLayout={onFieldLayout('display_name')}>
        <Text style={styles.label}>{t('setupProfile.displayName')}</Text>
        <FormField
          value={form.display_name}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, display_name: v }));
            if (displayNameError) setDisplayNameError(null);
          }}
          placeholder={t('setupProfile.displayNamePlaceholder')}
          maxLength={DISPLAY_NAME_MAX}
          error={displayNameError}
          inputStyle={styles.inputCompact}
          errorTestID="setup-step1-display-name-error"
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
          errorTestID="setup-step1-birth-date-error"
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
            <View style={styles.nationalityNoticeRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.primaryDark}
              />
              <Text style={styles.nationalityNotice}>
                {t('setupProfile.nationalityLimitedNotice')}
              </Text>
            </View>
          </View>
        )}
        <ErrorText testID="setup-step1-nationality-error">{nationalityError}</ErrorText>
      </View>

      <View onLayout={onFieldLayout('language')}>
        <Text style={[styles.label, styles.sectionGap]}>{t('setupProfile.language')}</Text>
        <LanguagePicker
          mode="single"
          value={form.language}
          onChange={setLanguage}
          hasError={!!languageError}
        />
        <ErrorText testID="setup-step1-language-error">{languageError}</ErrorText>
      </View>

      {/* Interests — optional. Markup mirrors settings/edit-profile.tsx so
          a user revisiting this through Settings sees the exact same shape. */}
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

      {/* Footer stays pinned at bottom: 0 — the Next button intentionally sits
          behind the keyboard while typing. The ScrollView paddingBottom above
          already includes kbHeight so the focused FormField can be scrolled
          above the keyboard line. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={t('common.next')} onPress={handleNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    marginBottom: 8,
  },
  sectionGap: { marginTop: 16 },
  hintBlock: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
  },
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
  selectBtnError: { borderColor: colors.error },
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
  nationalityNoticeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  nationalityNotice: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.6,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
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
