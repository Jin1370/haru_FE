// Google Play "사진 및 동영상 권한" 정책 대응.
//
// expo-media-library / expo-image-picker 플러그인이 매니페스트에 자동 주입하는
// READ_MEDIA_IMAGES / READ_MEDIA_VIDEO 를 강제 제거한다.
//
// 이 앱의 실제 사용처:
//   - 프로필 사진 선택  → 안드로이드 13+ 시스템 사진 선택 도구가 처리 (권한 불필요)
//   - 워터마크 사진 저장 → writeOnly 저장 (읽기 권한 불필요)
// 따라서 두 read-media 권한은 surplus 이며 정책상 제거 대상.
//
// manifest merge 에서 tools:node="remove" 가 라이브러리 주입을 덮어쓴다.
const { withAndroidManifest } = require('expo/config-plugins');

const REMOVE = ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO'];

module.exports = function withRemoveMediaPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // tools 네임스페이스 보장 (tools:node 사용을 위해)
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const existing = manifest['uses-permission'] || [];

    // 이미 들어온 동일 권한 항목 제거
    const filtered = existing.filter((p) => !REMOVE.includes(p?.$?.['android:name']));

    // 명시적 remove 노드 추가 → 라이브러리 주입을 manifest merge 단계에서 제거
    for (const name of REMOVE) {
      filtered.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }

    manifest['uses-permission'] = filtered;
    return cfg;
  });
};
