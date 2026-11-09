import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSWRConfig } from 'swr';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { LaunchPromoCard } from '@/components/discover/LaunchPromoCard';
import { CardDeck } from '@/components/discover/CardDeck';
import { computeDiscoverGate, showLikeGate, showMatchAlert } from '@/components/discover/DiscoverGate';
import { StarChip } from '@/components/stars/StarChip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMidnight } from '@/hooks/useMidnight';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { matchesKey } from '@/lib/swr';
import type { DiscoverCandidate } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useCatStore } from '@/stores/catStore';
import { showAlert } from '@/stores/alertStore';
import { colors, radii } from '@/constants/colors';
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
  const [cards, setCards] = useState<DiscoverCandidate[] | null>(null);
  const [error, setError] = useState(false);
  const [pos, setPos] = useState(0);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    load();
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
          headerTitleStyle: { fontFamily: fonts.bold, fontWeight: HEADER_FONT_WEIGHT, fontSize: fs(17) },
        }}
      />
      <CardDeck
        refreshing={refreshing}
        onRefresh={handleRefresh}
        loading={cards === null && !error}
        overlay={current ? <LaunchPromoCard /> : null}
      >
        {current ? (
          <>
            <Text style={styles.position}>
              {pos + 1} / {count}
            </Text>
            <SwipeCard
              key={current.id}
              candidate={current}
              // 순환 — 첫 카드에서 이전은 마지막 카드, 마지막에서 다음은 첫 카드.
              onPrev={() => setPos((p) => (p - 1 + count) % count)}
              onNext={() => setPos((p) => (p + 1) % count)}
              canPrev={count > 1}
              canNext={count > 1}
              onReported={() => patchCard(current.id, null)}
            />
            <Button
              title={t(current.requested ? 'discover.playlist.requested' : 'discover.playlist.request')}
              onPress={onRequest}
              disabled={current.requested}
              loading={sending}
              style={styles.requestBtn}
            />
          </>
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
    </>
  );
}

const styles = StyleSheet.create({
  position: {
    marginBottom: 8,
    fontSize: fs(13),
    fontFamily: fonts.medium,
    color: colors.onPhotoTextSecondary,
  },
  requestBtn: {
    marginTop: 14,
    minWidth: 200,
    borderRadius: radii.pill,
  },
});
