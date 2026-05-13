import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerToken, unregisterToken } from '@/services/notifications';

// 권한 요청 + Expo Push Token 발급 + BE 등록.
// 거부되어도 가입/로그인 흐름은 차단하지 않는다 — 사용자는 나중에 settings
// 화면에서 시스템 설정으로 다시 허용할 수 있다.
//
// 호출 위치:
//   * setup step5 의 handleNext (회원가입 흐름 마지막)
//   * (선택) 앱 시작 시 자동 로그인 분기 — 기존 사용자 재허용/재발급 처리.
//     본 sprint 1차 범위에서는 step5 만 적용. 후속 카드에서 자동 보강.
export async function requestAndRegisterPushToken(): Promise<{
  granted: boolean;
  token?: string;
}> {
  if (!Constants.isDevice && Platform.OS !== 'web') {
    // Simulator/Emulator 에서는 토큰 발급 불가. 거부로 취급.
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }

  if (status !== 'granted') {
    return { granted: false };
  }

  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoPushToken = tokenResult.data;

    const platform: 'ios' | 'android' =
      Platform.OS === 'ios' ? 'ios' : 'android';

    await registerToken(expoPushToken, platform);
    return { granted: true, token: expoPushToken };
  } catch (err) {
    // 토큰 발급/등록 실패 — 권한은 받았으나 인프라(APNs/FCM 자격증명) 부재 등.
    // 가입 흐름 무영향. 다음 로그인/settings 진입 시 재시도.
    console.warn('[usePushToken] token register failed', err);
    return { granted: true };
  }
}

// 로그아웃 시 호출. 현재 기기 토큰을 BE 에서 제거 (다른 사용자 로그인 시
// 옛 owner 에게 잘못된 푸시가 가지 않도록).
export async function unregisterCurrentPushToken(): Promise<void> {
  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await unregisterToken(tokenResult.data);
  } catch {
    // silent — 로그아웃은 절대 차단하지 않음.
  }
}
