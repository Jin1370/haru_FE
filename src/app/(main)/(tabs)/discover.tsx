import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
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
import { LockedCard, useCountdown, nextLocalMidnightMs } from '@/components/discover/LockedCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDiscover } from '@/hooks/useDiscover';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { cardResetCost } from '@/utils/discoverDaily';
import type { DiscoverCandidate } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
  const {
    candidates,
    loading,
    error,
    loadCandidates,
    handleSwipe,
    consumeLikeLimitHit,
    consumeStarsShort,
    syncQuota,
    monetizationEnabled,
    starsTotal,
    removeCandidate,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  } = useDiscover();

  const [refreshing, setRefreshing] = useState(false);
  const [buyingCards, setBuyingCards] = useState(false);
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

  // 별사탕을 쓰거나(pay) 그냥 보내거나 공통 — 결과 신호(429/402)와 매치 알럿 처리.
  const sendSwipe = async (candidateId: string, direction: 'like' | 'pass', pay = false) => {
    const res = await handleSwipe(candidateId, direction, pay);

    // 멀티기기 stale: 로컬 카운트로는 여유였지만 BE 가 429 로 캡한 경우, 훅이 세운
    // one-shot 신호를 소비해 즉시 모달을 띄운다(다음 렌더의 stale 상태에 의존하지 않음).
    if (consumeLikeLimitHit()) {
      showLikeOut(candidateId);
      return;
    }
    if (consumeStarsShort()) {
      showAlert({ variant: 'info', title: t('stars.insufficient') });
      return;
    }

    // 상대가 그사이 탈퇴·정지·차단됐다. 사유를 말하지 않는다 — 차단·정지가 드러나면 안 된다.
    if (res?.skipped) {
      showAlert({
        variant: 'info',
        title: t('likes.gone.title'),
        message: t(pay ? 'likes.gone.noCharge' : 'likes.gone.next'),
      });
      return;
    }

    if (res?.match) showMatchAlert(t, res.match.id);
  };

  // 좋아요 무료 한도 소진. 유료화 ON 이면 별사탕 1개 사용 모달, OFF 면 기존 안내 모달.
  const showLikeOut = (candidateId: string) => {
    if (!monetizationEnabled) {
      showLikeLimit(t);
      return;
    }
    // 카드 더보기와 같은 구성. 별사탕이 모자라면 사용하기가 충전 화면으로 보낸다.
    showAlert({
      variant: 'confirm',
      title: t('discover.likeMoreTitle'),
      message: t('discover.likeMore'),
      starCost: 1,
      cancelText: t('common.cancel'),
      confirmText: t('stars.useConfirm'),
      onConfirm: () =>
        starsTotal < 1 ? router.push('/(main)/settings/stars') : sendSwipe(candidateId, 'like', true),
    });
  };

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate || candidate.locked) return;

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
    // BE 가 non-reciprocal 로 429 를 주면 sendSwipe 의 consumeLikeLimitHit 가 방어한다.
    // 유료화 ON 에선 BE 가 liked_you 를 보내지 않는다 — 탐색 좋아요는 전부 차감이라
    // 한도 소진 후엔 모든 카드에서 별사탕 사용 모달이 뜬다.
    if (direction === 'like' && dailyLimitReached && !candidate.liked_you) {
      showLikeOut(candidate.id);
      return;
    }

    await sendSwipe(candidate.id, direction);
  };

  // 볼 수 있는 카드 장수만큼 구매. 항상 확인 모달이고, 별사탕이 모자라면
  // 사용하기가 충전 화면으로 보낸다.
  const runCardReset = async (cards: number) => {
    setBuyingCards(true);
    try {
      await discoverService.cardReset(cards);
      await Promise.all([syncQuota(), loadCandidates()]);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 402) {
        showAlert({ variant: 'info', title: t('stars.insufficient') });
        syncQuota();
        return;
      }
      showAlert({ variant: 'info', title: t('common.tryAgainLater') });
    } finally {
      setBuyingCards(false);
    }
  };

  const onCardReset = async (shown: DiscoverCandidate) => {
    // 받아둔 장수가 낡았을 수 있어(탈퇴·차단 등으로 후보가 줄어든 경우) 다시 받아 확인한다.
    // 맨 앞이 더 이상 잠긴 카드가 아니면 화면이 새 카드로 바뀐 것이니 구매를 묻지 않는다.
    setBuyingCards(true);
    const fresh = await loadCandidates();
    setBuyingCards(false);
    const locked = fresh ? fresh[0] : shown;
    if (!locked?.locked) return;
    // 서버가 최대 10 으로 잘라 보낸다.
    const title = t('discover.cardsOut.confirmTitle');
    const count = locked.available_count ?? 0;
    // 영어만 단수·복수가 갈린다. ko·ja 의 confirmOne 은 confirm 과 같다.
    const message = t(count === 1 ? 'discover.cardsOut.confirmOne' : 'discover.cardsOut.confirm', { count });
    const cost = cardResetCost(count);
    showAlert({
      variant: 'confirm',
      title,
      message,
      messageHighlight: String(count),
      starCost: cost,
      cancelText: t('common.cancel'),
      confirmText: t('stars.useConfirm'),
      onConfirm: () => (starsTotal < cost ? router.push('/(main)/settings/stars') : runCardReset(count)),
    });
  };

  // "넘긴 사람 다시 보기" — 막힌 상태(빈 화면/한도 도달)에서만 노출되는 탈출구.
  // 확인 모달 후 적용 — 다시 보는 카드는 카드 수에서 차감되지 않는다는 안내 포함.
  // 모달은 다시 볼 사람이 없을 때(0명)만 띄운다.
  const onReset = () => {
    showAlert({
      variant: 'confirm',
      title: t('discover.passReset.confirmTitle'),
      // 차감 안내는 유료화 ON 일 때만 의미가 있다 (OFF 면 제목만).
      message: monetizationEnabled ? t('discover.passReset.confirmFreeNote') : undefined,
      cancelText: t('common.cancel'),
      confirmText: t('discover.passReset.confirmButton'),
      onConfirm: runPassReset,
    });
  };

  const runPassReset = async () => {
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
      {current?.locked ? (
        // 오늘 카드를 다 봤다 — 다음 후보를 블러로 보여주며 궁금증을 남긴다.
        <LockedCard candidate={current}>
          {buyingCards ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <CardsOutPanel onReset={() => onCardReset(current)} onMidnight={loadCandidates} />
          )}
        </LockedCard>
      ) : current ? (
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
      ) : error ? (
        // 로드 실패 — 빈 풀("더 이상 없어요")과 구분해야 한다. 서버 장애를 "사람이
        // 없다" 로 보여주면 사용자가 앱을 떠난다.
        <EmptyState
          iconName="cloud-offline-outline"
          title={t('common.loadFailed')}
          subtitle={t('common.tryAgainLater')}
          ctaLabel={t('common.retry')}
          onCtaPress={loadCandidates}
        />
      ) : (
        // 풀 소진(카드 0장)일 때만 empty-state. 좋아요 예산 소진은 화면을 교체하지
        // 않는다 — 카드는 계속 흐르고 pass 는 무제한이며, non-reciprocal like 소진은
        // onSwipe 사전 게이트로 안내한다. pass-reset 버튼은 여기 탈출구로 유지.
        <EmptyState
          haruIcon="tab-discover-outline"
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
            />
          ) : null}
        </EmptyState>
      )}
    </CardDeck>
  );
}

// 잠긴 카드 위 안내 — 다음 무료 카드까지 남은 시간 + 별사탕으로 카드 더보기.
// 자정이 지나면 onMidnight 로 다시 불러와 무료 카드를 받는다.
function CardsOutPanel({ onReset, onMidnight }: { onReset: () => void; onMidnight: () => void }) {
  const { t } = useTranslation();
  const [target] = useState(nextLocalMidnightMs);
  const left = useCountdown(target, onMidnight);
  return (
    <>
      <Text style={styles.lockedTimer}>{t('discover.cardsOut.nextFree', { time: left })}</Text>
      <Button title={t('discover.cardsOut.resetButton')} onPress={onReset} style={styles.lockedBtn} />
    </>
  );
}

const styles = StyleSheet.create({
  lockedTimer: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.white,
    opacity: 0.85,
  },
  lockedBtn: {
    marginTop: 8,
    borderRadius: radii.pill,
  },
  resetBtn: {
    marginTop: 28,
    borderRadius: radii.pill,
  },
});
