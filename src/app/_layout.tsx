import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
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
import { AlertHost } from '@/components/ui/AlertHost';
import { PhotoEditorHost } from '@/components/photo/PhotoEditorHost';
import { UpdateRequiredScreen } from '@/components/UpdateRequiredScreen';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import { showAlert } from '@/stores/alertStore';
import { SWRConfigProvider } from '@/lib/swr';
import { PRETENDARD_ASSETS, fonts } from '@/constants/fonts';
import * as Sentry from '@sentry/react-native';
import i18n from '@/i18n';

// 환경분리 도입 시 EXPO_PUBLIC_SENTRY_ENV 만 dev/stage/prod 로 다르게 주면 Sentry
// 대시보드에서 environment 로 필터된다. iOS/Android 구분은 Sentry 가 자동 태깅.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'development',
  tracesSampleRate: 0.2,
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

// 알림 탭 → deep link. data.type 으로 분기.
function handleNotificationResponse(
  response: Notifications.NotificationResponse | null | undefined,
) {
  if (!response) return;
  const data = response.notification.request.content.data as
    | { type?: string; match_id?: string }
    | undefined;
  if (!data) return;
  if (data.type === 'message' && data.match_id) {
    router.push(`/chat/${data.match_id}`);
  } else if (data.type === 'match') {
    router.push('/(main)/(tabs)/matches');
  }
}

function applyDefaultFont() {
  const textAny = Text as unknown as { defaultProps?: { style?: unknown } };
  textAny.defaultProps = textAny.defaultProps ?? {};
  textAny.defaultProps.style = [{ fontFamily: fonts.pixel }, textAny.defaultProps.style];

  const inputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
  inputAny.defaultProps = inputAny.defaultProps ?? {};
  inputAny.defaultProps.style = [{ fontFamily: fonts.pixel }, inputAny.defaultProps.style];
}

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
        await Font.loadAsync(PRETENDARD_ASSETS);
        applyDefaultFont();
      } finally {
        setFontsLoaded(true);
      }
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

  // push-notifications sprint: 알림 탭 deep link.
  //   * addNotificationResponseReceivedListener — 앱이 background/foreground 일 때 탭.
  //   * getLastNotificationResponseAsync — cold start (앱 종료 상태에서 알림 탭).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );
    Notifications.getLastNotificationResponseAsync()
      .then(handleNotificationResponse)
      .catch(() => undefined);
    return () => sub.remove();
  }, []);

  // push-notifications sprint follow-up: 인증·프로필 보유 사용자 자동 토큰 재등록.
  // setup step5 에만 권한 트리거를 두면 dev build 적용 이전에 회원가입을 끝낸
  // 기존 사용자가 영영 device_tokens 행을 생성하지 못한다 (silent skip → 푸시
  // 미수신). 매 로그인/auto-login 시점에 호출하면:
  //   * 권한이 이미 grant 상태면 OS 모달 없이 토큰만 refresh + BE upsert (idempotent)
  //   * 미허용·denied 상태면 OS 가 모달 표시 (denied 였으면 모달도 미표시 — OS 정책)
  // hasProfile=true 게이트로 setup 진행 중 사용자에는 영향 없음 (그쪽은 step5 가 담당).
  useEffect(() => {
    if (isAuthenticated && hasProfile) {
      requestAndRegisterPushToken().catch(() => undefined);
    }
  }, [isAuthenticated, hasProfile]);

  const appReady = fontsLoaded && !isLoading;

  if (!appReady) return null;

  // 네이티브 스플래시는 루트 뷰가 레이아웃된 직후에 내린다(단순 effect 보다
  // 늦게) — 첫 화면이 그려지기 전에 splash 가 사라져 안드로이드 기본 회색
  // 윈도우 배경이 잠깐 비치던 문제를 막는다. 루트 배경색도 splash 와 동일한
  // #FEEEF0 으로 둬서, 혹시 남는 빈 프레임도 회색이 아니라 핑크로 채운다.
  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
    >
      {updateBlocked ? (
        // 차단 화면도 useSafeAreaInsets 를 쓰므로 SafeAreaProvider 로 감싼다.
        // splash hide 는 위 onLayout 이 담당하므로 이 분기에서도 정상 해제됨.
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
