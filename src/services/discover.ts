import { Image } from 'react-native';
import { api } from './api';
import { photoAccessStore } from '@/stores/photoAccess';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import type {
  DiscoverCandidate,
  SwipeRequest,
  SwipeResponse,
  DiscoverQuota,
  PlaylistsResponse,
  PlaylistCards,
} from '@/types';

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

// ── 별사탕 유료화 (BE mig 059) ──────────────────────────────────────

// 오늘의 탐색 플레이리스트 3칸 (BE mig 063). tz = 사용자 로컬 자정 경계.
export async function getPlaylists(): Promise<PlaylistsResponse> {
  const tz = new Date().getTimezoneOffset();
  return api.get<PlaylistsResponse>(`/api/discover/playlists?tz_offset_minutes=${tz}`);
}

// 선택 화면이 열기 연출 동안 받아 둔 카드 — 카드 화면이 첫 렌더에 한 번 꺼내 쓴다
// (연출이 끝난 뒤 다시 받느라 스피너가 뜨지 않게).
let preloaded: { idx: number; cards: DiscoverCandidate[] } | null = null;
export function preloadPlaylistCards(idx: number, cards: DiscoverCandidate[]) {
  preloaded = { idx, cards };
  // 첫 카드와 좌우 이웃(순환) 사진도 미리 받는다. 남은 연출 시간 안에 끝나지 않아도
  // 기다리지 않는다 — 느린 망에서 화면 이동을 붙잡지 않게.
  for (const c of [cards[0], cards[1], cards[cards.length - 1]]) {
    const url = c?.photos?.[0];
    if (url) Image.prefetch(url).catch(() => {});
  }
}
export function takePreloadedPlaylistCards(idx: number): DiscoverCandidate[] | null {
  const hit = preloaded?.idx === idx ? preloaded.cards : null;
  preloaded = null;
  return hit;
}

// 오늘 연 플레이리스트의 카드. 오늘 열지 않았거나 자정이 지났으면 404.
export async function getPlaylistCards(idx: number): Promise<PlaylistCards> {
  const tz = new Date().getTimezoneOffset();
  const res = await api.get<PlaylistCards>(`/api/discover/playlists/${idx}?tz_offset_minutes=${tz}`);
  ingest(res.cards);
  return res;
}

// 플레이리스트 열기. 유료 칸은 사용자가 확인한 곡 수(expectedCount)를 보낸다.
// 402 = 별사탕 부족, 409 cards_changed = 곡 수가 줄어 차감 없이 거절,
// 409 playlist_changed = 다른 기기에서 첫 칸을 열어 가격이 바뀜.
export async function openPlaylist(idx: number, expectedCount?: number): Promise<PlaylistCards> {
  const tz = new Date().getTimezoneOffset();
  const res = await api.post<PlaylistCards>(
    `/api/discover/playlists/${idx}/open?tz_offset_minutes=${tz}`,
    expectedCount ? { expected_count: expectedCount } : {},
  );
  ingest(res.cards);
  return res;
}

// 잠긴 받은 좋아요 카드 공개 — 별사탕 2개 (모자라면 402 insufficient_stars), 또는
// free=true 면 무료 카드 (화면에 띄우는 순간 부른다, 없으면 409 free_unavailable).
// 상대가 그사이 탈퇴·정지·차단됐으면 차감 없이 revealed=false.
export async function revealLike(likerId: string, free = false): Promise<{ revealed: boolean }> {
  return api.post('/api/discover/likes-received/reveal', { liker_id: likerId, free });
}

// 플레이리스트에서 처음 화면에 나온 카드. 자정에 본 카드만 pass 로 기록된다.
export async function markPlaylistSeen(idx: number, candidateIds: string[]): Promise<void> {
  const tz = new Date().getTimezoneOffset();
  await api.post(`/api/discover/playlists/${idx}/seen?tz_offset_minutes=${tz}`, { candidate_ids: candidateIds });
}
