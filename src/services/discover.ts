import { api } from './api';
import { photoAccessStore } from '@/stores/photoAccess';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import type { DiscoverCandidate, SwipeRequest, SwipeResponse, DiscoverQuota } from '@/types';

// 카드 응답이 오면 photo_access 레지스트리를 채운다 — 디스커버/받은 좋아요 두
// 훅이 각자 복사해 갖고 있던 ingest 를 응답 지점 한 곳으로 모았다. undefined →
// DEFAULT(잠금).
function ingest(candidates: DiscoverCandidate[]): DiscoverCandidate[] {
  photoAccessStore.ingest(
    candidates
      .filter((c) => Boolean(c.id))
      .map((c) => ({ userId: c.id, access: c.photo_access ?? DEFAULT_PHOTO_ACCESS })),
  );
  return candidates;
}

export async function getDiscoverCandidates(limit = 10): Promise<DiscoverCandidate[]> {
  // tz: 유료화 ON 의 카드 한도(로컬 자정 리셋) 계산용.
  const tz = new Date().getTimezoneOffset();
  return ingest(
    await api.get<DiscoverCandidate[]>(`/api/discover?limit=${limit}&tz_offset_minutes=${tz}`),
  );
}

// 받은 좋아요 — 나를 like 한 사용자 중 내가 아직 응답 안 했고 차단 양방향 아닌 후보.
// 응답 shape 은 디스커버 카드와 동일 → SwipeCard 컴포넌트 재사용.
// 정렬은 like 한 시각 내림차순 (BE).
export async function getReceivedLikes(): Promise<DiscoverCandidate[]> {
  return ingest(await api.get<DiscoverCandidate[]>('/api/discover/likes-received'));
}

export async function swipe(data: SwipeRequest): Promise<SwipeResponse> {
  // tz_offset_minutes 는 BE 서버측 일일 한도 하드 캡이 사용자 로컬 자정 경계를
  // quota 엔드포인트와 동일하게 계산하도록 전달 (getDiscoverQuota 와 동일 의미).
  const tz = new Date().getTimezoneOffset();
  return api.post<SwipeResponse>(`/api/discover/swipe?tz_offset_minutes=${tz}`, data);
}

// BE 가 sources of truth 로 들고 있는 "오늘 스와이프 수" 를 가져온다 (기기 간 동기화).
// tz_offset_minutes 는 Date#getTimezoneOffset() 그대로 — 사용자 로컬 자정 경계를 BE 가 계산한다.
export async function getDiscoverQuota(): Promise<DiscoverQuota> {
  const tz = new Date().getTimezoneOffset();
  return api.get<DiscoverQuota>(`/api/discover/quota?tz_offset_minutes=${tz}`);
}

// 넘긴(pass) 스와이프 행을 일괄 삭제해 지나친 프로필을 디스커버에 다시 노출한다.
// 성공 시 삭제된 pass 행 수(reset_count)를 반환 — "N명 다시 보기" 토스트에 사용.
// env 비활성 시 BE 가 403 { code:'pass_reset_disabled' } 응답(버튼이 숨겨져 정상
// 경로에선 도달 안 함), account_frozen 은 글로벌 ApiRequestError 핸들러가 모달 처리.
export async function resetPasses(): Promise<{ reset_count: number }> {
  return api.delete<{ reset_count: number }>('/api/discover/passes');
}

// ── 별사탕 유료화 (BE mig 059) ──────────────────────────────────────

// 탐색 카드 10장 추가 (별사탕 4개). 402 = 별사탕 부족.
export async function cardReset(): Promise<{ stars_total: number }> {
  return api.post<{ stars_total: number }>('/api/discover/card-reset', {});
}

// 받은 좋아요 1명 공개. 무료 공개가 안 되면 402 reveal_requires_stars —
// 사용자가 확인하면 payWithStars=true 로 다시 부른다 (별사탕 2개).
export async function revealLike(
  likerId: string,
  payWithStars = false,
): Promise<{ revealed: boolean; next_free_reveal_at: string | null }> {
  return api.post('/api/discover/likes-received/reveal', {
    liker_id: likerId,
    pay_with_stars: payWithStars,
  });
}
