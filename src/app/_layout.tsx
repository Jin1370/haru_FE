import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider, useResizeMode } from 'react-native-keyboard-controller';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { setAudioModeAsync } from 'expo-audio';
import { useAuthStore } from '@/stores/authStore';
import { registerOnSessionExpired, registerOnAccountFrozen } from '@/services/api';
import { requestAndRegisterPushToken } from '@/hooks/usePushToken';
import { getActiveChatMatchId, isMatchesTabActive } from '@/lib/activeChat';
import {
  hrefForDeepLink,
  isBootDecided,
  setPendingDeepLink,
  type DeepLink,
} from '@/lib/pendingDeepLink';
import { AlertHost } from '@/components/ui/AlertHost';
import { PhotoEditorHost } from '@/components/photo/PhotoEditorHost';
import { ReconsentGate } from '@/components/setup/ReconsentGate';
import { AcquisitionGate } from '@/components/setup/AcquisitionGate';
import { UpdateRequiredScreen } from '@/components/UpdateRequiredScreen';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import { showAlert } from '@/stores/alertStore';
import { SWRConfigProvider } from '@/lib/swr';
import { APP_FONT_ASSETS, DEFERRED_FONT_ASSETS } from '@/constants/fonts';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';

// 환경분리 도입 시 EXPO_PUBLIC_SENTRY_ENV 만 dev/stage/prod 로 다르게 주면 Sentry
// 대시보드에서 environment 로 필터된다. iOS/Android 구분은 Sentry 가 자동 태깅.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'development',
  // 성능 트레이스 비활성 (0). 무료 플랜 스팬 쿼터 보호 + 현재 트레이싱 데이터 미사용.
  // 앱 속도/병목 분석이 필요해지면 0.05~0.2 로 올린다.
  tracesSampleRate: 0,
  // 'Session expired' 는 리프레시 토큰 만료 → onSessionExpired() 로그아웃이
  // 이미 처리한 정상 흐름. 호출처가 catch 안 하면 unhandledrejection 으로
  // Sentry 에 올라오지만 조치할 버그가 아니라 노이즈라 필터.
  ignoreErrors: ['Session expired'],
  beforeSend(event, hint) {
    // ApiRequestError 는 "요청이 정상적으로 답을 받았다" 는 뜻 — status 0(오프라인/
    // 타임아웃)과 4xx(검증·중복·차단 등 BE 가 의도적으로 내린 거절)는 앱 버그가 아니다.
    // 5xx 만 남기는데 그것도 BE Sentry 가 원인과 함께 이미 잡으므로 여기선 참고용.
    const err = hint?.originalException as { name?: string; status?: number } | undefined;
    if (err?.name === 'ApiRequestError' && typeof err.status === 'number' && err.status < 500) {
      return null;
    }
    return event;
  },
});

SplashScreen.preventAutoHideAsync().catch(() => {});

registerOnSessionExpired(() => useAuthStore.getState().logout());

// message-moderation-v1 (PR2): 누적 신고 자동 freeze 가 발동된 사용자가 mutating
// 라우트 호출 시 BE freezeGuard 가 403 + code='account_frozen' 응답 → api.ts 의
// 글로벌 분기가 본 핸들러 호출. 모달 1회 (CS 안내) + 로그아웃.
//
// 침묵 통지 정책 (architect plan 2.2 / safety 05a 항목 2): 외부 통지(push/email/SMS)
// 는 미발송 — 가해 사용자에게 회피 시점 정보를 주지 않고, 다음 mutating 호출 시
// 앱 내 모달 1회만 노출. freeze 사유/카테고리는 미노출 (악성 회피 학습 차단) +
// CS 채널로 문의 안내. CS 이메일 채널 확보는 출시 전 카피 보강 (legal_drafts.md TODO).
registerOnAccountFrozen(() => {
  showAlert({
    variant: 'info',
    title: i18n.t('moderation.frozen.title') as string,
    message: i18n.t('moderation.frozen.notice') as string,
    onConfirm: () => useAuthStore.getState().logout(),
  });
});

// push-notifications sprint: foreground 알림 표시 정책. 앱이 열려 있는 상태에서도
// OS 트레이 알림을 띄운다.
//
// 예외 (모두 type='message' 푸시에만 적용 — type='match' 새 매치 알림은 항상 통과):
//   (1) 현재 사용자가 열어둔 채팅방과 동일한 match_id 의 메시지: 채팅창에서
//       실시간으로 보고 있으므로 OS 알림이 중복 신호.
//   (2) 매치 목록(채팅 목록) 탭이 활성 상태: 새 메시지는 list realtime 으로 즉시
//       반영되므로 OS 메시지 푸시는 중복 신호. 단, 새 매치 알림은 사용자가
//       기대하는 ping 이므로 통과 — 매치 탭이 떠 있어도 트레이/배너/사운드 정상.
//
// 백그라운드/종료 상태에서는 setNotificationHandler 가 호출되지 않고 OS 가
// 직접 처리하므로 영향 없음 (앱이 백그라운드면 어떤 탭이든 비활성 상태로 간주됨).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { type?: string; match_id?: string }
      | undefined;
    const isMessage = data?.type === 'message';
    const inThisChat =
      isMessage &&
      typeof data?.match_id === 'string' &&
      data.match_id === getActiveChatMatchId();
    const messageWhileInMatchesTab = isMessage && isMatchesTabActive();
    const suppress = inThisChat || messageWhileInMatchesTab;
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    };
  },
});

