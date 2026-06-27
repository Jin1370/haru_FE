import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { photoAccessStore } from '@/stores/photoAccess';
import { swipedSession } from '@/stores/swipedSession';
import { useAuthStore } from '@/stores/authStore';
import { matchesKey } from '@/lib/swr';
import { DEFAULT_PHOTO_ACCESS } from '@/types/photoAccess';
import {
  BATCH_SIZE,
  MAX_PER_DAY,
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
  const candidatesRef = useRef<DiscoverCandidate[]>([]);
  useEffect(() => {
    dailyCountRef.current = dailyCount;
  }, [dailyCount]);
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

  const dailyLimitReached = dailyCount >= MAX_PER_DAY;

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const room = MAX_PER_DAY - dailyCountRef.current;
      const fetchSize = Math.min(BATCH_SIZE, Math.max(0, room));
      if (fetchSize === 0) {
        setCandidates([]);
        return;
      }
      const data = await discoverService.getDiscoverCandidates(fetchSize);
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
      const room = MAX_PER_DAY - dailyCountRef.current - candidatesRef.current.length;
      const fetchSize = Math.min(BATCH_SIZE, room);
      if (fetchSize <= 0) return;
      const data = await discoverService.getDiscoverCandidates(fetchSize);
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

  // Top up the queue when running low and the daily quota still has room.
  useEffect(() => {
    if (!dailyCountReady) return;
    if (!initializedRef.current) return;
    if (loading) return;
    if (prefetchingRef.current) return;
    if (candidates.length > PREFETCH_THRESHOLD) return;
    if (dailyCount + candidates.length >= MAX_PER_DAY) return;
    prefetchMore();
  }, [candidates.length, dailyCount, dailyCountReady, loading, prefetchMore]);

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
    setDailyCount((c) => Math.min(MAX_PER_DAY, c + 1));
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
        globalMutate(matchesKey(userId));
      }
      return res;
    } catch (e: any) {
      const status = e instanceof ApiRequestError ? e.status : 0;

      // 409 = 이미 스와이프한 상대 (멀티기기/중복 요청). 스와이프 행이 사실상 존재
      // 하므로 카드를 되살리지 않는다(재노출 방지). 다만 낙관적 +1 은 새 행이
      // 추가된 게 아니라 기존 행이므로 되돌린다 (다음 마운트에 BE 와 재동기화).
      if (status === 409) {
        setDailyCount((c) => Math.max(0, c - 1));
        return null;
      }

      // 그 외(429 한도 초과 / 네트워크 / 500): 스와이프가 기록되지 않았으므로
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
        // BE 하드 캡 도달 — 세션 카운트를 한도로 끌어올려 한도 화면을 노출하고
        // 추가 프리페치를 멈춘다 (FE 소프트 캡과 BE 가 어긋난 멀티기기 케이스의
        // 안전망). 복원된 카드는 큐가 비면 한도 화면으로 자연 전환.
        setDailyCount(MAX_PER_DAY);
      } else {
        // 네트워크/500 등 일시 오류 — 낙관적 +1 되돌리기.
        setDailyCount((c) => Math.max(0, c - 1));
      }
      setError(e.message);
      return null;
    }
  }, [userId, globalMutate]);

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
