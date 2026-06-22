import { useEffect, useRef } from 'react';
import { Image } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function MainLayout() {
  const { isAuthenticated } = useAuthStore();
  const photos = useAuthStore((s) => s.profile?.photos);

  // 로그인 직후 내 프로필 사진을 prefetch 한다. 목적 두 가지:
  //  (1) Supabase storage 호스트로의 TLS 연결을 미리 warm — 탐색 첫 카드가
  //      그 연결을 재사용해 콜드 핸드셰이크(~1~2초)를 건너뛴다. 탐색 후보
  //      사진도 같은 storage 호스트라 워밍 효과를 공유한다.
  //  (2) 내 프로필 탭 사진을 디스크 캐시에 미리 채운다.
  // 세션당 1회만 (warmedRef). 실패는 무시 — 캐시 워밍이지 기능이 아님.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (warmedRef.current || !photos?.length) return;
    warmedRef.current = true;
    for (const url of photos) {
      if (url) Image.prefetch(url).catch(() => {});
    }
  }, [photos]);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="setup/consent" />
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
