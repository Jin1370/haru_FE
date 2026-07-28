import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { SWRConfig, preload } from 'swr';
import * as matchService from '@/services/matches';
import * as discoverService from '@/services/discover';

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
// 응답이 도착한 뒤에 useDiscover 가 이 함수를 부른다. 세션당 계정별 1회.
let preloadedFor: string | null = null;
export function preloadTabData(userId: string) {
  if (preloadedFor === userId) return;
  preloadedFor = userId;
  preload(matchesKey(userId), matchesFetcher);
  preload(likesKey(userId), likesFetcher);
}

export function SWRConfigProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 3000,
        // SWR's default focus detection uses window events that don't fire in
        // RN. Hook AppState 'active' transitions instead so revalidateOnFocus
        // works on iOS/Android.
        initFocus(callback) {
          const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') callback();
          });
          return () => sub.remove();
        },
        // No NetInfo dependency — leave reconnect signaling unwired.
        initReconnect() {
          return () => {};
        },
        // 401 logout is owned by api.ts → registerOnSessionExpired in
        // _layout.tsx. Don't duplicate it here.
      }}
    >
      {children}
    </SWRConfig>
  );
}
