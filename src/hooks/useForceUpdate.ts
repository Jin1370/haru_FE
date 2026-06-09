import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAppConfig } from '@/services/config';
import { isVersionBelow } from '@/lib/version';

// 강제 업데이트 게이트 (최소판). 부팅 시 1회 GET /api/config →
// 앱 버전(app.json 의 expo.version)이 서버 min_version 미만이면 blocked.
//
// fail-open 설계: config 호출이 네트워크/서버 오류로 실패하면 blocked=false 유지.
// 출시 초기에 config 엔드포인트 일시 장애로 전체 사용자가 잠기는 사고를 피한다.
// 게이트는 "스키마 깨는 변경 시 옛 앱을 끊는 안전망"이지 보안 장치가 아니므로
// 차단을 보수적으로(확실히 미만일 때만) 건다.
//
// 주의: Constants.expoConfig.version 은 JS 번들에 박힌 버전이다. EAS Update OTA 로
// version 을 올린 JS 를 옛 네이티브 바이너리에 밀면 보고 버전이 올라가 게이트를
// 통과한다 — 네이티브를 깨는 변경은 OTA 가 아니라 새 빌드 + MIN_APP_VERSION bump
// 조합으로 끊어야 한다 (메모리 project_eas_update_ota 참고).
export function useForceUpdate(): { blocked: boolean; storeUrl: string } {
  const [blocked, setBlocked] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getAppConfig();
        if (cancelled) return;
        const current = Constants.expoConfig?.version;
        if (isVersionBelow(current, cfg.min_version)) {
          setStoreUrl(
            Platform.OS === 'ios' ? cfg.ios_store_url : cfg.android_store_url,
          );
          setBlocked(true);
        }
      } catch {
        // fail-open — 사용자를 잠그지 않는다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { blocked, storeUrl };
}
