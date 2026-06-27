import { useCallback, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { photoAccessStore } from '@/stores/photoAccess';
import { swipedSession } from '@/stores/swipedSession';
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
//   5. 세션 스와이프 집합(swipedSession)을 디스커버 탭과 공유 — 한 탭에서 스와이프하면
//      다른 탭이 즉시 같은 카드를 덱에서 제거(refetch 불필요)
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
  // "넘긴 사람 다시 보기" env 게이트(quota 응답의 pass_reset_enabled) + 진행 상태.
  // 디스커버와 동일 — 기본 false 라 quota 동기화 전엔 버튼 미노출(안전).
  const [passResetEnabled, setPassResetEnabled] = useState(false);
  // 넘긴(pass) 사람이 실제로 있는지(quota.has_passes). 버튼은 passResetEnabled &&
  // hasPasses 일 때만 — 넘긴 적 없는 사용자에게 버튼이 뜨는 어색함을 제거.
  const [hasPasses, setHasPasses] = useState(false);
  const [resetting, setResetting] = useState(false);

  // quota + pass-reset 플래그 동기화. 디스커버 훅의 syncQuota 와 동일 — 받은 좋아요도
  // pass 행을 지우면 swipes 행 수가 줄어 quota count 가 회복되므로 reset 후 재호출.
  const syncQuota = useCallback(async () => {
    try {
      const q = await discoverService.getDiscoverQuota();
      setDailyCount(q.count);
      setPassResetEnabled(q.pass_reset_enabled === true);
      setHasPasses(q.has_passes === true);
    } catch {
      setDailyCount(0);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    // 계정 전환 시 옛 계정의 스와이프 집합을 비운다(같은 owner 면 no-op).
    swipedSession.ensureOwner(userId);
    let cancelled = false;
    setDailyCountReady(false);
    syncQuota().finally(() => {
      if (!cancelled) setDailyCountReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, syncQuota]);

  // 크로스탭 동기화: 디스커버 탭에서 스와이프(또는 신고)하면 swipedSession 에 추가되며
  // 알림이 온다 → 받은 좋아요 덱에서도 같은 카드를 즉시 제거(refetch 불필요).
  useEffect(
    () =>
      swipedSession.subscribe(() => {
        setCandidates((prev) => prev.filter((c) => !swipedSession.has(c.id)));
      }),
    [],
  );

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
      // 세션 중 스와이프된 카드(다른 탭에서 스와이프한 경우 포함)는 BE 가 아직 커밋
      // 전이라 다시 반환할 수 있으므로 swipedSession 으로 필터 — 디스커버와 동일 권위.
      setCandidates(data.filter((c) => !swipedSession.has(c.id)));
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
        // 방금 pass 행이 생겼으면 "다시 보기" 버튼 노출 조건을 즉시 충족.
        if (direction === 'pass') setHasPasses(true);
        // 공유 세션 집합에 등록 → 디스커버 탭이 같은 카드를 즉시 덱에서 제거(구독 알림).
        // setCandidates 필터로 본 탭에서도 제거된다.
        swipedSession.add(swipedId);
        setCandidates((prev) => prev.filter((c) => c.id !== swipedId));
        setDailyCount((c) => Math.min(MAX_PER_DAY, c + 1));
        // 받은 좋아요 화면의 like 응답은 거의 항상 match → 매치 리스트 갱신.
        if (res.match && userId) {
          globalMutate(matchesKey(userId));
        }
        return res;
      } catch (e: any) {
        // 서버 하드 캡(429) 도달 — 다른 탭에서 한도를 채운 뒤 stale 카운트로 들어와
        // 스와이프한 경우의 방어선. 카운트를 한도로 끌어올려 다음 렌더에서 한도 화면을
        // 노출(카드는 그대로 — 서버가 어차피 못 받으므로). 디스커버 handleSwipe 와 동일 사상.
        const status = e instanceof ApiRequestError ? e.status : 0;
        if (status === 429) {
          setDailyCount(MAX_PER_DAY);
        }
        setError(e.message);
        return null;
      }
    },
    [userId, globalMutate],
  );

  // 신고 등 비-스와이프 사유로 현재 카드를 덱에서 즉시 제거. swipedSession 에 등록해
  // 디스커버 탭도 즉시 제거 + 본 탭 refetch 시 재노출 방지.
  const removeCandidate = useCallback((id: string) => {
    swipedSession.add(id);
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // "넘긴 사람 다시 보기" — 디스커버와 동일 엔드포인트(DELETE /api/discover/passes)로
  // viewer 의 pass 행을 일괄 삭제. 받은 좋아요에서 넘겼던(=pass 한) liker 도 BE 의
  // "내가 스와이프한 사람" 제외에서 풀려 다시 노출된다. 공유 swipedSession 을 비워야
  // FE 권위 필터에도 안 걸린다. clear → loadCandidates → syncQuota 순서.
  const handleResetPasses = useCallback(async (): Promise<number | null> => {
    if (resetting) return null;
    setResetting(true);
    try {
      const { reset_count } = await discoverService.resetPasses();
      swipedSession.clear();
      await loadCandidates();
      await syncQuota();
      return reset_count;
    } catch (e: any) {
      const status = e instanceof ApiRequestError ? e.status : 0;
      if (status !== 403) setError(e.message);
      return null;
    } finally {
      setResetting(false);
    }
  }, [resetting, loadCandidates, syncQuota]);

  return {
    candidates,
    loading,
    error,
    loadCandidates,
    syncQuota,
    handleSwipe,
    removeCandidate,
    dailyCount,
    dailyCountReady,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  };
}
