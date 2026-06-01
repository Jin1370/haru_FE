import type { Profile } from '@/types';

// 프리미엄 entitlement 판정 (런칭 쿠폰 + 향후 구독 공유, mig 033).
//   * 무료 : 음성 10통/일, 받은좋아요 하루 1명, 광고 노출.
//   * 프리미엄: 음성 30통/일, 받은좋아요 무제한, 광고 없음.
// premium_until 이 미래면 프리미엄. 쿠폰은 그 시각에 자동 만료 → 무료 복귀.
export function isPremium(profile: Pick<Profile, 'premium_until'> | null | undefined): boolean {
  const until = profile?.premium_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}
