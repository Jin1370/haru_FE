import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { CardDeck } from '@/components/discover/CardDeck';
import { computeDiscoverGate, showLikeGate, showMatchAlert } from '@/components/discover/DiscoverGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useReceivedLikes } from '@/hooks/useReceivedLikes';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
import { LockedCard, useCountdown } from '@/components/discover/LockedCard';
import { ApiRequestError } from '@/services/api';

// 받은 좋아요 탭 — 나를 like 한 사람. 넘기기는 없고 좌우 버튼으로 오가며, 대화 신청으로
// 매치되면 목록에서 빠진다. 유료화 ON 이면 본(공개한) 순서대로 왼쪽부터 놓이고 맨
// 오른쪽에 잠긴 카드가 있다 — 탭에 들어오면 항상 맨 오른쪽에서 시작하고, 왼쪽 버튼은
// 가장 최근에 본 카드부터 거슬러 간다. 무료 카드는 잠긴 카드가 화면에 나오는 순간 열린다.
export default function LikesScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const gate = computeDiscoverGate(profile);
  const { monetizationEnabled } = useDiscoverQuota();
  const {
    candidates,
    loading,
    error,
    loadCandidates,
    syncQuota,
    request,
    reveal,
    removeCandidate,
    starsTotal,
    nextFreeRevealAt,
  } = useReceivedLikes();
  const [pos, setPos] = useState(0);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCandidates(), syncQuota()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCandidates, syncQuota]);

  // 탭 focus 마다 refetch — 다른 탭에 머무는 사이 새 좋아요가 왔을 수 있다. 들어올 때마다
  // 맨 오른쪽(유료화 ON: 잠긴 카드 / OFF: 첫 카드)에서 시작한다.
  const jumpOnLoad = useRef(true);
  useFocusEffect(
    useCallback(() => {
      jumpOnLoad.current = true;
      loadCandidates();
    }, [loadCandidates]),
  );
  useEffect(() => {
    if (candidates.length === 0) return;
    if (jumpOnLoad.current) {
      jumpOnLoad.current = false;
      setPos(monetizationEnabled ? candidates.length - 1 : 0);
    } else if (pos > candidates.length - 1) {
      setPos(candidates.length - 1);
    }
  }, [candidates, monetizationEnabled, pos]);

  const current = candidates[pos];

  // 무료 카드 — 잠긴 카드가 화면에 나온 순간 서버에 열기를 요청한다 (그때 사용 처리).
  // 열린 카드는 공개 순서상 같은 자리에 오고 그 뒤에 새 잠긴 카드가 붙는다.
  const freeTried = useRef(new Set<string>());
  useEffect(() => {
    if (!current?.locked || !current.free_available || freeTried.current.has(current.id)) return;
    freeTried.current.add(current.id);
    reveal(current.id, true).catch(() => loadCandidates());
  }, [current, reveal, loadCandidates]);

  // 잠긴 카드 공개 — 확인 후 별사탕 2개. 별사탕이 모자라면 사용하기가 충전 화면으로 보낸다.
  const [revealing, setRevealing] = useState(false);
  const runReveal = async (likerId: string) => {
    setRevealing(true);
    try {
      if (!(await reveal(likerId))) {
        showAlert({ variant: 'info', title: t('likes.gone.title'), message: t('likes.gone.noCharge') });
      }
    } catch (e) {
      const code = e instanceof ApiRequestError ? e.code : undefined;
      showAlert({
        variant: 'info',
        title: code === 'insufficient_stars' ? t('stars.insufficient') : t('common.tryAgainLater'),
      });
    } finally {
      setRevealing(false);
    }
  };

  const onReveal = (likerId: string) => {
    showAlert({
      variant: 'confirm',
      title: t('likes.locked.confirmPaid'),
      starCost: 2,
      cancelText: t('common.cancel'),
      confirmText: t('stars.useConfirm'),
      onConfirm: () => (starsTotal < 2 ? router.push('/(main)/settings/stars') : runReveal(likerId)),
    });
  };

  const [sending, setSending] = useState(false);
  const onRequest = async () => {
    if (!current || current.locked || sending) return;
    // 미등록 사용자의 신청은 상대 피드에 안 보여 매치가 안 된다 — 등록을 유도한다.
    if (gate.gated) {
      showLikeGate(gate, t);
      return;
    }
    setSending(true);
    try {
      const res = await request(current.id);
      // 상대가 그사이 탈퇴·정지·차단됐다. 사유를 말하지 않는다 — 차단·정지가 드러나면 안
      // 된다. 별사탕으로 공개한 카드였으면 서버가 공개에 쓴 별사탕을 돌려준다.
      if (res.skipped) {
        showAlert({
          variant: 'info',
          title: t('likes.gone.title'),
          message: res.refunded_stars
            ? t('likes.gone.refunded', { count: res.refunded_stars })
            : t('likes.gone.next'),
        });
        return;
      }
      if (res.match) showMatchAlert(t, res.match.id);
    } catch {
      loadCandidates();
      showAlert({ variant: 'info', title: t('common.tryAgainLater') });
    } finally {
      setSending(false);
    }
  };

  const [retrying, setRetrying] = useState(false);
  const onRetry = async () => {
    setRetrying(true);
    try {
      await loadCandidates();
    } finally {
      setRetrying(false);
    }
  };

  const goPrev = () => setPos((p) => Math.max(0, p - 1));
  const goNext = () => setPos((p) => Math.min(candidates.length - 1, p + 1));

  return (
    <CardDeck
      refreshing={refreshing}
      onRefresh={handleRefresh}
      // 오류 중엔 자동 재시도(SWR errorRetry)가 로딩 화면을 띄우지 않게 한다 —
      // 띄우면 오류 화면 ↔ "불러오는 중..." 이 수 초마다 번갈아 깜빡이고 재시도
      // 버튼이 누르는 순간 사라진다. 사용자가 버튼을 누른 경우(retrying)만 로딩을 보여준다.
      loading={(loading && candidates.length === 0 && !error) || retrying}
    >
      {current?.locked ? (
        <>
          <LockedCard candidate={current}>
            {current.free_available ? (
              <ActivityIndicator size="large" color={colors.white} />
            ) : (
              <RevealPanel
                nextFreeRevealAt={nextFreeRevealAt}
                revealing={revealing}
                onReveal={() => onReveal(current.id)}
                onFreeAgain={handleRefresh}
              />
            )}
          </LockedCard>
          {pos > 0 ? (
            // 잠긴 카드는 카드 안 버튼이 블러에 덮여 있어 이전 카드 버튼을 아래에 둔다.
            <Pressable
              onPress={goPrev}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('discover.playlist.prev')}
              style={({ pressed }) => [styles.prevBtn, pressed && styles.pressed]}
            >
              <Ionicons name="play-back" size={30} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </>
      ) : current ? (
        <>
          <SwipeCard
            key={current.id}
            candidate={current}
            onPrev={goPrev}
            onNext={goNext}
            canPrev={pos > 0}
            canNext={pos < candidates.length - 1}
            onReported={() => removeCandidate(current.id)}
          />
          <Button
            title={t('discover.playlist.request')}
            onPress={onRequest}
            loading={sending}
            style={styles.requestBtn}
          />
        </>
      ) : error ? (
        // 로드 실패 — "받은 좋아요 0개" 와 구분.
        <EmptyState
          iconName="cloud-offline-outline"
          title={t('common.loadFailed')}
          subtitle={t('common.tryAgainLater')}
          ctaLabel={t('common.retry')}
          onCtaPress={onRetry}
        />
      ) : (
        // 받은 좋아요 0개 — 탐색으로 유도하는 CTA.
        <EmptyState
          haruIcon="tab-likes-outline"
          title={t('likes.empty.title')}
          subtitle={t('likes.empty.text')}
          ctaLabel={t('likes.empty.cta')}
          onCtaPress={() => router.push('/(main)/(tabs)/discover')}
        />
      )}
    </CardDeck>
  );
}

