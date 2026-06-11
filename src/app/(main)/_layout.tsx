import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function MainLayout() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="setup/step1" />
      <Stack.Screen name="setup/step2" />
      <Stack.Screen name="setup/step3" />
      <Stack.Screen name="setup/step4" />
      <Stack.Screen name="setup/step5" />
      <Stack.Screen name="settings/index" />
      <Stack.Screen name="settings/edit-profile" />
      <Stack.Screen name="settings/edit-bio" />
      <Stack.Screen name="settings/language" />
      {/* chat 헤더는 화면 내부에서 완전 커스텀 렌더 (뒤로/전구/메뉴 버튼을
          iOS·Android 동일하게 통일). 네이티브 헤더의 플랫폼별 기본 백버튼·
          여백 차이를 제거하기 위해 headerShown:false. 실제 헤더는
          chat/[matchId].tsx 의 ChatHeader 참조. */}
      <Stack.Screen name="chat/[matchId]" options={{ headerShown: false }} />
    </Stack>
  );
}
