import { useCallback, useEffect, useReducer, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { swipedSession } from '@/stores/swipedSession';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { matchesKey, likesKey, likesFetcher } from '@/lib/swr';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import type { DiscoverCandidate, SwipeResponse } from '@/types';

// 받은 좋아요 화면의 카드/스와이프 상태.
// 디스커버와의 차이점:
//   1. 카드 풀 = "나를 like 한 사람들" — 별도 엔드포인트 (/api/discover/likes-received)
//   2. 조회는 BATCH 없이 한 번에 fetch (BE 가 최신 LIKES_RECEIVED_MAX=300 개로 상한,
//      받은 좋아요 풀은 보통 그보다 작아 FE 페이지네이션 불필요)
//   3. 스와이프는 동일 엔드포인트 (POST /api/discover/swipe) 공유. 단 받은 좋아요의
//      like 는 항상 reciprocal(=매치 완성) 이라 하루 좋아요 예산을 소모하지 않는다(면제).
//   4. 'like' 응답 시 즉시 match — 상대가 이미 like 한 상태이므로 reciprocal 항상 성립
//   5. 세션 스와이프 집합(swipedSession) + 일일 예산(useDiscoverQuota)을 디스커버 탭과
//      공유 — 한 탭에서 스와이프하면 다른 탭이 즉시 같은 카드를 덱에서 제거(refetch 불필요)
//
// 카드 목록은 SWR 캐시에 둔다. 탭을 처음 열 때 부팅 프리로드(main/_layout)가 이미
// 채워둔 캐시를 즉시 그리고, focus refetch 는 그 뒤에서 조용히 갱신한다(스피너 없음).
export function useReceivedLikes() {
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const quota = useDiscoverQuota();
  const { data, mutate, isLoading, error } = useSWR<DiscoverCandidate[]>(
    userId ? likesKey(userId) : null,
    likesFetcher,
  );
  const likeLimitHitRef = useRef(false);

  // 세션 중 스와이프된 카드(다른 탭에서 스와이프한 경우 포함)는 BE 가 아직 커밋 전이라
  // 다시 반환될 수 있다 — 렌더 시점에 걷어낸다(캐시를 파괴적으로 고치지 않으므로
  // 재검증 응답이 늦게 도착해도 필터가 항상 유효). 집합 변화 시 재렌더만 시킨다.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => swipedSession.subscribe(rerender), []);
  const candidates = (data ?? []).filter((c) => !swipedSession.has(c.id));

  // 호출 시점은 화면이 결정 — 받은 좋아요 화면은 useFocusEffect 로 탭 focus 마다 호출.
  // 받은 좋아요는 비동기 알림으로 도착하기 때문에 stale 가능성 높음 — focus refetch +
  // pull-to-refresh 조합으로 사용자 인지 가능한 한도 내에서 fresh 유지.
  const loadCandidates = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const { markLimitReached, markHasPasses } = quota;
  const handleSwipe = useCallback(
    async (
      swipedId: string,
      direction: 'like' | 'pass',
    ): Promise<SwipeResponse | null> => {
      try {
        const res = await discoverService.swipe({ swiped_id: swipedId, direction });
        // 방금 pass 행이 생겼으면 "다시 보기" 버튼 노출 조건을 즉시 충족.
        if (direction === 'pass') markHasPasses();
        // 공유 세션 집합에 등록 → 디스커버 탭이 같은 카드를 즉시 덱에서 제거(구독 알림).
        // 본 탭은 렌더 필터가 같은 집합을 보므로 함께 사라진다.
        swipedSession.add(swipedId);
        // 받은 좋아요의 like 는 항상 reciprocal(=매치 완성) 이라 예산을 소모하지
        // 않는다(면제). 따라서 낙관적 +1 을 하지 않는다 — like 도 pass 도 카운트 불변.
        // (드문 엣지: 로드~스와이프 사이 상대가 unlike → BE 는 예산 count 하나 FE
        //  미반영 → 다음 syncQuota 가 정정. ±1급 허용.)
        // 받은 좋아요 화면의 like 응답은 거의 항상 match → 매치 리스트 갱신.
        if (res.match && userId) {
          globalMutate(matchesKey(userId));
          useCatStore.getState().celebrate();
        }
        return res;
      } catch (e: any) {
        // 서버 하드 캡(429) 도달 — 받은 좋아요 like 는 면제라 사실상 안 나지만,
        // 디스커버에서 예산을 소진한 뒤 stale 카운트로 넘어와 스와이프한 멀티기기
        // 케이스의 방어선. 화면을 잠그지 않고 예산 소진을 반영해 이후 like 제스처가
        // 게이트에 걸리게 하고, one-shot 신호로 모달을 띄운다.
        if (e instanceof ApiRequestError && e.status === 429) {
          markLimitReached();
          likeLimitHitRef.current = true;
        }
        return null;
      }
    },
    [userId, globalMutate, markLimitReached, markHasPasses],
  );

  // 화면 onSwipe 가 handleSwipe 직후 동기 호출해 429(예산 소진) 신호를 소비한다.
  const consumeLikeLimitHit = useCallback(() => {
    if (!likeLimitHitRef.current) return false;
    likeLimitHitRef.current = false;
    return true;
  }, []);

  // 신고 등 비-스와이프 사유로 현재 카드를 덱에서 즉시 제거. swipedSession 에 등록해
  // 디스커버 탭도 즉시 제거 + 본 탭 refetch 시 재노출 방지(렌더 필터가 걸러냄).
  const removeCandidate = useCallback((id: string) => {
    swipedSession.add(id);
  }, []);

  const { resetPasses } = quota;
  const handleResetPasses = useCallback(
    () => resetPasses(loadCandidates).catch(() => null),
    [resetPasses, loadCandidates],
  );

  return {
    candidates,
    // 캐시가 이미 있으면 로딩 스피너를 띄우지 않는다(첫 로드에만 true).
    loading: isLoading,
    error: error ? (error as Error).message : null,
    loadCandidates,
    syncQuota: quota.syncQuota,
    handleSwipe,
    consumeLikeLimitHit,
    removeCandidate,
    dailyCount: quota.dailyCount,
    dailyLimit: quota.dailyLimit,
    dailyLimitReached: quota.dailyLimitReached,
    passResetEnabled: quota.passResetEnabled,
    hasPasses: quota.hasPasses,
    resetting: quota.resetting,
    handleResetPasses,
  };
}
