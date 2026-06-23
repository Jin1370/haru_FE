import { useCallback, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { photoAccessStore } from '@/stores/photoAccess';
import { useAuthStore } from '@/stores/authStore';
import { matchesKey } from '@/lib/swr';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import { MAX_PER_DAY } from '@/utils/discoverDaily';
import type { DiscoverCandidate, SwipeResponse } from '@/types';

// 받은 좋아요 화면의 카드/스와이프 상태.
// 디스커버와의 차이점:
//   1. 카드 풀 = "나를 like 한 사람들" — 별도 엔드포인트 (/api/discover/likes-received)
//   2. 조회는 BATCH 없이 한 번에 fetch (BE 가 최신 LIKES_RECEIVED_MAX=300 개로 상한,
//      받은 좋아요 풀은 보통 그보다 작아 FE 페이지네이션 불필요)
//   3. 스와이프는 동일 엔드포인트 (POST /api/discover/swipe) 공유 → 일일 50장 한도 합산
//   4. 'like' 응답 시 즉시 match — 상대가 이미 like 한 상태이므로 reciprocal 항상 성립
function ingestCandidates(candidates: DiscoverCandidate[]) {
  const entries = candidates
    .filter((c) => Boolean(c.id))
    .map((c) => ({ userId: c.id, access: c.photo_access ?? DEFAULT_PHOTO_ACCESS }));
  photoAccessStore.ingest(entries);
}

export function useReceivedLikes() {
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 디스커버 quota 와 공유. 받은 좋아요 카드 빈 화면 vs 한도 소진 빈 화면을 구분하기
  // 위해 mount 시 같이 가져온다.
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyCountReady, setDailyCountReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setDailyCountReady(false);
    discoverService
      .getDiscoverQuota()
      .then((q) => {
        if (cancelled) return;
        setDailyCount(q.count);
        setDailyCountReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDailyCount(0);
        setDailyCountReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dailyLimitReached = dailyCount >= MAX_PER_DAY;

  // 호출 시점은 화면이 결정 — 받은 좋아요 화면은 useFocusEffect 로 탭 focus 마다 호출.
  // 받은 좋아요는 비동기 알림으로 도착하기 때문에 stale 가능성 높음 — focus refetch +
  // pull-to-refresh 조합으로 사용자 인지 가능한 한도 내에서 fresh 유지.
  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverService.getReceivedLikes();
      ingestCandidates(data);
      setCandidates(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSwipe = useCallback(
    async (
      swipedId: string,
      direction: 'like' | 'pass',
    ): Promise<SwipeResponse | null> => {
      try {
        const res = await discoverService.swipe({ swiped_id: swipedId, direction });
        setCandidates((prev) => prev.filter((c) => c.id !== swipedId));
        setDailyCount((c) => Math.min(MAX_PER_DAY, c + 1));
        // 받은 좋아요 화면의 like 응답은 거의 항상 match → 매치 리스트 갱신.
        if (res.match && userId) {
          globalMutate(matchesKey(userId));
        }
        return res;
      } catch (e: any) {
        setError(e.message);
        return null;
      }
    },
    [userId, globalMutate],
  );

  // 신고 등 비-스와이프 사유로 현재 카드를 덱에서 즉시 제거. 받은 좋아요는
  // focus refetch 라 BE auto-block 전파 후 자연히 제외되지만, 제거 즉시 UI 에서
  // 사라지게 한다.
  const removeCandidate = useCallback((id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    candidates,
    loading,
    error,
    loadCandidates,
    handleSwipe,
    removeCandidate,
    dailyCount,
    dailyCountReady,
    dailyLimitReached,
  };
}
