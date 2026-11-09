import { useCallback, useEffect, useRef } from 'react';
import { Image } from 'react-native';
import useSWR, { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { matchesKey, likesKey, likesFetcher } from '@/lib/swr';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import type { DiscoverCandidate, SwipeResponse } from '@/types';

// 받은 좋아요 탭의 카드 목록 — 나를 like 한 사람. 넘기기는 없고, 카드는 대화 신청으로
// 매치되거나 상대가 사라질 때만 빠진다. 유료화 ON 이면 서버가 공개한 사람을 본 순서대로
// 주고 맨 끝에 잠긴 카드 1장을 붙인다.
//
// 목록은 SWR 캐시에 둔다. 부팅 프리로드가 채워둔 캐시를 즉시 그리고, focus refetch 는
// 그 뒤에서 조용히 갱신한다(스피너 없음).
export function useReceivedLikes() {
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const quota = useDiscoverQuota();
  const { data, mutate, isLoading, error } = useSWR<DiscoverCandidate[]>(
    userId ? likesKey(userId) : null,
    likesFetcher,
  );
  const candidates = data ?? [];

  // 처음 화면에 들어올 맨 끝 카드 근처 사진을 미리 받는다.
  const prefetchedPhotosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of candidates.slice(-3)) {
      const url = c.photos?.[0];
      if (!url || prefetchedPhotosRef.current.has(url)) continue;
      prefetchedPhotosRef.current.add(url);
      Image.prefetch(url).catch(() => {
        prefetchedPhotosRef.current.delete(url);
      });
    }
  }, [candidates]);

  const loadCandidates = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const { syncQuota } = quota;

  // 대화 신청. 받은 좋아요는 상대가 이미 나를 like 했으므로 거의 항상 즉시 매치 →
  // 카드가 목록에서 빠진다. 실패는 호출처로 던진다.
  const request = useCallback(
    async (likerId: string): Promise<SwipeResponse> => {
      const res = await discoverService.swipe({ swiped_id: likerId, direction: 'like', source: 'likes' });
      if (res.refunded_stars) syncQuota();
      if (res.match && userId) {
        globalMutate(matchesKey(userId));
        useCatStore.getState().celebrate();
      }
      mutate();
      return res;
    },
    [userId, globalMutate, mutate, syncQuota],
  );

  // 잠긴 카드 공개 — 별사탕 2개, 또는 free 면 무료 카드. 목록을 다시 불러 실제 카드로
  // 바꾼다. 상대가 그사이 사라졌으면 false (차감 없음). 실패는 호출처로.
  const reveal = useCallback(
    async (likerId: string, free = false) => {
      const { revealed } = await discoverService.revealLike(likerId, free);
      await Promise.all([mutate(), syncQuota()]);
      return revealed;
    },
    [mutate, syncQuota],
  );

  // 신고 직후 목록에서 뺀다 (서버가 차단해 다음 조회부터도 빠진다).
  const removeCandidate = useCallback(
    (id: string) => mutate((prev) => prev?.filter((c) => c.id !== id), { revalidate: false }),
    [mutate],
  );

  return {
    candidates,
    // 캐시가 이미 있으면 로딩 스피너를 띄우지 않는다(첫 로드에만 true).
    loading: isLoading,
    error: error ? (error as Error).message : null,
    loadCandidates,
    syncQuota,
    request,
    reveal,
    removeCandidate,
    starsTotal: quota.starsTotal,
    nextFreeRevealAt: quota.nextFreeRevealAt,
  };
}
