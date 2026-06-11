// Dynamic Expo config — dev/prod 변종(variant) 분기.
//
// app.json 을 base 로 읽어들이고(`config`), APP_VARIANT 환경변수가
// 'development' 일 때만 Android 패키지명/앱이름/scheme/google-services 를
// dev 전용으로 덮어쓴다. 이렇게 하면 dev 앱(com.haruvoice.app.dev)과
// prod 앱(com.haruvoice.app)을 같은 안드로이드 폰에 동시 설치할 수 있다.
//
// APP_VARIANT 는 빌드 시점에 결정된다:
//   * eas.json 의 development/preview 프로필 env 에 APP_VARIANT=development 설정됨
//   * 로컬에서 dev client 로 expo start 할 때도 동일하게 분기하려면
//     `APP_VARIANT=development npx expo start --dev-client` (또는 .env 에 설정)
//
// prod 빌드(production 프로필 / APP_VARIANT 미설정)는 app.json 그대로 사용 — 무변경.
//
// ⚠️ dev 빌드 전 준비물: ./google-services.dev.json (Firebase 의 dev Android 앱
//    com.haruvoice.app.dev 에서 발급). 파일이 없으면 dev 빌드가 실패한다.

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) {
    // prod (또는 변종 미지정): app.json 원본 그대로.
    return config;
  }

  return {
    ...config,
    name: 'haru (dev)',
    scheme: 'haruvoice-dev',
    // dev Metro 의 manifest 응답이 runtimeVersion(policy:fingerprint) 계산에 ~15초
    // 걸려, dev client 의 okhttp 10초 read 타임아웃을 넘겨 SocketTimeout 으로
    // 앱이 안 켜지던 문제 우회 (2026-06-08). 설치된 dev 빌드의 실제 fingerprint
    // 값으로 고정 → Metro 가 node_modules 해싱 없이 manifest 를 즉시 응답하고,
    // 값이 APK 와 동일해 dev launcher 도 통과한다. prod(app.json)는 fingerprint
    // policy 그대로. ⚠️ 네이티브 의존성/플러그인 변경으로 dev client 를 새로
    // EAS 빌드하면 새 빌드의 runtimeVersion 으로 이 값을 갱신해야 한다.
    runtimeVersion: 'haru-dev-20260611-worklets',
    android: {
      ...config.android,
      package: 'com.haruvoice.app.dev',
      googleServicesFile: './google-services.dev.json',
      // dev 아이콘 배경색을 prod(핑크 #F8D2DC)와 다른 보라로 → 홈 화면에서 한눈에 구분.
      // (전경 로고 adaptive-icon.png 의 투명 여백 영역에 이 색이 보임)
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        backgroundColor: '#6C5CE7',
      },
    },
    // iOS 는 Android 전용 동시설치 정책상 변종 분기하지 않음 (prod bundle 유지).
    // 나중에 iOS 동시설치가 필요해지면 여기서 ios.bundleIdentifier 도 분기.
  };
};
