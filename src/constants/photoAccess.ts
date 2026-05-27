import type { PhotoAccess } from '@/types/photoAccess';

// Round-trip thresholds that gate photo reveal stages. These must stay in sync
// with BE `src/constants/chat.ts` and the `028_profile_photos_conversion.sql`
// (formerly `005_match_photo_access.sql`) migration constants. Single source of
// truth for FE.
//
// photo-watercolor-pipeline sprint (사용자 결정 #1): 5회 milestone 폐지. 옛
// "5회 = 메인 사진 공개 / 10회 = 전체 공개" 두 단계 → 새 "10회 = 메인+전체
// 동시 공개" 단일 단계. 디스커버 응답은 변환본(수채화 톤 스타일라이즈) 1장만
// 노출되므로 매치 unlock 단계는 원본 노출 전용 — 5회 reward 가 사라져도 차별점
// 1(보이스 한마디 청취) 의 진입 후크는 그대로 유지된다.
export const UNLOCK_MAIN_PHOTO_AT = 10;
export const UNLOCK_ALL_PHOTOS_AT = 10;

// Client-side bridge: derive PhotoAccess from a chat round-trip count. Used by
// the Chat screen while BE does not yet ship `photo_access`. Remove this helper
// once BE is the single source of truth (see [matchId].tsx bridge block).
//
// photo-watercolor-pipeline sprint (D4 main_photo_unlocked 보존 결정): 두 boolean
// 은 의미상 항상 동일 값으로 자리잡지만 wire 호환을 위해 필드는 유지. FE 의
// ProfilePhoto/ProfilePhotoGallery 분기는 무변경.
export function fromRoundTrips(roundTrips: number): PhotoAccess {
  return {
    main_photo_unlocked: roundTrips >= UNLOCK_ALL_PHOTOS_AT,
    all_photos_unlocked: roundTrips >= UNLOCK_ALL_PHOTOS_AT,
  };
}
