// Google Play "사진 및 동영상 권한" / "포그라운드 서비스" 정책 대응.
//
// 라이브러리 플러그인이 매니페스트에 자동 주입하지만 haru 가 실제로는 쓰지 않는
// surplus 권한/서비스를 manifest merge 단계에서 강제 제거한다.
//
// 1) expo-media-library / expo-image-picker
//    → READ_MEDIA_IMAGES / READ_MEDIA_VIDEO / READ_MEDIA_AUDIO
//    - 프로필 사진 선택  → 안드로이드 13+ 시스템 사진 선택 도구가 처리 (권한 불필요)
//    - 워터마크 사진 저장 → writeOnly 저장 (읽기 권한 불필요)
//    - READ_MEDIA_AUDIO 는 expo-media-library 의 granularPermissions 기본값
//      (photo/video/audio)이 주입하는데 haru 는 기기 오디오 파일을 고르지 않으므로
//      순수 잉여. (녹음은 RECORD_AUDIO, 재생은 URL 스트리밍이라 무관)
//
// 2) expo-audio 1.1.x → FOREGROUND_SERVICE_MEDIA_PLAYBACK + AudioControlsService
//    (foregroundServiceType="mediaPlayback")
//    - haru 의 오디오(보이스 인트로/음성 메시지)는 전부 포그라운드에서 사용자가 앱을
//      직접 조작할 때만 재생된다 (setAudioModeAsync 에 shouldPlayInBackground 없음,
//      iOS UIBackgroundModes 에 audio 없음). 즉 백그라운드 미디어 재생 자체가 없어
//      Google 포그라운드 서비스 정책의 허용 요건에 해당하지 않는다.
//    - 권한 + typed foreground service 노드가 매니페스트에 남아 있으면 Play Console 이
//      "포그라운드 서비스 사용 목적" 선언을 요구하므로 둘 다 제거한다.
//    - 서비스는 백그라운드 재생을 시작할 때만 구동되는데 haru 는 그 경로를 타지
//      않으므로 제거해도 포그라운드 재생/녹음은 정상 동작한다.
//
// manifest merge 에서 tools:node="remove" 가 라이브러리 주입을 덮어쓴다.
const { withAndroidManifest } = require('expo/config-plugins');

const REMOVE_PERMISSIONS = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

const REMOVE_SERVICES = ['expo.modules.audio.service.AudioControlsService'];

module.exports = function withRemoveMediaPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // tools 네임스페이스 보장 (tools:node 사용을 위해)
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    // --- 권한 제거 ---
    const existing = manifest['uses-permission'] || [];
    const filtered = existing.filter(
      (p) => !REMOVE_PERMISSIONS.includes(p?.$?.['android:name']),
    );
    for (const name of REMOVE_PERMISSIONS) {
      filtered.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    manifest['uses-permission'] = filtered;

    // --- 서비스 제거 ---
    const application = (manifest.application && manifest.application[0]) || null;
    if (application) {
      const services = application.service || [];
      const keptServices = services.filter(
        (s) => !REMOVE_SERVICES.includes(s?.$?.['android:name']),
      );
      for (const name of REMOVE_SERVICES) {
        keptServices.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
      application.service = keptServices;
    }

    return cfg;
  });
};
