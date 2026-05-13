import { useEffect, useState } from 'react';
import { Platform, Text, TextInput } from 'react-native';
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
import { registerOnSessionExpired } from '@/services/api';
import { requestAndRegisterPushToken } from '@/hooks/usePushToken';
import { getActiveChatMatchId } from '@/lib/activeChat';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AlertHost } from '@/components/ui/AlertHost';
import { SWRConfigProvider } from '@/lib/swr';
import { PRETENDARD_ASSETS, fonts } from '@/constants/fonts';
import '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});

registerOnSessionExpired(() => useAuthStore.getState().logout());

// push-notifications sprint: foreground 알림 표시 정책. 앱이 열려 있는 상태에서도
// OS 트레이 알림을 띄운다.
//
// 예외: 현재 사용자가 열어둔 채팅방과 동일한 match_id 의 message 알림은 trayed
// 알림을 표시하지 않는다 (배너/사운드/리스트 모두 OFF). 이미 채팅창에서 메시지를
// 실시간으로 보고 있으므로 OS 알림이 중복 신호가 되어 노이즈. 백그라운드/종료
// 상태에서는 setNotificationHandler 가 호출되지 않고 OS 가 직접 처리하므로 영향
// 없음 (앱이 백그라운드면 채팅창도 비활성 상태로 간주됨).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { type?: string; match_id?: string }
      | undefined;
    const inThisChat =
      data?.type === 'message' &&
      typeof data.match_id === 'string' &&
      data.match_id === getActiveChatMatchId();
    return {
      shouldShowBanner: !inThisChat,
      shouldShowList: !inThisChat,
      shouldPlaySound: !inThisChat,
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
      </SWRConfigProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const { isLoading, tryAutoLogin, isAuthenticated, hasProfile } = useAuthStore();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync(PRETENDARD_ASSETS);
        applyDefaultFont();
      } finally {
        setFontsLoaded(true);
        await SplashScreen.hideAsync().catch(() => {});
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

  if (!fontsLoaded || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <RootShell />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
