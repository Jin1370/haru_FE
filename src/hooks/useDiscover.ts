import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { photoAccessStore } from '@/stores/photoAccess';
import { swipedSession } from '@/stores/swipedSession';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { matchesKey } from '@/lib/swr';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import {
  BATCH_SIZE,
  DAILY_LIKE_LIMIT,
  PREFETCH_THRESHOLD,
} from '@/utils/discoverDaily';
import type { DiscoverCandidate, SwipeResponse } from '@/types';

// Discover candidates are always fully locked by policy — FE forces blur. We
// still ingest to keep the registry coherent across tabs.
function ingestCandidates(candidates: DiscoverCandidate[]) {
  const entries = candidates
    .filter((c) => Boolean(c.id))
    .map((c) => ({ userId: c.id, access: c.photo_access ?? DEFAULT_PHOTO_ACCESS }));
  photoAccessStore.ingest(entries);
}

export function useDiscover() {
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyCount, setDailyCount] = useState(0);
  // 오늘 보낸 좋아요(non-reciprocal like) 예산 한도. BE quota 응답의 limit 이
  // 단일 진실원이며, 동기화 전까진 DAILY_LIKE_LIMIT 폴백으로 시작한다.
  const [dailyLimit, setDailyLimit] = useState(DAILY_LIKE_LIMIT);
  const [dailyCountReady, setDailyCountReady] = useState(false);
  // env 게이트(quota 응답의 pass_reset_enabled). 디스커버 화면이 "다시 보기"
  // 버튼 노출 여부를 판단. 기본 false — quota 동기화 전까진 버튼 미노출(안전).
  const [passResetEnabled, setPassResetEnabled] = useState(false);
  // 넘긴(pass) 사람이 실제로 있는지(quota.has_passes). 버튼은 passResetEnabled &&
  // hasPasses 일 때만 — 넘긴 적 없는 빈 풀 사용자에게 버튼이 뜨는 어색함을 제거.
  const [hasPasses, setHasPasses] = useState(false);
  const [resetting, setResetting] = useState(false);
  const prefetchingRef = useRef(false);
  // Block prefetch until the screen's initial loadCandidates() has finished.
  // Otherwise the prefetch trigger effect (queue.length=0 ≤ 3) fires on mount
  // before setLoading(true) is reflected, racing the initial fetch and
  // doubling the BE call.
  const initializedRef = useRef(false);
  // Refs mirror the latest values so loadCandidates/prefetchMore can stay
  // identity-stable. Without this, dailyCount in their useCallback deps would
  // re-create them on every swipe, cascading into the discover screen's mount
  // effect and triggering a full refetch per swipe.
  const dailyCountRef = useRef(0);
  // handleSwipe 를 identity-stable 하게 유지하기 위해 dailyLimit 도 ref 로 미러.
  const dailyLimitRef = useRef(DAILY_LIKE_LIMIT);
  const candidatesRef = useRef<DiscoverCandidate[]>([]);
  // 429(예산 소진) one-shot 신호. handleSwipe 가 set → 화면 onSwipe 가
  // consumeLikeLimitHit() 로 동기 소비해 showLikeLimit 모달을 띄운다.
  // ref 를 쓰는 이유: 429 직후 setDailyCount(dailyLimit) 로 dailyLimitReached 가
  // true 가 돼도 그건 다음 렌더라, 같은 tick 의 onSwipe 클로저는 stale(false) 이다.
  const likeLimitHitRef = useRef(false);
  useEffect(() => {
    dailyCountRef.current = dailyCount;
  }, [dailyCount]);
  useEffect(() => {
    dailyLimitRef.current = dailyLimit;
  }, [dailyLimit]);
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

  // Pull today's swipe count + pass-reset feature flag from BE. Server-derived
  // (counts rows in `swipes` for the user's local "today") so the cap is
  // enforced across devices, not just the local SecureStore. Identity-stable so
  // the pass-reset handler can reuse it to re-sync after deleting pass rows.
  const syncQuota = useCallback(async () => {
    try {
      const q = await discoverService.getDiscoverQuota();
      setDailyCount(q.count);
      // BE 가 한도의 단일 진실원 — quota 응답 limit 으로 로컬 폴백을 정정.
      if (typeof q.limit === 'number') setDailyLimit(q.limit);
      setPassResetEnabled(q.pass_reset_enabled === true);
      setHasPasses(q.has_passes === true);
    } catch {
      // Network failures fall back to 0 to avoid blocking offline users —
      // they'll re-sync next mount. Leave the flag as-is (don't flip a button
      // off mid-session on a transient error).
      setDailyCount(0);
    }
  }, []);

  // Mount-time hydration. Gates the first fetch on dailyCountReady so we don't
  // overshoot the quota by fetching against a stale count of 0.
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

  // 크로스탭 동기화: 받은 좋아요 탭에서 스와이프(또는 신고)하면 swipedSession 에
  // 추가되며 알림이 온다 → 디스커버 덱에서도 같은 카드를 즉시 제거(refetch 불필요).
  useEffect(
    () =>
      swipedSession.subscribe(() => {
        setCandidates((prev) => prev.filter((c) => !swipedSession.has(c.id)));
      }),
    [],
  );

  // 예산 소진 여부. like 시도만 게이팅하며, pass 는 무제한이라 카드 fetch/노출은
  // 이 값과 무관하게 계속된다(아래 loadCandidates/prefetchMore 는 항상 BATCH_SIZE).
  const dailyLimitReached = dailyCount >= dailyLimit;

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 카드 fetch 를 예산(room = limit - count)에 결속하지 않는다 — like 를 다 써도
      // pass(넘기기)는 무제한이라 카드가 계속 흘러야 한다. 항상 풀 BATCH_SIZE 요청.
      const data = await discoverService.getDiscoverCandidates(BATCH_SIZE);
      ingestCandidates(data);
      // Filter out anything swiped this session — guards against the BE
      // returning a just-swiped user whose POST hasn't committed yet.
      setCandidates(data.filter((c) => !swipedSession.has(c.id)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      initializedRef.current = true;
      setLoading(false);
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
      ingestCandidates(data);
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

  // Top up the queue when running low. 예산(dailyCount)에는 더 이상 결속하지
  // 않는다 — like 소진 후에도 pass 카드가 계속 필요하므로 큐가 얕아지면 채운다.
  useEffect(() => {
    if (!dailyCountReady) return;
    if (!initializedRef.current) return;
    if (loading) return;
    if (prefetchingRef.current) return;
    if (candidates.length > PREFETCH_THRESHOLD) return;
    prefetchMore();
  }, [candidates.length, dailyCountReady, loading, prefetchMore]);

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
    if (direction === 'like') {
      setDailyCount((c) => Math.min(dailyLimitRef.current, c + 1));
    }
    // Register in the shared session swiped-set so an in-flight (not-yet-committed)
    // POST can't let this user re-surface via a concurrent prefetch — and so the
    // 받은 좋아요 탭이 같은 카드를 즉시 덱에서 제거한다(구독 알림).
    swipedSession.add(swipedId);

    try {
      const res = await discoverService.swipe({ swiped_id: swipedId, direction });
      // 방금 pass 행이 생겼으므로 "다시 보기" 버튼 노출 조건을 즉시 충족시킨다
      // (다음 quota 동기화를 기다리지 않고 in-session 으로 반영).
      if (direction === 'pass') setHasPasses(true);
      // A new mutual match means the matches list has a new row — drop the
      // SWR cache so the Matches tab shows it immediately on next view.
      if (res.match && userId) {
        // 즉시 매치 = reciprocal(상대가 이미 나를 like) = 예산 면제. 낙관적 +1 을
        // 되돌린다. 매치 alert 가 동시에 떠 칩 깜빡임을 마스킹한다.
        if (direction === 'like') setDailyCount((c) => Math.max(0, c - 1));
        globalMutate(matchesKey(userId));
        useCatStore.getState().celebrate();
      }
      return res;
    } catch (e: any) {
      const status = e instanceof ApiRequestError ? e.status : 0;

      // 409 = 이미 스와이프한 상대 (멀티기기/중복 요청). 스와이프 행이 사실상 존재
      // 하므로 카드를 되살리지 않는다(재노출 방지). 낙관적 +1 은 like 일 때만 올렸
      // 으니 like 일 때만 되돌린다 (다음 마운트에 BE 와 재동기화). pass 는 no-op.
      if (status === 409) {
        if (direction === 'like') setDailyCount((c) => Math.max(0, c - 1));
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
        // 복원됐고 pass 는 계속 가능. dailyCount 를 한도로 맞춰 이후 like 제스처가
        // dailyLimitReached 게이트에 걸리게 하고, one-shot 신호를 세워 화면이
        // 즉시 showLikeLimit 모달을 띄우게 한다(멀티기기 stale 대응).
        setDailyCount(dailyLimitRef.current);
        likeLimitHitRef.current = true;
      } else if (direction === 'like') {
        // 네트워크/500 등 일시 오류 — like 낙관적 +1 되돌리기. pass 는 no-op.
        setDailyCount((c) => Math.max(0, c - 1));
      }
      setError(e.message);
      return null;
    }
  }, [userId, globalMutate]);

  // 화면 onSwipe 가 handleSwipe 직후 동기 호출해 429(예산 소진) 신호를 소비한다.
  // true 를 반환하면 showLikeLimit 모달을 띄운다. 소비 즉시 flag 를 내려 재발동 방지.
  const consumeLikeLimitHit = useCallback(() => {
    if (!likeLimitHitRef.current) return false;
    likeLimitHitRef.current = false;
    return true;
  }, []);

  // 신고 등 비-스와이프 사유로 현재 카드를 덱에서 즉시 제거한다. 신고는
  // 스와이프가 아니므로 dailyCount 를 증가시키지 않는다. swipedSession 에 등록해
  // in-flight prefetch 가 (BE auto-block 전파 전에) 이 후보를 재노출하지 못하게
  // 막는다 + 받은 좋아요 탭도 즉시 제거 — handleSwipe 와 동일한 FE 권위 가드.
  const removeCandidate = useCallback((id: string) => {
    swipedSession.add(id);
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // "넘긴 사람 다시 보기" — viewer 의 pass 스와이프 행을 BE 에서 일괄 삭제한 뒤
  // 세션 권위 집합을 비우고 디스커버/quota 를 재동기화해 pass 했던 후보를 다시
  // 노출한다. swipedSession.clear() 가 핵심: 이 공유 집합(2026-05-31 sprint 의
  // FE 권위 재노출 가드)을 비우지 않으면 BE 가 pass 행을 지워도 FE 가 계속 필터해
  // 재노출되지 않는다. 반드시 clear → loadCandidates → syncQuota 순서.
  const handleResetPasses = useCallback(async (): Promise<number | null> => {
    if (resetting) return null;
    setResetting(true);
    try {
      const { reset_count } = await discoverService.resetPasses();
      swipedSession.clear();
      // 다음 카드용 이미지 프리페치 dedupe 도 비워 재노출 후보 사진이 다시 캐시됨.
      prefetchedPhotosRef.current.clear();
      await loadCandidates();
      // pass 행 삭제로 swipes 행 수가 줄어 quota count 가 회복 — 한도 화면 자동 해제.
      await syncQuota();
      return reset_count;
    } catch (e: any) {
      // account_frozen 은 글로벌 ApiRequestError 핸들러가 모달 처리. pass_reset_disabled
      // 는 버튼이 이미 숨겨진 상태라 정상 경로에선 도달 안 함 — 도달 시 조용히 무시.
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
    handleSwipe,
    consumeLikeLimitHit,
    removeCandidate,
    dailyCount,
    dailyLimit,
    dailyCountReady,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  };
}
