import { useEffect, useRef } from 'react';
import { Image } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function MainLayout() {
  const { isAuthenticated } = useAuthStore();
  const photos = useAuthStore((s) => s.profile?.photos);
  const hasProfile = useAuthStore((s) => s.hasProfile);
  const profileLoaded = useAuthStore((s) => s.profile != null);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  // 프로필이 비어 있는 동안 백오프 재시도 (2초 → 4 → 8 … 최대 30초).
  // 부팅은 네트워크 없이 낙관적으로 진입하고 프로필은 백그라운드로 한 번 받는데,
  // loadProfile 은 실패를 조용히 삼켜서 그 한 번이 실패하면 앱을 다시 켤 때까지
  // profile=null 로 남았다 — 프로필 탭 영구 로딩 + 재동의/유입경로 게이트 미노출
  // (2026-09-21 /refresh 장애 때 관측). 탭이 아니라 여기 두는 이유가 그 게이트들이다.
  // hasProfile=false(가입 마법사)는 프로필이 원래 없는 상태라 돌지 않는다.
  useEffect(() => {
    if (!isAuthenticated || !hasProfile || profileLoaded) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 2000;
    const attempt = async () => {
      await loadProfile();
      if (cancelled) return;
      timer = setTimeout(attempt, delay);
      delay = Math.min(delay * 2, 30000);
    };
    // 첫 시도는 한 박자 늦춘다 — 부팅 직후엔 tryAutoLogin 의 백그라운드 로드가
    // 이미 진행 중이라 즉시 쏘면 GET /me 가 중복된다.
    timer = setTimeout(attempt, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, hasProfile, profileLoaded, loadProfile]);

  // 다른 탭(채팅 목록 / 받은 좋아요) 데이터 프리로드는 여기서 하지 않는다 —
  // 첫 화면인 디스커버의 첫 후보/이미지와 대역폭을 다투기 때문. 디스커버가 첫
  // 응답을 받은 뒤 useDiscover 가 lib/swr 의 preloadTabData 를 부른다.

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
      {/* 가입 마법사 — 실제 진행 순서대로 나열. 예전엔 파일명이 step1~step5 라
          숫자와 실제 순서가 어긋났다(사진 화면이 step5 인데 두 번째로 진행됨).
          단계 번호는 각 화면의 WizardHeader step 이 담당한다. */}
      <Stack.Screen name="setup/consent" />
      <Stack.Screen name="setup/profile" />
      <Stack.Screen name="setup/photos" />
      <Stack.Screen name="setup/preferences" />
      <Stack.Screen name="setup/voice" />
      <Stack.Screen name="setup/intro" />
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
