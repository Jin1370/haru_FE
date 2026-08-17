import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { CardDeck } from '@/components/discover/CardDeck';
import {
  computeDiscoverGate,
  showLikeGate,
  showLikeLimit,
  showMatchAlert,
} from '@/components/discover/DiscoverGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useReceivedLikes } from '@/hooks/useReceivedLikes';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { radii } from '@/constants/colors';

// 받은 좋아요 탭 — 나를 like 한 사용자 카드 목록.
// 디스커버와 동일한 SwipeCard/CardDeck 을 재사용해 UX 일관성 유지. 차이점은
// 카드 풀 엔드포인트와 빈 화면 CTA 뿐이며, 일일 좋아요 예산은 디스커버와 공유한다
// (useDiscoverQuota — 두 탭이 같은 SWR 캐시를 본다).
export default function LikesScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const gate = computeDiscoverGate(profile);
  const {
    candidates,
    loading,
    loadCandidates,
    syncQuota,
    handleSwipe,
    consumeLikeLimitHit,
    removeCandidate,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  } = useReceivedLikes();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCandidates(), syncQuota()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCandidates, syncQuota]);

  // 탭 focus 마다 refetch — 푸시 알림으로 새 좋아요가 도착했거나, 다른 탭에 머무는
  // 사이 누군가 like 했을 때 탭 진입 시 자동 반영. Realtime 채널은 안 씀
  // (swipes publication 미포함 + RLS 변경 부담).
  // 캐시가 이미 있으면 화면은 즉시 그려지고 이 refetch 는 뒤에서 조용히 갱신한다.
  useFocusEffect(
    useCallback(() => {
      loadCandidates();
    }, [loadCandidates]),
  );

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate) return;

    // like-wall: 미등록 사용자의 좋아요는 기능하지 않으므로(상대 피드 비노출 →
    // 매치 불가) 좋아요는 기록하지 않고 등록을 유도한다. pass 는 그대로 처리.
    if (direction === 'like' && gate.gated) {
      showLikeGate(gate, t);
      return;
    }

    // 받은 좋아요 like 는 상대가 이미 나를 like 한 상태 → 항상 reciprocal → 항상
    // 매치 완성 like = 예산 면제다. 따라서 디스커버에서 예산을 소진했더라도 여기서는
    // 사전 차단하지 않는다(결정 #4). 희귀 unlike 레이스로 BE 가 429 를 주면
    // 아래 consumeLikeLimitHit 가 방어한다.
    const res = await handleSwipe(candidate.id, direction);

    if (consumeLikeLimitHit()) {
      showLikeLimit(t);
      return;
    }

    // 받은 좋아요에서 like → 상대가 이미 like 한 상태이므로 거의 항상 즉시 match.
    if (res?.match) showMatchAlert(t, res.match.id);
  };

  // "넘긴 사람 다시 보기" — 디스커버와 동일 핸들러(같은 DELETE /api/discover/passes).
  // 두 탭이 pass 풀을 공유하므로 한쪽에서 리셋하면 양쪽에 반영된다.
  const onReset = async () => {
    const resetCount = await handleResetPasses();
    if (resetCount === null) return;
    if (resetCount === 0) {
      showAlert({
        variant: 'info',
        title: t('discover.passReset.button'),
        message: t('discover.passReset.empty_zero'),
      });
    }
  };

  const current = candidates[0];

  return (
    <CardDeck
      refreshing={refreshing}
      onRefresh={handleRefresh}
      loading={loading && candidates.length === 0}
    >
      {current ? (
        <SwipeCard
          key={current.id}
          candidate={current}
          // 등록 게이트만 like 스프링백. 받은 좋아요 like 는 항상 면제라 예산
          // 소진으로 막지 않는다 — BE 가 권위(희귀 unlike 레이스만 429).
          gated={gate.gated}
          onLike={() => onSwipe('like')}
          onPass={() => onSwipe('pass')}
          onReported={() => removeCandidate(current.id)}
        />
      ) : (
        // 받은 좋아요 0개 — 디스커버로 유도하는 CTA. 출시 초기엔 사용자 풀이 작아
        // 자주 보일 화면이라 카피 + CTA 톤이 retention 에 직결.
        <EmptyState
          iconName="heart-outline"
          title={t('likes.empty.title')}
          subtitle={t('likes.empty.text')}
          ctaLabel={t('likes.empty.cta')}
          onCtaPress={() => router.push('/(main)/(tabs)/discover')}
        >
          {passResetEnabled && hasPasses ? (
            <Button
              title={t('discover.passReset.button')}
              onPress={onReset}
              loading={resetting}
              disabled={resetting}
              style={styles.resetBtn}
              textStyle={styles.resetBtnText}
            />
          ) : null}
        </EmptyState>
      )}
    </CardDeck>
  );
}

const styles = StyleSheet.create({
  resetBtn: {
    marginTop: 12,
    borderRadius: radii.pill,
  },
  // discover.tsx 와 동일 — 16px 기본값이면 en/ja 카피가 두 줄로 접힌다.
  resetBtnText: {
    fontSize: 14,
  },
});
