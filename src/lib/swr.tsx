import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { SWRConfig, preload, mutate } from 'swr';
import * as matchService from '@/services/matches';
import * as discoverService from '@/services/discover';
import type { DiscoverCandidate } from '@/types';

// 키와 fetcher 를 한 곳에 둔다 — 부팅 프리로드(main/_layout)와 화면 훅이 같은
// 함수를 쓰지 않으면 인자가 어긋나 캐시가 두 벌로 갈라진다(프리로드 무효).
export const MATCHES_PAGE_SIZE = 20;

export const matchesKey = (userId: string) => ['matches', userId] as const;
export const likesKey = (userId: string) => ['likes-received', userId] as const;
export const quotaKey = (userId: string) => ['discover-quota', userId] as const;

export const matchesFetcher = () => matchService.getMatches(MATCHES_PAGE_SIZE);
export const likesFetcher = () => discoverService.getReceivedLikes();
export const quotaFetcher = () => discoverService.getDiscoverQuota();

// 다른 탭(채팅 목록 / 받은 좋아요) 데이터 미리 채우기. 탭 네비게이터는 화면을
// 첫 focus 때 마운트하므로, 그냥 두면 탭을 누르는 순간에야 첫 요청이 나가 탭마다
// 스피너를 한 번씩 본다.
//
// 호출 시점이 중요하다: 사용자가 가장 먼저 보는 화면은 디스커버이므로, 앱 부팅과
// 동시에 쏘면 디스커버 첫 카드와 대역폭을 다툰다(특히 likes-received 는 BE 에서
// liker 최대 300 명 + 프로필/사진 조인이라 무겁다). 그래서 디스커버의 첫 후보
// 응답이 도착한 뒤에 탐색 탭(플레이리스트 화면)이 이 함수를 부른다. 세션당 계정별 1회.
let preloadedFor: string | null = null;
let likesPreload: Promise<DiscoverCandidate[]> | null = null;
export function preloadTabData(userId: string) {
  if (preloadedFor === userId) return;
  preloadedFor = userId;
  preload(matchesKey(userId), matchesFetcher);
  likesPreload = preload(likesKey(userId), likesFetcher) ?? null;
}

// 받은 인사 탭이 처음 들어올 때 미리 받아 둔 응답을 꺼낸다 (1회). 화면의 다시 받기(mutate())는
// SWR 의 프리로드를 버리는데, 프리로드 요청이 무료 카드를 열었으면 "방금 열림" 표시가 그 응답에만
// 있어 버리면 New! 와 시작 위치를 잃는다.
export function takeLikesPreload(): Promise<DiscoverCandidate[]> | null {
  const p = likesPreload;
  likesPreload = null;
  return p;
}

// 앱이 다시 앞으로 나오면 별사탕 잔액과 채팅 목록을 다시 받는다 (다른 기기에서 바뀐 값).
// SWR 의 revalidateOnFocus 는 RN 에서 동작하지 않는다 — 기본 감지는 RN 에 없는 window 이벤트를
// 쓰고, SWRConfig 의 initFocus 는 custom provider 를 줄 때만 적용된다 (custom provider 는
// `preload` 가 쓰는 기본 캐시와 갈라져 프리로드가 무효). 그래서 공개 mutate 로 키를 직접 지정한다.
// 받은 인사 목록·채팅방은 일부러 앱 복귀 때 다시 받지 않는다 (각 훅의 revalidateOnFocus:false 주석).
// mutate 는 화면에 떠 있는 키만 다시 받고, 안 떠 있는 키는 그대로 둔다.
const REFETCH_ON_APP_ACTIVE = new Set(['discover-quota', 'matches']);
function useAppFocusRevalidate() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void mutate((key) => Array.isArray(key) && REFETCH_ON_APP_ACTIVE.has(key[0]));
    });
    return () => sub.remove();
  }, []);
}

export function SWRConfigProvider({ children }: { children: ReactNode }) {
  useAppFocusRevalidate();
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 3000,
        // 401 logout is owned by api.ts → registerOnSessionExpired in
        // _layout.tsx. Don't duplicate it here.
      }}
    >
      {children}
    </SWRConfig>
  );
}
