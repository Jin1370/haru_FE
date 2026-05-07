import { useCallback, useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import * as discoverService from '@/services/discover';
import { photoAccessStore } from '@/stores/photoAccess';
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

  // Pull today's swipe count from BE on mount. Server-derived (counts rows in
  // `swipes` for the user's local "today") so the cap is enforced across
  // devices, not just the local SecureStore. Network failures fall back to 0
  // to avoid blocking offline users — they'll re-sync next mount.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setDailyCountReady(false);
    discoverService.getDiscoverQuota()
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
      setCandidates(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      initializedRef.current = true;
      setLoading(false);
    }
  }, []);

  // Background prefetch: append new candidates to the queue without flipping
  // the visible loading flag. Dedupes by id to absorb the BE returning
  // already-shown profiles (top-N sort is deterministic until swipes accrue).
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
        const fresh = data.filter((c) => !seen.has(c.id));
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
    try {
      const res = await discoverService.swipe({ swiped_id: swipedId, direction });
      setCandidates((prev) => prev.filter((c) => c.id !== swipedId));
      setDailyCount((c) => Math.min(MAX_PER_DAY, c + 1));
      // A new mutual match means the matches list has a new row — drop the
      // SWR cache so the Matches tab shows it immediately on next view.
      if (res.match && userId) {
        globalMutate(matchesKey(userId));
      }
      return res;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, [userId, globalMutate]);

  return {
    candidates,
    loading,
    error,
    loadCandidates,
    handleSwipe,
    dailyCount,
    dailyCountReady,
    dailyLimitReached,
  };
}
