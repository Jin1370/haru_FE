import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { VoiceCloneCard } from '@/components/voice/VoiceCloneCard';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 녹음/업로드/재생성 흐름은 settings/voice.tsx 와 완전히 같은 컴포넌트
// (VoiceCloneCard) 를 쓴다. 이 화면 고유한 것은 마법사 헤더와 다음/건너뛰기뿐.
export default function SetupStep2() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Skip leaves voice_clone_status as-is (BE side); step3 will detect
  // !voiceReady and self-skip, dropping the user straight onto step4.
  const goNext = () => router.push('/(main)/setup/step3');

  return (
    <View style={styles.container}>
      <WizardHeader
        step={4}
        title={t('signupWizard.step2Title')}
        subtitle={t('signupWizard.step2Subtitle')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <VoiceCloneCard
          footer={({ voiceReady, isReRecording }) => (
            <>
              {!voiceReady && (
                <View style={styles.skipWarnBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.skipWarnText}>{t('signupWizard.step2SkipWarning')}</Text>
                </View>
              )}
              <View style={styles.actions}>
                {!isReRecording && (
                  <Button title={t('common.next')} onPress={goNext} disabled={!voiceReady} />
                )}
                {!voiceReady && (
                  <Button
                    title={t('signupWizard.skipAndStart')}
                    variant="outline"
                    onPress={goNext}
                  />
                )}
              </View>
            </>
          )}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  skipWarnBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
  },
  skipWarnText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
  actions: { gap: 10, marginTop: 16 },
});
