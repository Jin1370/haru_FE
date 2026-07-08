/**
 * 디스커버 일일 한도 관련 상수만 노출. 카운트 영속화는 BE (`/api/discover/quota`)
 * 로 옮겼으므로 SecureStore-기반 load/save 테스트는 제거됨.
 */
import { DAILY_LIKE_LIMIT, BATCH_SIZE, PREFETCH_THRESHOLD } from './discoverDaily';

describe('discoverDaily — constants', () => {
  it('exposes the documented limits', () => {
    // BE env.discover.dailyLikeLimit 기본값과 동기 (폴백 전용 상수).
    expect(DAILY_LIKE_LIMIT).toBe(15);
    expect(BATCH_SIZE).toBe(10);
    expect(PREFETCH_THRESHOLD).toBe(3);
  });
});
