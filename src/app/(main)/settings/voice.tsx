import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WizardHeader } from '@/components/setup/WizardHeader';
import { VoiceCloneCard } from '@/components/voice/VoiceCloneCard';
import { colors } from '@/constants/colors';

// 녹음/업로드/재생성 흐름은 setup/voice.tsx 와 완전히 같은 컴포넌트를 쓴다.
// 이 화면 고유한 것은 헤더와 "재생성 (N회 남음)" 잔여 카운트 노출뿐.
export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <WizardHeader compact title={t('profile.voiceSettings')} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled"
      >
        <VoiceCloneCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
});