// 잠긴 카드 위 공개 버튼. 다음 무료 카드까지 타이머 + "별사탕 2개로 공개하기".
// 타이머가 끝나면 목록을 다시 읽어 이 카드가 무료로 열린다.
function RevealPanel({
  nextFreeRevealAt,
  revealing,
  onReveal,
  onFreeAgain,
}: {
  nextFreeRevealAt: string | null;
  revealing: boolean;
  onReveal: () => void;
  onFreeAgain: () => void;
}) {
  const { t } = useTranslation();
  const target = nextFreeRevealAt ? new Date(nextFreeRevealAt).getTime() : null;
  const left = useCountdown(target, onFreeAgain);
  return (
    <>
      {target ? <Text style={styles.lockedTimer}>{t('likes.locked.nextFree', { time: left })}</Text> : null}
      <Button
        title={t('likes.locked.paidReveal')}
        onPress={onReveal}
        loading={revealing}
        disabled={revealing}
        style={styles.lockedBtn}
      />
    </>
  );
}

const styles = StyleSheet.create({
  lockedTimer: {
    fontSize: fs(14),
    fontFamily: fonts.medium,
    color: colors.white,
    opacity: 0.85,
    textAlign: 'center',
  },
  lockedBtn: {
    marginTop: 8,
    borderRadius: radii.pill,
  },
  requestBtn: {
    marginTop: 14,
    minWidth: 200,
    borderRadius: radii.pill,
  },
  prevBtn: {
    marginTop: 14,
    padding: 6,
  },
  pressed: {
    transform: [{ scale: 0.92 }],
  },
});
