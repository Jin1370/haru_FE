import { useCallback } from 'react';
import useSWR from 'swr';
import { useAuthStore } from '@/stores/authStore';
import { quotaKey, quotaFetcher } from '@/lib/swr';
import type { DiscoverQuota } from '@/types';

// 별사탕 잔액·받은 좋아요 무료 카드 타이머·광고 남은 횟수. 탐색·받은 좋아요 두 탭과
// 헤더 칩이 SWR 캐시 한 벌을 같이 본다 (요청은 dedupe 된다).
export function useDiscoverQuota() {
  const userId = useAuthStore((s) => s.userId);
  const { data, mutate } = useSWR<DiscoverQuota>(userId ? quotaKey(userId) : null, quotaFetcher);

  const syncQuota = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    // 별사탕 유료화 (BE MONETIZATION_ENABLED). quota 도착 전·OFF 면 false.
    monetizationEnabled: data?.monetization_enabled === true,
    // quota 를 받았는가 — 받기 전에는 유료화 여부를 모른다 (monetizationEnabled 가 false 로 보인다).
    loaded: data !== undefined,
    starsTotal: data?.stars?.total ?? 0,
    nextFreeRevealAt: data?.next_free_reveal_at ?? null,
    adsRemaining: data?.ads_remaining ?? 0,
    syncQuota,
  };
}
