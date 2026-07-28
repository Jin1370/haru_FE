import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { swipedSession } from '@/stores/swipedSession';
import { quotaKey, quotaFetcher } from '@/lib/swr';
import { DAILY_LIKE_LIMIT } from '@/utils/discoverDaily';
import type { DiscoverQuota } from '@/types';

// 디스커버 ↔ 받은 좋아요 두 탭이 공유하는 일일 좋아요 예산 + "넘긴 사람 다시 보기".
//
// 예전엔 두 훅(useDiscover / useReceivedLikes)이 quota state·syncQuota·pass-reset
// 을 각자 복사해 갖고 있었다. 그래서 (a) 탭마다 GET /quota 가 따로 나가고
// (b) 한 탭에서 소모한 예산이 다른 탭에 안 보여 "stale 카운트로 스와이프 →
// 조용히 429" 를 focus 마다 재동기화로 때워야 했다. SWR 캐시 한 벌로 올려
// 두 탭이 같은 값을 보고, 요청은 dedupe 되며, 부팅 프리로드도 여기 붙는다.
export function useDiscoverQuota() {
  const userId = useAuthStore((s) => s.userId);
  const { data, mutate } = useSWR<DiscoverQuota>(
    userId ? quotaKey(userId) : null,
    quotaFetcher,
  );

  // 계정 전환 시 옛 계정의 세션 스와이프 집합을 비운다(같은 owner 면 no-op).
  useEffect(() => {
    if (userId) swipedSession.ensureOwner(userId);
  }, [userId]);

  const dailyCount = data?.count ?? 0;
  const dailyLimit = data?.limit ?? DAILY_LIKE_LIMIT;
  const dailyLimitReached = dailyCount >= dailyLimit;

  // 로컬 낙관 갱신 — 서버 재검증 없이 캐시만 패치(양 탭 동시 반영).
  // quota 가 아직 없으면 패치는 no-op — 곧 도착할 응답이 진실원이다.
  const patchQuota = useCallback(
    (patch: (q: DiscoverQuota) => DiscoverQuota) => {
      mutate((prev) => (prev ? patch(prev) : prev), { revalidate: false });
    },
    [mutate],
  );

  const bumpCount = useCallback(
    (delta: number) =>
      patchQuota((q) => ({
        ...q,
        count: Math.max(0, Math.min(q.limit, q.count + delta)),
      })),
    [patchQuota],
  );

  // 429(서버 하드 캡) 도달 — 이후 like 제스처가 게이트에 걸리도록 카운트를 한도로.
  const markLimitReached = useCallback(
    () => patchQuota((q) => ({ ...q, count: q.limit })),
    [patchQuota],
  );

  // 방금 pass 행이 생겼으므로 "다시 보기" 노출 조건을 즉시 충족시킨다.
  const markHasPasses = useCallback(
    () => patchQuota((q) => ({ ...q, has_passes: true })),
    [patchQuota],
  );

  const syncQuota = useCallback(async () => {
    await mutate();
  }, [mutate]);

  // "넘긴 사람 다시 보기" — viewer 의 pass 행을 BE 에서 일괄 삭제한 뒤 세션 권위
  // 집합(swipedSession)을 비우고 덱/quota 를 재동기화한다. clear() 를 빠뜨리면 BE 가
  // pass 행을 지워도 FE 필터가 계속 걸러 재노출되지 않는다 — 순서 고정.
  const [resetting, setResetting] = useState(false);
  const resettingRef = useRef(false);
  const resetPasses = useCallback(
    async (reload: () => Promise<void>): Promise<number | null> => {
      if (resettingRef.current) return null;
      resettingRef.current = true;
      setResetting(true);
      try {
        const { reset_count } = await discoverService.resetPasses();
        swipedSession.clear();
        await reload();
        await syncQuota();
        return reset_count;
      } catch (e) {
        // account_frozen(403) 은 글로벌 핸들러가 모달 처리, pass_reset_disabled 는
        // 버튼이 숨겨져 정상 경로에선 도달 안 함 — 둘 다 조용히 무시.
        if (e instanceof ApiRequestError && e.status === 403) return null;
        throw e;
      } finally {
        resettingRef.current = false;
        setResetting(false);
      }
    },
    [syncQuota],
  );

  return {
    dailyCount,
    dailyLimit,
    dailyLimitReached,
    // quota 동기화 전에는 버튼 미노출(안전) — 기본 false.
    passResetEnabled: data?.pass_reset_enabled === true,
    hasPasses: data?.has_passes === true,
    syncQuota,
    bumpCount,
    markLimitReached,
    markHasPasses,
    resetting,
    resetPasses,
  };
}
