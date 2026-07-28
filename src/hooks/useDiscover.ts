import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { swipedSession } from '@/stores/swipedSession';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { matchesKey, preloadTabData } from '@/lib/swr';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { BATCH_SIZE, PREFETCH_THRESHOLD } from '@/utils/discoverDaily';
import type { DiscoverCandidate, SwipeResponse } from '@/types';

export function useDiscover() {
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const quota = useDiscoverQuota();
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefetchingRef = useRef(false);
  // Block prefetch until the screen's initial loadCandidates() has finished.
  // Otherwise the prefetch trigger effect (queue.length=0 ≤ 3) fires on mount
  // before setLoading(true) is reflected, racing the initial fetch and
  // doubling the BE call.
  const initializedRef = useRef(false);
  const candidatesRef = useRef<DiscoverCandidate[]>([]);
  // 429(예산 소진) one-shot 신호. handleSwipe 가 set → 화면 onSwipe 가
  // consumeLikeLimitHit() 로 동기 소비해 showLikeLimit 모달을 띄운다.
  // ref 를 쓰는 이유: 429 직후 카운트가 한도로 올라가도 그건 다음 렌더라,
  // 같은 tick 의 onSwipe 클로저는 stale(false) 이다.
  const likeLimitHitRef = useRef(false);
  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  // 세션 동안 스와이프된 id 집합은 디스커버 ↔ 받은 좋아요 탭이 공유하는 모듈 레벨
  // swipedSession 으로 승격됐다. 한 탭에서 스와이프하면 다른 탭이 즉시 같은 카드를
  // 덱에서 제거하도록(refetch 불필요) + BE 커밋 타이밍과 무관하게 모든 fetch 에서
  // 필터. 상세는 stores/swipedSession.ts. rollback 시 delete 로 복원 카드 재노출 허용.

  // Warm the image cache for the next couple of cards so they paint instantly
  // when surfaced. The queue prefetch above only pulls candidate *data* (URLs);
  // RN's <Image> has no lookahead, so without this the next card's photo only
  // starts downloading once it mounts — showing the placeholder background for
  // a beat. Dedupe by URL; drop on failure so a later pass can retry.
  const prefetchedPhotosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of candidates.slice(0, 3)) {
      const url = c.photos?.[0];
      if (!url || prefetchedPhotosRef.current.has(url)) continue;
      prefetchedPhotosRef.current.add(url);
      Image.prefetch(url).catch(() => {
        prefetchedPhotosRef.current.delete(url);
      });
    }
  }, [candidates]);

  // 크로스탭 동기화: 받은 좋아요 탭에서 스와이프(또는 신고)하면 swipedSession 에
  // 추가되며 알림이 온다 → 디스커버 덱에서도 같은 카드를 즉시 제거(refetch 불필요).
  useEffect(
    () =>
      swipedSession.subscribe(() => {
        setCandidates((prev) => prev.filter((c) => !swipedSession.has(c.id)));
      }),
    [],
  );

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 카드 fetch 를 예산(room = limit - count)에 결속하지 않는다 — like 를 다 써도
      // pass(넘기기)는 무제한이라 카드가 계속 흘러야 한다. 항상 풀 BATCH_SIZE 요청.
      const data = await discoverService.getDiscoverCandidates(BATCH_SIZE);
      // Filter out anything swiped this session — guards against the BE
      // returning a just-swiped user whose POST hasn't committed yet.
      setCandidates(data.filter((c) => !swipedSession.has(c.id)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      const wasFirst = !initializedRef.current;
      initializedRef.current = true;
      setLoading(false);
      // 첫 후보 응답이 끝난 뒤에야 다른 탭 데이터를 미리 받는다 — 첫 화면인
      // 디스커버의 대역폭을 뺏지 않기 위해. (실패해도 한 번은 시도한다.)
      if (wasFirst) {
        const uid = useAuthStore.getState().userId;
        if (uid) preloadTabData(uid);
      }
    }
  }, []);

  // Background prefetch: append new candidates to the queue without flipping
  // the visible loading flag. Dedupes against both the current queue and the
  // session swiped-set — the latter absorbs the BE returning a just-swiped user
  // whose POST hasn't committed (deterministic top-N sort keeps surfacing them).
  const prefetchMore = useCallback(async () => {
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;
    try {
      // 예산과 무관하게 항상 채운다 — like 소진 후에도 pass 용 카드가 필요하다.
      const data = await discoverService.getDiscoverCandidates(BATCH_SIZE);
      setCandidates((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const fresh = data.filter(
          (c) => !seen.has(c.id) && !swipedSession.has(c.id),
        );
        return [...prev, ...fresh];
      });
    } catch {
      // Silent — prefetch failures should not interrupt the active card.
    } finally {
      prefetchingRef.current = false;
    }
  }, []);

  // Top up the queue when running low. 예산(dailyCount)에는 결속하지 않는다 —
  // like 소진 후에도 pass 카드가 계속 필요하므로 큐가 얕아지면 채운다.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (loading) return;
    if (prefetchingRef.current) return;
    if (candidates.length > PREFETCH_THRESHOLD) return;
    prefetchMore();
  }, [candidates.length, loading, prefetchMore]);

  const { bumpCount, markLimitReached, markHasPasses } = quota;
  const handleSwipe = useCallback(async (
    swipedId: string,
    direction: 'like' | 'pass',
  ): Promise<SwipeResponse | null> => {
    // Optimistic: drop the swiped card and bump the count immediately so the
    // next card surfaces the instant the current one flies off — without
    // blocking on the swipe POST round-trip (the dominant inter-card lag).
    // Capture the removed candidate + its position so we can roll back if the
    // POST fails, rather than silently losing the profile.
    const prevList = candidatesRef.current;
    const removedIndex = prevList.findIndex((c) => c.id === swipedId);
    const removed = removedIndex >= 0 ? prevList[removedIndex] : null;

    setCandidates((prev) => prev.filter((c) => c.id !== swipedId));
    // 낙관적 +1 은 like 일 때만. pass(넘기기)는 예산을 소모하지 않으므로 카운트 불변.
    if (direction === 'like') bumpCount(1);
    // Register in the shared session swiped-set so an in-flight (not-yet-committed)
    // POST can't let this user re-surface via a concurrent prefetch — and so the
    // 받은 좋아요 탭이 같은 카드를 즉시 덱에서 제거한다(구독 알림).
    swipedSession.add(swipedId);

    try {
      const res = await discoverService.swipe({ swiped_id: swipedId, direction });
      // 방금 pass 행이 생겼으므로 "다시 보기" 버튼 노출 조건을 즉시 충족시킨다
      // (다음 quota 동기화를 기다리지 않고 in-session 으로 반영).
      if (direction === 'pass') markHasPasses();
      // A new mutual match means the matches list has a new row — drop the
      // SWR cache so the Matches tab shows it immediately on next view.
      if (res.match && userId) {
        // 즉시 매치 = reciprocal(상대가 이미 나를 like) = 예산 면제. 낙관적 +1 을
        // 되돌린다. 매치 alert 가 동시에 떠 칩 깜빡임을 마스킹한다.
        if (direction === 'like') bumpCount(-1);
        globalMutate(matchesKey(userId));
        useCatStore.getState().celebrate();
      }
      return res;
    } catch (e: any) {
      const status = e instanceof ApiRequestError ? e.status : 0;

      // 409 = 이미 스와이프한 상대 (멀티기기/중복 요청). 스와이프 행이 사실상 존재
      // 하므로 카드를 되살리지 않는다(재노출 방지). 낙관적 +1 은 like 일 때만 올렸
      // 으니 like 일 때만 되돌린다 (다음 동기화에 BE 와 재정렬). pass 는 no-op.
      if (status === 409) {
        if (direction === 'like') bumpCount(-1);
        return null;
      }

      // 그 외(429 예산 소진 / 네트워크 / 500): 스와이프가 기록되지 않았으므로
      // 카드를 원래 위치에 복원해 프로필 유실을 막는다.
      if (removed) {
        setCandidates((prev) => {
          if (prev.some((c) => c.id === removed.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(removedIndex, next.length), 0, removed);
          return next;
        });
      }
      // 스와이프 미기록 → 세션 집합에서도 제거. 그렇지 않으면 복원된 카드가
      // loadCandidates/prefetchMore 의 swipedSession 필터에 걸려 다시 사라진다.
      // (409 는 위에서 early-return 했으므로 여기 도달하지 않음 — 집합에 유지)
      swipedSession.delete(swipedId);

      if (status === 429) {
        // 예산 소진(429는 like 에서만 발생). 화면을 잠그지 않는다 — 카드는 위에서
        // 복원됐고 pass 는 계속 가능. 카운트를 한도로 맞춰 이후 like 제스처가
        // dailyLimitReached 게이트에 걸리게 하고, one-shot 신호를 세워 화면이
        // 즉시 showLikeLimit 모달을 띄우게 한다(멀티기기 stale 대응).
        markLimitReached();
        likeLimitHitRef.current = true;
      } else if (direction === 'like') {
        // 네트워크/500 등 일시 오류 — like 낙관적 +1 되돌리기. pass 는 no-op.
        bumpCount(-1);
      }
      setError(e.message);
      return null;
    }
  }, [userId, globalMutate, bumpCount, markLimitReached, markHasPasses]);

  // 화면 onSwipe 가 handleSwipe 직후 동기 호출해 429(예산 소진) 신호를 소비한다.
  // true 를 반환하면 showLikeLimit 모달을 띄운다. 소비 즉시 flag 를 내려 재발동 방지.
  const consumeLikeLimitHit = useCallback(() => {
    if (!likeLimitHitRef.current) return false;
    likeLimitHitRef.current = false;
    return true;
  }, []);

  // 신고 등 비-스와이프 사유로 현재 카드를 덱에서 즉시 제거한다. 신고는
  // 스와이프가 아니므로 예산 카운트를 증가시키지 않는다. swipedSession 에 등록해
  // in-flight prefetch 가 (BE auto-block 전파 전에) 이 후보를 재노출하지 못하게
  // 막는다 + 받은 좋아요 탭도 즉시 제거 — handleSwipe 와 동일한 FE 권위 가드.
  const removeCandidate = useCallback((id: string) => {
    swipedSession.add(id);
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // "넘긴 사람 다시 보기" — 공유 훅이 BE 삭제 + swipedSession.clear() + quota 재동기화를
  // 담당하고, 여기서는 덱 리로드와 이미지 프리페치 dedupe 비우기만 얹는다.
  const { resetPasses } = quota;
  const handleResetPasses = useCallback(
    () =>
      resetPasses(async () => {
        prefetchedPhotosRef.current.clear();
        await loadCandidates();
      }).catch((e: any) => {
        setError(e.message);
        return null;
      }),
    [resetPasses, loadCandidates],
  );

  return {
    candidates,
    loading,
    error,
    loadCandidates,
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
