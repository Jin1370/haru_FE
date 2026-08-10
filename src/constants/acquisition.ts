// 유입 경로 선택지 (mig 051). BE `src/schemas/profile.ts` 의 ACQUISITION_SOURCES 와
// 값이 정확히 일치해야 한다 (zod enum 이 화이트리스트).
//
// SNS 플랫폼명은 고유명사라 3 로케일 표기가 동일 — i18n 키를 만들지 않고 여기 라벨을
// 그대로 렌더한다. 상위 4개 선택지만 i18n (`acquisition.options.*`).
// 'other' 는 '직접 입력' 선택지다 — 고르면 자유 텍스트 입력칸이 열리고, BE 가
// `other:<입력값>` 으로 저장한다.
export const ACQUISITION_OPTIONS = ['sns', 'app_store', 'web_search', 'friend', 'other'] as const;

// icon = FontAwesome6 브랜드 글리프명. 6개 모두 FontAwesome6Free 에 있어 한 세트로
// 통일된다 (Ionicons 에는 Threads/X 가 없다).
export const SNS_PLATFORMS = [
  { value: 'sns:instagram', label: 'Instagram', icon: 'instagram' },
  { value: 'sns:x', label: 'X', icon: 'x-twitter' },
  { value: 'sns:youtube', label: 'YouTube', icon: 'youtube' },
  { value: 'sns:facebook', label: 'Facebook', icon: 'facebook' },
  { value: 'sns:threads', label: 'Threads', icon: 'threads' },
  { value: 'sns:tiktok', label: 'TikTok', icon: 'tiktok' },
] as const;
