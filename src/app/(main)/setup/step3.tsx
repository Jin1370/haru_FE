import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { BioPhrasePicker } from '@/components/setup/BioPhrasePicker';
import { useProfile } from '@/hooks/useProfile';
import { useSignupDraftStore } from '@/stores/signupDraftStore';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
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
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

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

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

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
      Alert.alert(t('common.error'), e.message);
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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + Math.max(kbHeight, insets.bottom) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>{t('profile.editBioSubtitle')}</Text>
        <BioPhrasePicker
          value={bio}
          onChange={handleBioChange}
          language={profile?.language ?? 'ko'}
          disabled={!voiceReady}
          lockedHint={!voiceReady ? t('setupProfile.bioLockedHint') : undefined}
          error={bioError}
          onCustomFocus={() => {
            // Wait for keyboard show animation + paddingBottom re-render before
            // scrolling so the input lands above the keyboard, not under it.
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
          }}
        />

        <View style={styles.actions}>
          <Button
            title={t(hasBioInput ? 'signupWizard.startHaru' : 'signupWizard.skipAndStart')}
            onPress={handleStart}
            loading={loading}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    lineHeight: 20,
    marginBottom: 16,
  },
  actions: { gap: 10, marginTop: 24 },
});