// 알림 탭 → deep link.
//
// 부팅 목적지 결정권은 index.tsx 단독 (lib/pendingDeepLink 주석 참고). 여기서는
// (1) 알림 응답을 그 보관소에 넣고 (2) index 가 이미 목적지를 정한 뒤 도착한
// 링크만 직접 push 한다. 예전의 "탐색 replace vs 채팅 push" 순서 경합 + 4초
// 데드라인 안전망은 목적지 결정이 한 곳으로 모이면서 필요 없어졌다.
function extractDeepLink(
  response: Notifications.NotificationResponse | null | undefined,
): DeepLink | null {
  if (!response) return null;
  const data = response.notification.request.content.data as
    | { type?: string; match_id?: string }
    | undefined;
  if (!data) return null;
  if (data.type === 'message' && data.match_id) {
    return { type: 'message', match_id: data.match_id };
  }
  if (data.type === 'match') {
    return { type: 'match' };
  }
  if (data.type === 'like') {
    return { type: 'like' };
  }
  if (data.type === 'voice_reminder') {
    return { type: 'voice_reminder' };
  }
  return null;
}

// 전역 기본 글꼴은 Text/TextInput 의 defaultProps 로 주입했었으나, React 19 가
// 함수 컴포넌트의 defaultProps 를 무시하면서 무동작 코드가 됐다. 각 스타일이
// fontFamily 를 명시하는 방식으로 일원화 (미지정 시 시스템 폰트 폴백).

function RootShell() {
  // Force adjustResize at the activity level once for the whole tree. Every
  // input screen below uses useKeyboardState to manually offset for the
  // visible keyboard height, so we need a consistent window mode underneath.
  useResizeMode();
  return (
    <SafeAreaProvider>
      <SWRConfigProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="index" />
        </Stack>
        <AlertHost />
        <PhotoEditorHost />
        {/* LAUNCH_CHECKLIST #5 — mig 039 이전 가입 회원 재동의 게이트. 동의
            미기록자에게 약관동의 화면(ConsentForm)을 전체화면으로 띄운다(소급 간주 금지). */}
        <ReconsentGate />
        {/* 유입 경로 게이트 (mig 051). 사용자당 1회, 건너뛰기 없음. 순서는 렌더
            순서가 아니라 AcquisitionGate 내부의 voice_consent_at 조건이 보장한다
            (동의 미기록이면 이쪽이 뜨지 않는다). */}
        <AcquisitionGate />
      </SWRConfigProvider>
    </SafeAreaProvider>
  );
}

