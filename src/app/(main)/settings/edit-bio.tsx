import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { BioPhrasePicker } from '@/components/setup/BioPhrasePicker';
import { useProfile } from '@/hooks/useProfile';
import { showAlert } from '@/stores/alertStore';
import { ApiRequestError } from '@/services/api';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { validateVoiceIntro } from '@/utils/validators';
import { buildVoiceIntroPayload } from '@/utils/voiceIntroPayload';

export default function EditBioScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, loading, upsertProfile } = useProfile();
  const voiceReady = profile?.voice_clone_status === 'ready';

  const [bio, setBio] = useState(profile?.voice_intro ?? '');
  // Catalog id of the picked preset (or null for custom-typed bios). Filled
  // by BioPhrasePicker's initial sync effect once it has resolved `value`
  // against the catalog. Forwarded to BE via `voice_intro_phrase_id`
  // (voice-intro-preset-bypass sprint) to skip Gemini for known entries.
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setBio(profile.voice_intro ?? '');
  }, [profile]);

  // Live-validate the voice intro text as the user picks/types it. Empty is
  // allowed (treated as "clear the intro"); only length and forbidden-char
  // violations surface inline. BioPhrasePicker also reports the picked preset
  // id (null in custom mode); we mirror both into local state.
  const handleBioChange = (next: string, nextPhraseId: string | null) => {
    setBio(next);
    setPhraseId(nextPhraseId);
    const err = validateVoiceIntro(next);
    setBioError(err ? t(err.key, err.vars) : null);
  };

  const handleSave = async () => {
    if (!profile) return;
    // Block save while the inline error is showing — otherwise users could
    // tap save before the validation message lands and ship the bad value.
    const err = validateVoiceIntro(bio);
    if (err) {
      setBioError(t(err.key, err.vars));
      return;
    }
    setBioError(null);
    try {
      await upsertProfile({
        display_name: profile.display_name,
        birth_date: profile.birth_date,
        gender: profile.gender,
        nationality: profile.nationality,
        language: profile.language,
        ...buildVoiceIntroPayload(bio, phraseId),
        interests: profile.interests,
      });
      router.back();
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

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('profile.editBio')}
        onBack={() => router.back()}
      />
      {/* KeyboardAwareScrollView auto-scrolls the focused TextInput above the
          keyboard — no manual scrollToEnd / onFocus wiring needed. bottomOffset
          adds breathing room between the input bottom and the keyboard top. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + 88 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={styles.subtitle}>{t('profile.editBioSubtitle')}</Text>
        <BioPhrasePicker
          value={bio}
          onChange={handleBioChange}
          language={profile?.language ?? 'ko'}
          disabled={!voiceReady}
          lockedHint={!voiceReady ? t('setupProfile.bioLockedHint') : undefined}
          error={bioError}
        />
        {!voiceReady ? (
          <View style={styles.lockedCta}>
            <Button
              title={t('discover.lockedGoVoice')}
              onPress={() => router.push('/(main)/settings/voice')}
              textStyle={styles.lockedCtaText}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {/* Footer stays pinned at the bottom (no kbHeight lift) — the Save
          button intentionally sits behind the keyboard while typing. The
          ScrollView paddingBottom above already includes kbHeight, so the
          custom-input card can be scrolled above the keyboard line. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={t('common.save')}
          onPress={handleSave}
          loading={loading}
          disabled={!voiceReady}
        />
      </View>
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
  lockedCta: {
    marginTop: 12,
    alignItems: 'center',
  },
  lockedCtaText: {
    paddingHorizontal: 8,
  },
});
