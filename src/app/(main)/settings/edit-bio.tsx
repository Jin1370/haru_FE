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
import { ErrorText } from '@/components/ui/ErrorText';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { BioPhrasePicker } from '@/components/setup/BioPhrasePicker';
import { useProfile } from '@/hooks/useProfile';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { validateVoiceIntro } from '@/utils/validators';

export default function EditBioScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, loading, upsertProfile } = useProfile();
  const voiceReady = profile?.voice_clone_status === 'ready';

  const [bio, setBio] = useState(profile?.voice_intro ?? '');
  const [bioError, setBioError] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (profile) setBio(profile.voice_intro ?? '');
  }, [profile]);

  // Live-validate the voice intro text as the user picks/types it. Empty is
  // allowed (treated as "clear the intro"); only length and forbidden-char
  // violations surface inline.
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
        voice_intro: bio.trim() ? bio.trim() : null,
        interests: profile.interests,
      });
      router.back();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  return (
    <View style={styles.container}>
      <WizardHeader
        compact
        title={t('profile.editBio')}
        onBack={() => router.back()}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + Math.max(kbHeight, insets.bottom) + 88 },
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
        />
        <ErrorText testID="edit-bio-error">{bioError}</ErrorText>
        {!voiceReady ? (
          <View style={styles.lockedCta}>
            <Button
              title={t('discover.lockedGoVoice')}
              onPress={() => router.push('/(main)/settings/voice')}
              textStyle={styles.lockedCtaText}
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(kbHeight, insets.bottom) + 12 },
        ]}
      >
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