function RootLayout() {
  const { isLoading, tryAutoLogin, isAuthenticated, hasProfile } = useAuthStore();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  // 강제 업데이트 게이트 — 부팅 시 BE min_version 과 앱 버전 비교. blocked 면
  // 앱 트리 대신 차단 화면만 렌더. fail-open 이라 평소엔 항상 false.
  const { blocked: updateBlocked, storeUrl } = useForceUpdate();

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync(APP_FONT_ASSETS);
      } finally {
        setFontsLoaded(true);
      }
      // 배지 숫자 전용 폰트는 첫 페인트를 막지 않는다 (로드 전엔 시스템 폰트 폴백).
      Font.loadAsync(DEFERRED_FONT_ASSETS).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    tryAutoLogin();
  }, []);

  // chat-audio-mid-session-playback fix: 부팅 시 audio session 을 playback-only
  // (`allowsRecording: false`) + 무음 모드 재생 허용으로 명시 고정. 진단 로그
  // 분석 결과 — useAudioPlayer 가 mid-session 으로 새 메시지 셀에 mount 될 때
  // duration 은 파싱되는데 isLoaded 가 false 에 머무는 케이스가 관측됐다. iOS
  // 에서 이 패턴은 AVPlayerItem.status 가 .readyToPlay 로 진입 못한 상태이고,
  // 가장 흔한 트리거는 audio session 이 `playAndRecord` category 에 있는 것.
  // useVoiceCloneRecorder.start() 가 `allowsRecording: true` 로 한 번 바꾼 뒤
  // 복원하지 않는 경로가 있어, 채팅방에 진입한 시점에는 이미 record-capable
  // 세션일 수 있다. 이 상태에서 새로 attach 되는 AVPlayer 의 buffer fill 이
  // 멈춰 사용자가 보고한 "재생 버튼 깜빡 후 무음" 패턴이 발생한다.
  //
  // 부팅 시 단 한 번 명시적으로 playback-only 로 고정하면 (i) 녹음 직후 audio
  // session 잔여 상태 영향이 사라지고 (ii) Android playsInSilentMode 가 활성
  // 화돼 무음 모드에서도 메시지 재생이 보장된다. recorder 가 필요할 때만
  // `allowsRecording: true` 로 일시 전환하고 (이미 useVoiceCloneRecorder.start
  // 에서 수행) stop() 직후 다시 false 로 원복하는 책임은 recorder 훅에 둔다.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {
      // 무시 — 단발성 audio session 설정 실패해도 앱 동작은 계속.
    });
  }, []);

  // push-notifications follow-up: Android 헤드업/플로팅 알림 (카톡 스타일).
  // Notification Channel importance 기본값(DEFAULT)은 상태바에만 조용히 표시되고
  // 화면 상단 배너 노출이 안 된다. HIGH 로 명시 설정해야 background/종료 상태에서
  // 받은 알림이 헤드업으로 잠깐 뜬다. iOS 는 채널 없음 — 기본 배너 정책.
  //
  // 주의: Android 는 채널이 한 번 생성된 뒤로는 코드로 importance 를 변경할 수
  // 없다 (사용자만 시스템 설정에서 변경 가능). 첫 dev build 설치 직후 호출되면
  // HIGH 로 잡히지만, 이전에 DEFAULT 로 만들어진 단말은 시스템 설정 → 알림 →
  // haru → 알림 카테고리 → "긴급"/"높음" 으로 사용자가 직접 변경 필요.
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C5CE7',
        sound: 'default',
      }).catch(() => undefined);
    }
  }, []);

  const [laidOut, setLaidOut] = useState(false);

  // push-notifications sprint: 알림 탭 deep link.
  //
  // useLastNotificationResponse 는 (a) 네이티브가 부팅 시 이미 들고 있던 응답을
  // 동기로 읽고 (b) 이후 도착하는 탭도 구독으로 계속 반영한다. 옛 코드는
  // getLastNotificationResponseAsync 를 부팅 시 딱 한 번 호출해, 그 시점에 응답이
  // 준비되지 않았으면 링크를 영구 유실했다(관측: `capture(cold) none` 뒤 탐색 착지).
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const link = extractDeepLink(lastResponse);
    if (!link) return;
    if (!isBootDecided()) {
      // 아직 index.tsx 가 부팅 목적지를 정하기 전 → 보관만. index 가 이 링크를
      // 꺼내 처음부터 그 화면으로 Redirect 한다 (탐색을 안 거치므로 경합 없음).
      if (__DEV__) console.log('[deeplink] pending for boot', JSON.stringify(link));
      setPendingDeepLink(link);
      return;
    }
    // 목적지가 이미 정해진 뒤 도착 — 앱이 살아있는 동안의 탭이거나, 콜드 응답이
    // index 렌더보다 늦게 온 경우. 화면이 안착한 상태라 그 자리에서 얹으면 된다.
    if (__DEV__) console.log('[deeplink] push now', JSON.stringify(link));
    router.push(hrefForDeepLink(link));
  }, [lastResponse]);

  // push-notifications sprint follow-up: 인증·프로필 보유 사용자 자동 토큰 재등록.
  // setup photos 에만 권한 트리거를 두면 dev build 적용 이전에 회원가입을 끝낸
  // 기존 사용자가 영영 device_tokens 행을 생성하지 못한다 (silent skip → 푸시
  // 미수신). 매 로그인/auto-login 시점에 호출하면:
  //   * 권한이 이미 grant 상태면 OS 모달 없이 토큰만 refresh + BE upsert (idempotent)
  //   * 미허용·denied 상태면 OS 가 모달 표시 (denied 였으면 모달도 미표시 — OS 정책)
  // hasProfile=true 게이트로 setup 진행 중 사용자에는 영향 없음 (그쪽은 photos 가 담당).
  useEffect(() => {
    if (isAuthenticated && hasProfile) {
      requestAndRegisterPushToken().catch(() => undefined);
    }
  }, [isAuthenticated, hasProfile]);

  const appReady = fontsLoaded && !isLoading;

  // 네이티브 스플래시 hide 제어 — onLayout(첫 레이아웃) 이후에 내려 안드로이드
  // 기본 회색 윈도우가 비치는 것을 막는다.
  //
  // 딥링크용 홀드는 없앴다: index.tsx 가 처음부터 채팅방으로 Redirect 하므로
  // 첫 페인트가 곧 목적지 화면이고, 탐색이 스칠 구간 자체가 사라졌다.
  useEffect(() => {
    if (!appReady || !laidOut) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [appReady, laidOut]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={() => setLaidOut(true)}
    >
      {updateBlocked ? (
        // 차단 화면도 useSafeAreaInsets 를 쓰므로 SafeAreaProvider 로 감싼다.
        // splash hide 는 위 effect 가 updateBlocked 분기로 담당 → 정상 해제됨.
        <SafeAreaProvider>
          <UpdateRequiredScreen storeUrl={storeUrl} />
        </SafeAreaProvider>
      ) : (
        <KeyboardProvider>
          <RootShell />
        </KeyboardProvider>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FEEEF0' },
});

export default Sentry.wrap(RootLayout);
