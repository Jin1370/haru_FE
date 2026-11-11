import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import { PlaylistCard } from '@/components/discover/SwipeCard';
import { PlaylistCarousel, useDeckArea } from '@/components/discover/PlaylistCarousel';
import { CardDeck } from '@/components/discover/CardDeck';
import { computeDiscoverGate, showLikeGate, showMatchAlert } from '@/components/discover/DiscoverGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useReceivedLikes } from '@/hooks/useReceivedLikes';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';
import { LockedCard, useCountdown } from '@/components/discover/LockedCard';
import { ApiRequestError } from '@/services/api';
import type { DiscoverCandidate } from '@/types';

// 받은 인사 탭 — 나에게 인사한 사람. 탐색 플레이리스트와 같은 카드 고리로, 옆으로 밀어
// 오가고(카드 아래 이전·다음 버튼도) 위로 밀어 인사 — 매치되면 목록에서 빠진다. 유료화 ON 이면
// 연(공개한) 순서대로 앞에 놓이고 그 뒤에 아직 안 연 사람 전원이 모자이크 카드로 있다. 모자이크
// 맨 앞 카드가 다음 무료 카드 — 시간이 되면 서버가 자동으로 연다(그 카드에만 타이머). 나머지는
// 별사탕으로 연다. 탭에 들어오면 방금 무료로 열린 카드, 없으면 첫 모자이크 카드에서 시작한다.
export default function LikesScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const gate = computeDiscoverGate(profile);
  const {
    candidates: serverCards,
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

  // 다음 무료 카드 시각이 지나면 목록·별사탕을 다시 받는다.
  const handleRefresh = useCallback(async () => {
    await Promise.all([loadCandidates(), syncQuota()]);
  }, [loadCandidates, syncQuota]);

  // 탭 focus 마다 refetch — 다른 탭에 머무는 사이 새 인사가 왔을 수 있다. 다 받으면 서버
  // 순서(연 카드 앞, 모자이크 뒤)로 다시 정리하고 시작 위치를 정한다: 방금 무료로 열린 카드 →
  // 첫 모자이크 카드 → 첫 카드.
  // 탭에 머무는 동안에는 보이던 순서를 유지한다 — 별사탕으로 연 카드가 그 자리에서 모자이크만
  // 벗겨지고, 양옆 카드와 번호가 갑자기 바뀌지 않게. 새로 온 카드는 뒤에 붙고 사라진 카드는 빠진다.
  const [epoch, setEpoch] = useState(0);
  const order = useRef<{ epoch: number; ids: string[] }>({ epoch: -1, ids: [] });
  const candidates = useMemo(() => {
    const byId = new Map(serverCards.map((c) => [c.id, c]));
    let ids = serverCards.map((c) => c.id);
    if (order.current.epoch === epoch) {
      const kept = order.current.ids.filter((id) => byId.has(id));
      ids = [...kept, ...ids.filter((id) => !kept.includes(id))];
    }
    order.current = { epoch, ids };
    return ids.map((id) => byId.get(id)!);
  }, [serverCards, epoch]);
  const candidatesRef = useRef<DiscoverCandidate[]>([]);
  candidatesRef.current = candidates;

  // 서버는 무료 카드를 연 그 한 번의 응답에만 just_revealed 를 붙인다. 그 응답은 탭에 들어올 때의
  // 중복 요청(SWR 첫 로드 + focus) 중 하나일 수도, 다른 탭에 있는 동안 무료 타이머가 끝나 받은
  // 배경 응답일 수도 있다 — 받은 순간 기억해 두고 다음 시작 위치를 정할 때 쓴다.
  const freshId = useRef<string | null>(null);
  const justRevealedInResponse = serverCards.find((c) => c.just_revealed)?.id;
  if (justRevealedInResponse) freshId.current = justRevealedInResponse;

  // 무료로 막 열려 처음 보는 카드 — "New!" 배지. 다른 카드로 넘기거나 탭을 나가면 사라진다.
  const [newId, setNewId] = useState<string | null>(null);

  // 시작 위치: 방금 무료로 열린 카드 → 첫 모자이크 카드 → 첫 카드.
  const startIndex = (list: DiscoverCandidate[]) => {
    const fresh = freshId.current ? list.findIndex((c) => c.id === freshId.current) : -1;
    if (fresh >= 0) setNewId(list[fresh].id);
    return fresh >= 0 ? fresh : Math.max(0, list.findIndex((c) => c.locked));
  };

  // 들어오는 순간 받아 둔 목록으로 시작 위치를 잡는다 — 새 목록을 받는 동안 떠날 때 보던 카드가
  // 보이지 않게. 무료로 열리는 카드는 맨 앞 모자이크 카드이고, 열리면 연 카드 묶음 맨 끝(같은
  // 자리)으로 가므로 새 목록이 와도 위치가 그대로다(그 자리에서 모자이크만 벗겨진다).
  useFocusEffect(
    useCallback(() => {
      if (candidatesRef.current.length > 0) setPos(startIndex(candidatesRef.current));
      loadCandidates().finally(() => setEpoch((e) => e + 1));
      return () => setNewId(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadCandidates]),
  );

  useEffect(() => {
    if (candidates.length === 0) return;
    setPos(startIndex(candidates));
    freshId.current = null;
    // 시작 위치는 다시 정리할 때(epoch)만 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);
  useEffect(() => {
    if (pos > candidates.length - 1) setPos(Math.max(0, candidates.length - 1));
  }, [candidates.length, pos]);

  const current = candidates[pos];
  useEffect(() => {
    if (newId && current && current.id !== newId) setNewId(null);
  }, [current, newId]);

  // 위로 밀어 인사하는 법을 기기마다 한 번만 안내한다 — 열린 카드가 처음 앞에 왔을 때.
  // 본 기록은 토큰 저장에 쓰는 SecureStore 재사용 (탐색 플레이리스트 안내와 같은 패턴).
  const hinted = useRef(false);
  useEffect(() => {
    if (hinted.current || !current || current.locked) return;
    hinted.current = true;
    SecureStore.getItemAsync(LIKES_SWIPE_HINT_KEY)
      .then((seen) => {
        if (seen) return;
        showAlert({ variant: 'info', title: t('discover.playlist.swipeHintTitle'), message: t('likes.swipeHint') });
        SecureStore.setItemAsync(LIKES_SWIPE_HINT_KEY, '1').catch(() => {});
      })
      .catch(() => {});
  }, [current, t]);

  // 서버가 무료 카드를 막 열었으면 다음 무료 시각이 바뀌었다 — 타이머용으로 다시 받는다.
  const justRevealedId = candidates.find((c) => c.just_revealed)?.id;
  useEffect(() => {
    if (justRevealedId) syncQuota();
  }, [justRevealedId, syncQuota]);

  // 모자이크 카드 공개 — 확인 후 별사탕 2개. 별사탕이 모자라면 사용하기가 충전 화면으로 보낸다.
  // 공개 중인 카드 — 버튼 대신 카드 위에 스피너를 띄운다.
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const runReveal = async (likerId: string) => {
    setRevealingId(likerId);
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
      setRevealingId(null);
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

  // 탐색 플레이리스트와 같은 카드 고리 — 옆으로 밀어 넘기고(끝에서 처음으로 이어진다), 위로 밀어
  // 인사 (모자이크 카드는 인사 못 한다). 카드 아래에 몇 번째인지.
  const cardWidth = useWindowDimensions().width - 72;
  const deck = useDeckArea();

  return (
    <View ref={deck.ref} collapsable={false} style={styles.deck} onLayout={deck.onLayout}>
      <CardDeck
        // 오류 중엔 자동 재시도(SWR errorRetry)가 로딩 화면을 띄우지 않게 한다 —
        // 띄우면 오류 화면 ↔ "불러오는 중..." 이 수 초마다 번갈아 깜빡이고 재시도
        // 버튼이 누르는 순간 사라진다. 사용자가 버튼을 누른 경우(retrying)만 로딩을 보여준다.
        loading={(loading && candidates.length === 0 && !error) || retrying}
      >
        {current ? (
          <View style={{ paddingBottom: deck.navOverlap, opacity: deck.measured ? 1 : 0 }}>
            <PlaylistCarousel
              cards={candidates}
              pos={pos}
              onSettle={setPos}
              cardWidth={cardWidth}
              showPosition
              onSwipeUp={onRequest}
              swipeUpLabel={t('discover.playlist.request')}
              canSwipeUp={(card) => !card.locked}
              compactHint
              // "New!" 배지는 화살표·번호처럼 다른 카드로 80% 넘어가는 순간 사라진다.
              onLiveChange={(i) => {
                if (newId && candidates[i]?.id !== newId) setNewId(null);
              }}
              areaHeight={deck.areaHeight}
              renderCard={(card, active, step) =>
                card.locked ? (
                  <LockedCard candidate={card} width={cardWidth} coverRatio={LIKES_COVER_RATIO}>
                    {revealingId === card.id ? (
                      <ActivityIndicator size="large" color={colors.white} />
                    ) : (
                      <RevealPanel
                        nextFreeRevealAt={card.free_next ? nextFreeRevealAt : null}
                        disabled={revealingId !== null}
                        onReveal={() => onReveal(card.id)}
                        onFreeAgain={handleRefresh}
                      />
                    )}
                  </LockedCard>
                ) : (
                  <PlaylistCard
                    candidate={card}
                    width={cardWidth}
                    active={active}
                    canPrev={candidates.length > 1}
                    canNext={candidates.length > 1}
                    onPrev={() => step(-1)}
                    onNext={() => step(1)}
                    onReported={() => removeCandidate(card.id)}
                    requested={false}
                    coverRatio={LIKES_COVER_RATIO}
                    isNew={card.id === newId}
                  />
                )
              }
            />
          </View>
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
            mdiIcon="hand-wave-outline"
            title={t('likes.empty.title')}
            subtitle={t('likes.empty.text')}
            ctaLabel={t('likes.empty.cta')}
            onCtaPress={() => router.push('/(main)/(tabs)/discover')}
          />
        )}
      </CardDeck>
    </View>
  );
}

const LIKES_SWIPE_HINT_KEY = 'haru_likes_swipe_hint_v1';

// 아래 탭 바만큼 세로 공간이 좁아 사진을 조금 줄여 카드를 낮춘다 (위쪽 화살표 자리 확보).
const LIKES_COVER_RATIO = 0.8;

// 모자이크 카드 위 별사탕 공개 버튼. 다음 무료 카드에는 무료 오픈까지 타이머도 — 끝나면 목록을
// 다시 읽어 서버가 그 카드를 연다.
function RevealPanel({
  nextFreeRevealAt,
  disabled,
  onReveal,
  onFreeAgain,
}: {
  nextFreeRevealAt: string | null;
  disabled: boolean;
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
        disabled={disabled}
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
  deck: {
    flex: 1,
  },
});
