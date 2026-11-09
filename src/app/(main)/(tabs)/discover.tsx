import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CardDeck } from '@/components/discover/CardDeck';
import { EmptyState } from '@/components/ui/EmptyState';
import { HaruIcon } from '@/components/ui/HaruIcon';
import { useDiscoverQuota } from '@/hooks/useDiscoverQuota';
import { useMidnight } from '@/hooks/useMidnight';
import * as discoverService from '@/services/discover';
import { ApiRequestError } from '@/services/api';
import { preloadTabData } from '@/lib/swr';
import type { PlaylistsResponse } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii } from '@/constants/colors';
import { fonts, fs, PIXEL_NUMBER_OFFSET_Y } from '@/constants/fonts';

// 플레이리스트 커버는 순서만 구분하는 장식이다. 안에 든 사람을 암시하면 안 된다
// (어느 칸을 먼저 열든 같은 상위 카드가 들어간다 — 유료 상품의 내용 오인 방지).
const COVERS = [
  { colors: gradients.glow, icon: 'musical-notes' },
  { colors: ['#B8A1C8', '#5F3E73'] as const, icon: 'headset' },
  { colors: gradients.primary, icon: 'radio' },
] as const;

// 탐색 탭 1단계 — 오늘의 플레이리스트 3칸. 처음 여는 칸은 무료, 나머지는 별사탕.
// 유료화 OFF 면 하루 1칸이라, 고른 뒤엔 서버가 그 칸만 내려준다 (화면 가운데 1칸).
// 칸을 열면 2단계(playlist/[idx]) 카드 화면으로 간다.
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
  const { starsTotal, syncQuota } = useDiscoverQuota();
  const [data, setData] = useState<PlaylistsResponse | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await discoverService.getPlaylists();
      setData(d);
      setError(false);
      return d;
    } catch {
      setError(true);
      return null;
    } finally {
      // 첫 응답 뒤에야 다른 탭 데이터를 미리 받는다 — 첫 화면의 대역폭을 뺏지 않게.
      const uid = useAuthStore.getState().userId;
      if (uid) preloadTabData(uid);
    }
  }, []);

  // 카드 화면에서 돌아오면 곡 수·가격이 바뀌었을 수 있다.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 선호 설정을 저장하면 다음에 여는 플레이리스트부터 반영된다 — 가격·곡 수만 갱신.
  const lastSeenReloadRef = useRef(reloadVersion);
  useEffect(() => {
    if (lastSeenReloadRef.current === reloadVersion) return;
    lastSeenReloadRef.current = reloadVersion;
    load();
  }, [reloadVersion, load]);

  // 자정이 지나면 새 플레이리스트를 받는다.
  useMidnight(load);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const goTo = (idx: number) =>
    router.push({ pathname: '/(main)/playlist/[idx]', params: { idx: String(idx) } });

  const open = async (idx: number, expectedCount?: number) => {
    setOpening(idx);
    try {
      await discoverService.openPlaylist(idx, expectedCount);
      if (expectedCount) syncQuota();
      goTo(idx);
    } catch (e) {
      const code = e instanceof ApiRequestError ? e.code : undefined;
      if (e instanceof ApiRequestError && e.status === 402) {
        showAlert({ variant: 'info', title: t('stars.insufficient') });
        syncQuota();
      } else if (code === 'cards_changed' || code === 'playlist_changed') {
        // 곡 수나 가격이 바뀌었다 (차감 없음). 새 값으로 다시 묻는다.
        const fresh = await load();
        if (fresh) confirmOpen(idx, fresh, expectedCount !== undefined);
      } else {
        showAlert({ variant: 'info', title: t('common.tryAgainLater') });
      }
    } finally {
      setOpening(null);
    }
  };

  // changed = 유료 구매가 곡 수 변경으로 거절된 뒤 다시 묻는 경우.
  const confirmOpen = (idx: number, d: PlaylistsResponse, changed = false) => {
    const count = d.available_count;
    const price = d.playlists.find((p) => p.idx === idx)?.price ?? 0;
    if (count === 0) {
      showAlert({
        variant: 'info',
        title: t('discover.noMoreProfiles'),
        message: changed ? t('likes.gone.noCharge') : undefined,
      });
      return;
    }
    if (price === 0) {
      open(idx);
      return;
    }
    showAlert({
      variant: 'confirm',
      title: t(changed ? 'discover.playlist.changedTitle' : 'discover.playlist.buyTitle'),
      // 영어만 단수·복수가 갈린다. ko·ja 의 buyOne 은 buy 와 같다.
      message: t(count === 1 ? 'discover.playlist.buyOne' : 'discover.playlist.buy', { count }),
      messageHighlight: String(count),
      starCost: price,
      cancelText: t('common.cancel'),
      confirmText: t('stars.useConfirm'),
      onConfirm: () => (starsTotal < price ? router.push('/(main)/settings/stars') : open(idx, count)),
    });
  };

  const onPressTile = (idx: number) => {
    if (!data || opening !== null) return;
    if (data.playlists.find((p) => p.idx === idx)?.opened) goTo(idx);
    else confirmOpen(idx, data);
  };

  const noneOpened = data ? data.playlists.every((p) => !p.opened) : false;

  return (
    <CardDeck refreshing={refreshing} onRefresh={handleRefresh} loading={!data && !error}>
      {!data ? (
        // 로드 실패 — 빈 풀("더 이상 없어요")과 구분한다. 서버 장애를 "사람이 없다" 로
        // 보여주면 사용자가 앱을 떠난다.
        <EmptyState
          iconName="cloud-offline-outline"
          title={t('common.loadFailed')}
          subtitle={t('common.tryAgainLater')}
          ctaLabel={t('common.retry')}
          onCtaPress={load}
        />
      ) : noneOpened && data.available_count === 0 ? (
        <EmptyState
          haruIcon="tab-discover-outline"
          title={t('discover.noMoreProfiles')}
          subtitle={t('discover.checkBackLater')}
        />
      ) : (
        <View style={styles.list}>
          {data.playlists.map((p) => (
            <PlaylistTile
              key={p.idx}
              idx={p.idx}
              status={
                p.opened
                  ? t(p.count === 1 ? 'discover.playlist.tracksOne' : 'discover.playlist.tracks', {
                      count: p.count ?? 0,
                    })
                  : data.available_count === 0
                    ? t('discover.playlist.soldOut')
                    : p.price
                      ? null
                      : t('discover.playlist.free')
              }
              price={!p.opened && data.available_count > 0 && p.price ? p.price : null}
              opened={p.opened}
              disabled={!p.opened && data.available_count === 0}
              loading={opening === p.idx}
              onPress={() => onPressTile(p.idx)}
            />
          ))}
          <Text style={styles.note}>{t('discover.playlist.resetNote')}</Text>
        </View>
      )}
    </CardDeck>
  );
}

