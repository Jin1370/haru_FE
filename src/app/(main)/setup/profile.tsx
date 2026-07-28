import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  BackHandler,
  Keyboard,
} from 'react-native';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { useAuthStore } from '@/stores/authStore';
import { useSignupDraftStore, type Gender } from '@/stores/signupDraftStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import {
  SUPPORTED_NATIONALITIES,
  languageForNationality,
  type NationalityCode,
} from '@/constants/nationalities';
import { MAX_INTERESTS } from '@/constants/interests';
import { InterestSelector } from '@/components/profile/InterestSelector';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { ErrorText } from '@/components/ui/ErrorText';
import { validateDisplayName, validateBirthDate, DISPLAY_NAME_MAX } from '@/utils/validators';

const GENDER_OPTIONS = ['male', 'female', 'other'] as const;

const formatBirthDate = (input: string): string => {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

export default function SetupProfile() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const draft = useSignupDraftStore();

  // Wizard entry: swipe-back / hardware-back = logout. Focus-gated so the
  // listeners only fire while this screen is visible — otherwise it stays
  // mounted in the stack after pushing the later wizard steps and would
  // intercept back presses from them (including the post-wizard tabs).
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
  });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>(draft.interests);
  const [referralCode, setReferralCode] = useState(draft.referralCode);
  // Inline validation errors, keyed by field. Populated on Next, surfaced as
  // small red text under each field, and cleared per-field as the user edits.
  const [errors, setErrors] = useState<{
    display_name?: string;
    birth_date?: string;
    nationality?: string;
  }>({});

  const clearError = (field: 'display_name' | 'birth_date' | 'nationality') =>
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

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
    Keyboard.dismiss();
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

  // The Next button is always enabled so a tap always produces feedback. On tap
  // we validate every required field at once and render an inline red message
  // under each invalid one, instead of leaving a silently-disabled button (which
  // App Review flagged as "tapped Next, nothing happened" on iPad — Guideline
  // 2.1(a)). Only advances once all fields are valid.
  const handleNext = () => {
    Keyboard.dismiss();
    const next: typeof errors = {};

    const nameErr = validateDisplayName(form.display_name.trim());
    if (nameErr) next.display_name = t(nameErr.key, nameErr.vars);

    const birthErr = validateBirthDate(form.birth_date);
    if (birthErr) next.birth_date = t(birthErr.key, birthErr.vars);

    if (!form.nationality) next.nationality = t('setupProfile.selectNationalityRequired');

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    draft.setStep1({
      display_name: form.display_name.trim(),
      birth_date: form.birth_date,
      gender: form.gender,
      nationality: form.nationality,
      // Language is derived from nationality — no user-facing picker.
      language: languageForNationality(form.nationality),
      // 영숫자 외 제거 + 대문자 정규화는 여기서만 (타이핑 중 value 변환은 조합
      // 버퍼와 desync 돼 중복 입력을 유발하므로 하지 않는다).
      referralCode: referralCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    });
    draft.setInterests(interests);
    // No BE write here — wizard order is now basics → photos → prefs → voice
    // clone → voice intro, and the photos step performs the INSERT once both
    // mandatory blocks (basics + ≥1 photo) are filled. Reloading anywhere
    // before that returns the user to profile because no profile row exists.
    router.push('/(main)/setup/photos');
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
        title={t('signupWizard.profileTitle')}
        subtitle={t('signupWizard.profileSubtitle')}
      />
      {/* KeyboardAwareScrollView auto-scrolls the focused TextInput above the
          keyboard (mirrors edit-bio.tsx) — so the last field (referral code)
          isn't hidden behind the keyboard. bottomOffset = breathing room. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
      <View>
        <RequiredLabel text={t('setupProfile.displayName')} />
        <FormField
          value={form.display_name}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, display_name: v }));
            clearError('display_name');
          }}
          placeholder={t('setupProfile.displayNamePlaceholder')}
          maxLength={DISPLAY_NAME_MAX}
          inputStyle={styles.inputCompact}
          error={errors.display_name}
        />
      </View>

      <View>
        <RequiredLabel text={t('setupProfile.birthDate')} gap />
        <FormField
          value={form.birth_date}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, birth_date: formatBirthDate(v) }));
            clearError('birth_date');
          }}
          placeholder={t('setupProfile.birthDatePlaceholder')}
          keyboardType="number-pad"
          maxLength={10}
          inputStyle={styles.inputCompact}
          error={errors.birth_date}
        />
      </View>

      <RequiredLabel text={t('setupProfile.gender')} gap />
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((g) => (
          <Pressable
            key={g}
            style={[styles.genderBtn, form.gender === g && styles.genderActive]}
            onPress={() => {
              Keyboard.dismiss();
              setForm((f) => ({ ...f, gender: g }));
            }}
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
          onPress={() => {
            Keyboard.dismiss();
            setNationalityOpen((v) => !v);
          }}
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
                    Keyboard.dismiss();
                    setForm((f) => ({ ...f, nationality: code as NationalityCode }));
                    setNationalityOpen(false);
                    clearError('nationality');
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
        <ErrorText>{errors.nationality ?? null}</ErrorText>
      </View>

      {/* Interests — optional. Markup mirrors settings/edit-profile.tsx so
          a user revisiting this through Settings sees the exact same shape. */}
      <Text style={[styles.label, styles.sectionGap]}>
        {t('setupProfile.interests', { count: interests.length })}
      </Text>
      <Text style={styles.hintBlock}>{t('setupProfile.interestsHint')}</Text>
      <InterestSelector
        selectedIds={selectedInterestIds}
        totalSelected={interests.length}
        onToggle={toggleInterest}
      />

      {/* Referral code — optional. Partner (한일교류회 등) 유입 추적용. */}
      <Text style={[styles.label, styles.sectionGap]}>
        {t('setupProfile.referralCode')}
      </Text>
      <Text style={styles.hintBlock}>{t('setupProfile.referralCodeHint')}</Text>
      {/* 잘 동작하는 display_name 필드와 완전히 동일한 순수 controlled 입력.
          타이핑 중 대문자화(value 변환 or textTransform 스타일)는 이 Android
          키보드의 조합 로직과 충돌해 이전 글자가 중복 입력된다(sejin→SESEJSEJISEJIN).
          입력한 그대로 표시하고, 영숫자 필터 + 대문자 정규화는 저장 시점에만 한다. */}
      <FormField
        value={referralCode}
        onChangeText={setReferralCode}
        placeholder={t('setupProfile.referralCodePlaceholder')}
        maxLength={40}
        inputStyle={styles.inputCompact}
      />

      </KeyboardAwareScrollView>

      {/* Footer stays pinned at bottom: 0 — the Next button intentionally sits
          behind the keyboard while typing. KeyboardAwareScrollView scrolls the
          focused FormField above the keyboard line. */}
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
  chipText: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.medium },
  chipActiveText: { color: colors.white },
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
