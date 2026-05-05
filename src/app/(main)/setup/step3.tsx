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

export default function SetupStep3() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const draft = useSignupDraftStore();
  const { profile, loading, upsertProfile } = useProfile();
  const voiceReady = profile?.voice_clone_status === 'ready';

  // Auto-skip when voice clone isn't ready: bio phrases must be synthesized
  // with the user's cloned voice (BE pipeline), so without a registered
  // voice this step has nothing to offer. Bounce straight to step4.
  // useEffect runs after first paint — that's intentional so SetupStep2's
  // "Skip" doesn't crash trying to read profile before authStore hydrates.
  useEffect(() => {
    if (profile && !voiceReady) {
      router.replace('/(main)/setup/step4');
    }
  }, [profile, voiceReady]);

  const [bio, setBio] = useState(draft.bio || profile?.voice_intro || '');
  const [bioError, setBioError] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Live-validate the bio while the user picks/types so length and forbidden
  // chars surface inline (red border + ErrorText) inside the picker card.
  const handleBioChange = (next: string) => {
    setBio(next);
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

  const persistBio = async (nextBio: string | null) => {
    if (!profile) return;
    // Mirror settings/edit-bio.tsx exactly so a user re-editing later sees a
    // consistent payload shape. We only change voice_intro here.
    await upsertProfile({
      display_name: profile.display_name,
      birth_date: profile.birth_date,
      gender: profile.gender,
      nationality: profile.nationality,
      languages: profile.languages,
      voice_intro: nextBio,
      interests: profile.interests,
    });
  };

  const handleNext = async () => {
    // Block when empty (required) or when the live validator already flagged
    // a length / forbidden-char issue. Inline message under the custom input
    // (via BioPhrasePicker.error) replaces the previous Alert popup.
    if (!bio.trim()) {
      setBioError(t('signupWizard.bioRequired'));
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
      await persistBio(bio.trim());
      router.push('/(main)/setup/step4');
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleSkip = async () => {
    try {
      draft.setBio('');
      // Persist null so a previously-saved value isn't silently retained when
      // the user opted out at signup.
      await persistBio(null);
      router.push('/(main)/setup/step4');
    } catch (e: any) {
      // Skipping is best-effort; don't block navigation if BE hiccups here.
      router.push('/(main)/setup/step4');
    }
  };

  // Pre-redirect render: keep blank to avoid a one-frame flash of the locked
  // copy when we already know we're about to bounce to step4.
  if (profile && !voiceReady) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WizardHeader
        step={3}
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
          language={profile?.languages?.[0]?.code ?? profile?.language ?? 'ko'}
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
          <Button title={t('common.next')} onPress={handleNext} loading={loading} />
          <Button title={t('common.skip')} variant="outline" onPress={handleSkip} disabled={loading} />
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