function PlaylistTile({
  idx,
  status,
  price,
  opened,
  disabled,
  loading,
  onPress,
}: {
  idx: number;
  status: string | null;
  price: number | null;
  opened: boolean;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const cover = COVERS[idx % COVERS.length];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.tile, disabled && styles.tileDisabled, pressed && styles.pressed]}
    >
      <LinearGradient colors={[...cover.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
        <Ionicons name={cover.icon} size={28} color={colors.white} />
      </LinearGradient>
      <View style={styles.tileText}>
        <Text style={styles.title} numberOfLines={1}>
          {t('discover.playlist.title', { n: idx + 1 })}
        </Text>
        <View style={styles.statusRow}>
          {price !== null ? (
            <>
              <HaruIcon name="star-candy" size={15} color={colors.primary} />
              <Text style={styles.price}>{price}</Text>
            </>
          ) : (
            <Text style={[styles.status, opened && styles.statusOpened]}>{status}</Text>
          )}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Ionicons name={opened ? 'play' : 'chevron-forward'} size={20} color="rgba(255,255,255,0.75)" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 14,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(20,10,25,0.62)',
  },
  tileDisabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    flex: 1,
  },
  title: {
    fontSize: fs(16),
    fontFamily: fonts.bold,
    color: colors.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    height: 20,
  },
  status: {
    fontSize: fs(13),
    fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.75)',
  },
  statusOpened: {
    color: colors.secondary,
  },
  price: {
    fontSize: fs(14),
    fontFamily: fonts.bold,
    color: colors.white,
    // Galmuri 숫자가 줄 상자 아래쪽에 놓여 아이콘보다 낮아 보인다 (haru_FE/CLAUDE.md).
    transform: [{ translateY: PIXEL_NUMBER_OFFSET_Y }],
  },
  note: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: fs(12),
    fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.75)',
  },
});
