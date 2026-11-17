import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { VoiceCloneCard } from '@/components/voice/VoiceCloneCard';
import { colors } from '@/constants/colors';

// 녹음/업로드/재생성 흐름은 settings/voice.tsx 와 완전히 같은 컴포넌트
// (VoiceCloneCard) 를 쓴다. 이 화면 고유한 것은 마법사 헤더와 다음/건너뛰기뿐.
export default function SetupVoice() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Skip leaves voice_clone_status as-is (BE side); intro will detect
  // !voiceReady and self-skip, dropping the user straight onto discover.
  const goNext = () => router.push('/(main)/setup/intro');

  return (
    <View style={styles.container}>
      <WizardHeader
        step={3}
        title={t('signupWizard.voiceTitle')}
        subtitle={t('signupWizard.voiceSubtitle')}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <VoiceCloneCard
          footer={({ voiceReady, isReRecording, hasRecording }) =>
            // 녹음을 마친 동안엔 등록/다시 녹음만 — 다음·건너뛰기는 숨긴다.
            hasRecording ? null : (
              <View style={styles.actions}>
                {/* 등록 전엔 어차피 눌리지 않아 숨긴다 — 건너뛰기만 남는다. */}
                {voiceReady && !isReRecording && (
                  <Button title={t('common.next')} onPress={goNext} />
                )}
                {!voiceReady && (
                  <Button
                    title={t('signupWizard.skipAndStart')}
                    variant="outline"
                    onPress={goNext}
                  />
                )}
              </View>
            )
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  actions: { gap: 10, marginTop: 16 },
});
