import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { BioPhrasePicker } from '@/components/setup/BioPhrasePicker';
import { useProfile } from '@/hooks/useProfile';
import { useSignupDraftStore } from '@/stores/signupDraftStore';
import { showAlert } from '@/stores/alertStore';
import { ApiRequestError } from '@/services/api';
import { colors } from '@/constants/colors';
import { validateVoiceIntro } from '@/utils/validators';
import { buildVoiceIntroPayload } from '@/utils/voiceIntroPayload';

export default function SetupStep3() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const draft = useSignupDraftStore();
  const { profile, loading, upsertProfile } = useProfile();
  const voiceReady = profile?.voice_clone_status === 'ready';

  // Wizard position 5 (final step). With voice not registered, the bio phrase
  // picker has nothing to synthesize, so auto-finish straight into the app.
  // The user can re-register the voice and pick a phrase later from settings.
  useEffect(() => {
    if (profile && !voiceReady) {
      draft.reset();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/(main)/(tabs)/discover');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, voiceReady]);

  const [bio, setBio] = useState(draft.bio || profile?.voice_intro || '');
  // Catalog id of the picked preset (or null for custom-typed bios). Starts
  // null and is filled by BioPhrasePicker's initial sync effect once it has
  // resolved `value` against the catalog. Forwarded to BE via
  // `voice_intro_phrase_id` (voice-intro-preset-bypass sprint).
  const [phraseId, setPhraseId] = useState<string | null>(draft.bioPhraseId);
  const [bioError, setBioError] = useState<string | null>(null);

  // Live-validate the bio while the user picks/types so length and forbidden
  // chars surface inline (red border + ErrorText) inside the picker card.
  // BioPhrasePicker also reports the picked preset id (null in custom mode);
  // we mirror both into local state and the signup draft store so the wizard
  // stays consistent if the user navigates back/forward.
  const handleBioChange = (next: string, nextPhraseId: string | null) => {
    setBio(next);
    setPhraseId(nextPhraseId);
    const err = validateVoiceIntro(next);
    setBioError(err ? t(err.key, err.vars) : null);
  };

  const persistBio = async (nextBio: string, nextPhraseId: string | null) => {
    if (!profile) return;
    await upsertProfile({
      display_name: profile.display_name,
      birth_date: profile.birth_date,
      gender: profile.gender,
      nationality: profile.nationality,
      language: profile.language,
      ...buildVoiceIntroPayload(nextBio, nextPhraseId),
      interests: profile.interests,
    });
  };

  const enterApp = () => {
    draft.reset();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(main)/(tabs)/discover');
  };

  // Final step: "HARU 시작하기" saves the picked phrase (if any) and enters
  // the app. Validation errors keep the user on this screen so they can fix
  // the input. Empty bio is treated as skip (allowed — the voice intro is
  // optional and surfaces in-app nudges later).
  const handleStart = async () => {
    if (!bio.trim()) {
      try {
        await persistBio('', null);
      } catch {
        // Best-effort skip — don't block app entry if the BE clear hiccups.
      }
      enterApp();
      return;
    }
    const err = validateVoiceIntro(bio);
    if (err) {
      setBioError(t(err.key, err.vars));
      return;
    }
    setBioError(null);
    try {
      draft.setBio(bio.trim());
      draft.setBioPhraseId(phraseId);
      await persistBio(bio, phraseId);
      enterApp();
    } catch (e: any) {
      // voice-intro-moderation-unification: 메시지 모더레이션과 동일 패턴.
      // 사전 키워드 + OpenAI 차단 (422 code='message_blocked') 은 안전 카피
      // 토스트로 노출하고 입력 텍스트(`bio`) 는 state 에 이미 보존되어 있어
      // 사용자가 같은 화면에서 재편집 가능. 그 외 422/네트워크 에러는 기존 동선.
      if (e instanceof ApiRequestError && e.code === 'message_blocked') {
        showAlert({
          variant: 'info',
          title: t('moderation.blocked.title'),
          message: t('moderation.blocked.toast'),
        });
      } else {
        showAlert({ variant: 'error', title: t('common.error'), message: e.message });
      }
    }
  };

  // Single CTA below carries both "save & start" and "skip & start" intents.
  // Label is contextual on whether the user picked / typed a phrase.
  const hasBioInput = bio.trim().length > 0;

  // Pre-redirect render: keep blank to avoid a one-frame flash of the locked
  // copy when we already know we're about to bounce to step4.
  if (profile && !voiceReady) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WizardHeader
        step={5}
        title={t('signupWizard.step3Title')}
        subtitle={t('signupWizard.step3Subtitle')}
        onBack={() => router.back()}
      />
      {/* KeyboardAwareScrollView auto-scrolls the focused TextInput above the
          keyboard (no manual scrollToEnd / onFocus wiring needed). bottomOffset
          adds breathing room between the input bottom and the keyboard top. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <BioPhrasePicker
          value={bio}
          onChange={handleBioChange}
          language={profile?.language ?? 'ko'}
          disabled={!voiceReady}
          lockedHint={!voiceReady ? t('setupProfile.bioLockedHint') : undefined}
          error={bioError}
        />
      </KeyboardAwareScrollView>

      {/* Footer stays pinned at bottom: 0 — the start/skip CTA intentionally
          sits behind the keyboard while typing the custom bio. ScrollView
          paddingBottom above already includes kbHeight so the custom input
          card can be scrolled above the keyboard line. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={t(hasBioInput ? 'signupWizard.startHaru' : 'signupWizard.skipAndStart')}
          onPress={handleStart}
          loading={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
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
