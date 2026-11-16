import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { RequiredLabel } from '@/components/ui/RequiredLabel';
import { useProfile } from '@/hooks/useProfile';
import { ApiRequestError } from '@/services/api';
import { DISPLAY_NAME_TAKEN_CODE } from '@/services/profile';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
import { languageForNationality } from '@/constants/nationalities';
import { MAX_INTERESTS } from '@/constants/interests';
import { InterestSelector } from '@/components/profile/InterestSelector';
import { useInterestResolver } from '@/hooks/useInterestLabel';
import { validateDisplayName, DISPLAY_NAME_MAX } from '@/utils/validators';
import { userFacingError } from '@/utils/errors';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, loading, upsertProfile } = useProfile();
  // Lift the absolute footer above the keyboard and extend ScrollView
  // paddingBottom by kbHeight (root KeyboardProvider feeds a unified value
  // for both platforms — keeps the layout math identical everywhere).
  const kbHeight = useKeyboardState((s) => s.height);

  // 생년월일·성별·국적은 가입 후 수정하지 않는다 — 저장 시 기존 값을 그대로 보낸다.
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [nameError, setNameError] = useState<string | undefined>();
  // 오류가 나면 닉네임 필드를 화면 위로 올린다 (setup/profile.tsx 와 같은 방식).
  const scrollRef = useRef<ScrollView>(null);
  const nameY = useRef(0);
  const scrollToName = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, nameY.current - 12), animated: true });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
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
    Keyboard.dismiss();
    if (selectedInterestIds.has(id)) {
      setInterests((prev) =>
        prev.filter((v) => v !== id && resolveId(v) !== id),
      );
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    setInterests((prev) => [...prev, id]);
  };

  // The Save button is always enabled so a tap always produces feedback (App
  // Review flagged the disabled-button pattern under Guideline 2.1(a)).
  const handleSave = async () => {
    Keyboard.dismiss();
    if (!profile) return;
    const nameErr = validateDisplayName(displayName.trim());
    setNameError(nameErr ? t(nameErr.key, nameErr.vars) : undefined);
    if (nameErr) {
      scrollToName();
      return;
    }

    try {
      await upsertProfile({
        display_name: displayName.trim(),
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        // Language is derived from nationality — no user-facing picker.
        language: languageForNationality(profile.nationality),
        voice_intro: profile.voice_intro ?? null,
        interests,
      });
      router.back();
    } catch (e: any) {
      // mig 053: 닉네임 중복은 해당 필드 인라인 에러로 (일반 알림은 어느 값이
      // 문제인지 안 알려준다).
      if (e instanceof ApiRequestError && e.code === DISPLAY_NAME_TAKEN_CODE) {
        setNameError(t('validation.displayNameTaken'));
        scrollToName();
        return;
      }
      showAlert({ variant: 'error', title: t('common.error'), message: userFacingError(e, t) });
    }
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
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 + kbHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={(e) => { nameY.current = e.nativeEvent.layout.y; }}>
          <RequiredLabel text={t('setupProfile.displayName')} />
          <FormField
            value={displayName}
            onChangeText={(v) => {
              setDisplayName(v);
              setNameError(undefined);
            }}
            placeholder={t('setupProfile.displayNamePlaceholder')}
            maxLength={DISPLAY_NAME_MAX}
            inputStyle={styles.inputCompact}
            error={nameError}
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
        <Button title={t('common.save')} onPress={handleSave} loading={loading} disabled={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: fs(14), fontFamily: fonts.medium, color: colors.text, marginBottom: 8 },
  sectionGap: { marginTop: 16 },
  inputCompact: { fontSize: fs(14) },
  hintBlock: {
    fontSize: fs(12),
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: fs(18),
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
