import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import { useSWRConfig } from 'swr';
import { PlaylistCard } from '@/components/discover/SwipeCard';
import { PlaylistCarousel, useDeckArea } from '@/components/discover/PlaylistCarousel';
import { coverUrl } from '@/utils/playlistCover';
import { LaunchPromoCard } from '@/components/discover/LaunchPromoCard';
import { CardDeck } from '@/components/discover/CardDeck';
import { computeDiscoverGate, showLikeGate, showMatchAlert } from '@/components/discover/DiscoverGate';
import { StarChip } from '@/components/stars/StarChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMidnight } from '@/hooks/useMidnight';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { matchesKey } from '@/lib/swr';
import type { DiscoverCandidate } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { showAlert } from '@/stores/alertStore';
import { colors } from '@/constants/colors';
import { fonts, fs, HEADER_FONT_WEIGHT } from '@/constants/fonts';

// 탐색 탭 2단계 — 연 플레이리스트의 카드. 좌우 버튼·스와이프로 순환하며 앞뒤로 오가고,
// 넘긴다고 기록되지 않는다. 대화 신청(=좋아요)만 바로 보낸다. 처음 화면에 나온 카드는
// 서버에 "봤다" 로 남겨, 자정에 본 카드만 pass 처리되고 안 본 카드는 후보로 돌아간다.
export default function PlaylistScreen() {
  const { t } = useTranslation();
  const idx = Number(useLocalSearchParams<{ idx: string }>().idx);
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.userId);
  const { mutate: globalMutate } = useSWRConfig();
  const [cards, setCards] = useState<DiscoverCandidate[] | null>(() =>
    discoverService.takePreloadedPlaylistCards(idx),
  );
  const [error, setError] = useState(false);
  const [pos, setPos] = useState(0);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await discoverService.getPlaylistCards(idx);
      setCards(res.cards);
      setError(false);
    } catch (e) {
      // 자정이 지나 플레이리스트가 사라졌다 (앱이 백그라운드여서 타이머를 놓친 경우 등).
      if (e instanceof ApiRequestError && e.status === 404) {
        showAlert({ variant: 'info', title: t('discover.playlist.expired') });
        router.back();
        return;
      }
      setError(true);
    }
  }, [idx, t]);

  // 선택 화면이 받아 둔 카드가 있으면 다시 받지 않는다.
  const preloadedRef = useRef(cards !== null);
  useEffect(() => {
    if (preloadedRef.current) preloadedRef.current = false;
    else load();
  }, [load]);

  // 자정이 되면 보고 있던 카드도 닫고 선택 화면으로 돌아간다 (선택 화면은 focus 때 새로 받는다).
  useMidnight(
    useCallback(() => {
      router.back();
      showAlert({ variant: 'info', title: t('discover.playlist.expired') });
    }, [t]),
  );

  // 신고·탈퇴로 카드가 빠지면 위치를 범위 안으로 되돌린다.
  useEffect(() => {
    if (cards && pos > Math.max(0, cards.length - 1)) setPos(Math.max(0, cards.length - 1));
  }, [cards, pos]);

  const current = cards?.[pos];

  // 위로 밀어 신청하는 법을 기기마다 한 번만 안내한다 (카드가 처음 뜰 때). 본 기록은 토큰 저장에
  // 쓰는 SecureStore 재사용 — catStore 와 같은 패턴.
  const hinted = useRef(false);
  useEffect(() => {
    if (hinted.current || !cards?.length) return;
    hinted.current = true;
    SecureStore.getItemAsync(SWIPE_HINT_KEY)
      .then((seen) => {
        if (seen) return;
        showAlert({ variant: 'info', title: t('discover.playlist.swipeHintTitle'), message: t('discover.playlist.swipeHint') });
        SecureStore.setItemAsync(SWIPE_HINT_KEY, '1').catch(() => {});
      })
      .catch(() => {});
  }, [cards, t]);

  // 좌우로 넘길 카드의 사진을 미리 받는다 (순환 이동). 받아 둔 사진은 캐시에서 바로 끝난다.
  useEffect(() => {
    if (!cards?.length) return;
    for (const d of [1, -1]) {
      const url = cards[(pos + d + cards.length) % cards.length]?.photos?.[0];
      if (url) Image.prefetch(url).catch(() => {});
    }
  }, [cards, pos]);

  // 처음 화면에 나온 카드를 바로 기록한다 — 기록이 빠지면 본 사람이 다음 날 다시 후보가
  // 되어 별사탕으로 산 플레이리스트에 섞일 수 있다. 실패한 기록은 화면을 나갈 때 다시 보낸다.
  const reported = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const id = current?.id;
    if (!id || reported.current.has(id)) return;
    reported.current.add(id);
    discoverService.markPlaylistSeen(idx, [id]).catch(() => pending.current.add(id));
  }, [current?.id, idx]);
  useEffect(
    () => () => {
      if (pending.current.size > 0) discoverService.markPlaylistSeen(idx, [...pending.current]).catch(() => {});
    },
    [idx],
  );

  const patchCard = (id: string, patch: Partial<DiscoverCandidate> | null) =>
    setCards((prev) =>
      prev ? (patch ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev.filter((c) => c.id !== id)) : prev,
    );

  const gate = computeDiscoverGate(profile);

  const onRequest = async () => {
    if (!current || current.requested || sending) return;
    // 미등록 사용자의 신청은 상대 피드에 안 보여 매치가 안 된다 — 부족한 단계로 안내.
    if (gate.gated) {
      showLikeGate(gate, t);
      return;
    }
    const candidate = current;
    setSending(true);
    patchCard(candidate.id, { requested: true });
    try {
      const res = await discoverService.swipe({ swiped_id: candidate.id, direction: 'like', source: 'playlist' });
      // 상대가 그사이 탈퇴·정지·차단됐다 (기록 없음). 사유는 말하지 않는다.
      if (res.skipped) {
        patchCard(candidate.id, null);
        showAlert({ variant: 'info', title: t('likes.gone.title'), message: t('likes.gone.next') });
        return;
      }
      if (res.match) {
        if (userId) globalMutate(matchesKey(userId));
        useCatStore.getState().celebrate();
        showMatchAlert(t, res.match.id);
      }
    } catch (e) {
      const status = e instanceof ApiRequestError ? e.status : 0;
      // 409 = 다른 기기에서 이미 신청함. 신청 완료 상태가 맞다.
      if (status === 409) return;
      patchCard(candidate.id, { requested: false });
      // 403 = 자정이 지나 오늘 플레이리스트가 아니다 — 다시 받으면 404 로 선택 화면에 간다.
      if (status === 403) load();
      else showAlert({ variant: 'info', title: t('common.tryAgainLater') });
    } finally {
      setSending(false);
    }
  };

  const count = cards?.length ?? 0;
  // 양옆 이웃 카드가 조금씩 보이도록 카드 폭을 줄인다 (사진은 정사각형 그대로).
  const cardWidth = useWindowDimensions().width - 72;
  const deck = useDeckArea();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('discover.playlist.title', { n: idx + 1 }),
          headerRight: () => <StarChip />,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          // 제목 앞에 이 플레이리스트의 커버.
          headerTitle: ({ children }) => (
            <View style={styles.titleRow}>
              <Image source={{ uri: coverUrl(idx) }} style={styles.cover} />
              <Text style={styles.title}>{children}</Text>
            </View>
          ),
        }}
      />
      <View ref={deck.ref} collapsable={false} style={styles.deck} onLayout={deck.onLayout}>
      <CardDeck
        loading={cards === null && !error}
        overlay={current ? <LaunchPromoCard /> : null}
      >
        {current && cards ? (
          // 내비게이션 바 겹침을 재기 전엔 숨긴다 — 재고 나서 아래 여백이 생기며 카드가 올라가 보이지 않게.
          <View style={{ paddingBottom: deck.navOverlap, opacity: deck.measured ? 1 : 0 }}>
          <PlaylistCarousel
            cards={cards}
            pos={pos}
            onSettle={setPos}
            cardWidth={cardWidth}
            onSwipeUp={onRequest}
            swipeUpLabel={t('discover.playlist.request')}
            canSwipeUp={(card) => !card.requested}
            showPosition
            areaHeight={deck.areaHeight}
            // 순환 — 첫 카드에서 이전은 마지막 카드, 마지막에서 다음은 첫 카드.
            renderCard={(card, active, step) => (
              <PlaylistCard
                candidate={card}
                width={cardWidth}
                active={active}
                canPrev={count > 1}
                canNext={count > 1}
                onPrev={() => step(-1)}
                onNext={() => step(1)}
                onReported={() => patchCard(card.id, null)}
                requested={!!card.requested}
              />
            )}
          />
          </View>
        ) : error ? (
          <EmptyState
            iconName="cloud-offline-outline"
            title={t('common.loadFailed')}
            subtitle={t('common.tryAgainLater')}
            ctaLabel={t('common.retry')}
            onCtaPress={load}
          />
        ) : (
          <EmptyState
            haruIcon="tab-discover-outline"
            title={t('discover.noMoreProfiles')}
            subtitle={t('discover.checkBackLater')}
          />
        )}
      </CardDeck>
      </View>
    </>
  );
}

const SWIPE_HINT_KEY = 'haru_playlist_swipe_hint_v1';

const styles = StyleSheet.create({
  deck: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cover: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  title: {
    fontFamily: fonts.bold,
    fontWeight: HEADER_FONT_WEIGHT,
    fontSize: fs(17),
    color: colors.text,
  },
});
