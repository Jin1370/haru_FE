import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { LaunchPromoCard } from '@/components/discover/LaunchPromoCard';
import { CardDeck } from '@/components/discover/CardDeck';
import {
  computeDiscoverGate,
  showLikeGate,
  showLikeLimit,
  showMatchAlert,
} from '@/components/discover/DiscoverGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDiscover } from '@/hooks/useDiscover';
import { useAuthStore } from '@/stores/authStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { radii } from '@/constants/colors';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
  const {
    candidates,
    loading,
    loadCandidates,
    handleSwipe,
    consumeLikeLimitHit,
    removeCandidate,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  } = useDiscover();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCandidates();
    } finally {
      setRefreshing(false);
    }
  }, [loadCandidates]);

  // 디스커버 참여 전제조건 게이트(클론/한마디/사진). 받은 좋아요 탭과 공유하는
  // computeDiscoverGate 로 단일화 — 두 탭의 게이트 조건이 갈라지지 않게 한다.
  // 디스커버는 더 이상 하드 게이트하지 않는다: 미등록 사용자도 카드를 "구경" 하게
  // 두어 등록 동기를 만들고(클론 단계 이탈 완화), 실제 참여 행동인 "좋아요" 시점에만
  // 등록을 유도한다(아래 onSwipe like-wall). pass 는 그대로 처리.
  const gate = computeDiscoverGate(profile);

  // 초기 후보 fetch 는 quota 동기화와 병렬 — 직렬로 묶으면 첫 이미지 앞에 BE 왕복이
  // 2개 쌓여 콜드 진입이 느려진다. 일일 한도는 swipe POST 에서 서버가 429 로 하드
  // 캡하므로 over-fetch 는 무해하다. 초기 1회만 발화.
  const didInitialFetchRef = useRef(false);
  useEffect(() => {
    if (didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;
    loadCandidates();
  }, [loadCandidates]);

  // Auto-refresh trigger: the preferences screen bumps `reloadVersion` on
  // save so the candidate list refetches with the new filters without the
  // user having to pull-to-refresh. The initial mount already fetches via
  // the effect above (reloadVersion=0), so we only fire on subsequent
  // bumps to avoid a double request on first paint.
  const lastSeenReloadRef = useRef(reloadVersion);
  useEffect(() => {
    if (lastSeenReloadRef.current === reloadVersion) return;
    lastSeenReloadRef.current = reloadVersion;
    loadCandidates();
  }, [reloadVersion, loadCandidates]);

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate) return;

    // like-wall: 미등록 사용자의 좋아요는 어차피 기능하지 않는다(상대 피드에
    // 안 보여 매치 불가). 좋아요는 기록하지 않고(=카드 유지, 돌아와 다시 좋아요)
    // 부족한 단계로 등록을 유도한다. pass 는 그대로 기록/처리.
    if (direction === 'like' && gate.gated) {
      showLikeGate(gate, t);
      return;
    }

    // 좋아요 예산 소진 시: 이 후보가 나를 아직 like 하지 않은(non-reciprocal =
    // 예산 소모) 카드면 카드를 넘기지 않고 즉시 한도 모달만 띄운다(카드 그대로).
    // 매치를 완성하는 like(candidate.liked_you=true = 면제)는 소진 후에도 통과시켜
    // 즉시 매치되게 한다(결정 #4). liked_you 가 stale(로드 후 상대가 unlike)이라
    // BE 가 non-reciprocal 로 429 를 주면 아래 consumeLikeLimitHit 가 방어한다.
    if (direction === 'like' && dailyLimitReached && !candidate.liked_you) {
      showLikeLimit(t);
      return;
    }

    const res = await handleSwipe(candidate.id, direction);

    // 멀티기기 stale: 로컬 카운트로는 여유였지만 BE 가 429 로 캡한 경우, 훅이 세운
    // one-shot 신호를 소비해 즉시 모달을 띄운다(다음 렌더의 stale 상태에 의존하지 않음).
    if (consumeLikeLimitHit()) {
      showLikeLimit(t);
      return;
    }

    if (res?.match) showMatchAlert(t, res.match.id);
  };

  // "넘긴 사람 다시 보기" — 막힌 상태(빈 화면/한도 도달)에서만 노출되는 탈출구.
  // 카드는 즉시 복구된다. 모달은 다시 볼 사람이 없을 때(0명)만 띄운다.
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
      overlay={current ? <LaunchPromoCard /> : null}
    >
      {current ? (
        <SwipeCard
          key={current.id}
          candidate={current}
          // like 게이트 = 등록 미완성 OR (예산 소진 AND 이 후보가 나를 아직 like
          // 안 함=non-reciprocal). 게이트 시 like 제스처/버튼은 fly-out 대신 스프링백
          // (카드 그대로) 후 onLike→onSwipe('like')→모달로 안내. 매치 완성
          // like(liked_you=true, 면제)는 gated 아님 → fly-out 후 즉시 매치.
          gated={gate.gated || (dailyLimitReached && !current.liked_you)}
          onLike={() => onSwipe('like')}
          onPass={() => onSwipe('pass')}
          onReported={() => removeCandidate(current.id)}
        />
      ) : (
        // 풀 소진(카드 0장)일 때만 empty-state. 좋아요 예산 소진은 화면을 교체하지
        // 않는다 — 카드는 계속 흐르고 pass 는 무제한이며, non-reciprocal like 소진은
        // onSwipe 사전 게이트로 안내한다. pass-reset 버튼은 여기 탈출구로 유지.
        <EmptyState
          iconName="sparkles"
          title={t('discover.noMoreProfiles')}
          subtitle={t('discover.checkBackLater')}
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
    marginTop: 28,
    borderRadius: radii.pill,
  },
  // 16px 기본값이면 en "See skipped people again" / ja "スキップした人をもう一度見る"
  // 가 EmptyState 의 좌우 여백(32×2) 안에서 두 줄로 접힌다.
  resetBtnText: {
    fontSize: 14,
  },
});
