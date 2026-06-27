import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { LaunchPromoCard } from '@/components/discover/LaunchPromoCard';
import { computeDiscoverGate, showLikeGate } from '@/components/discover/DiscoverGate';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/Button';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { useDiscover } from '@/hooks/useDiscover';
import { useAuthStore } from '@/stores/authStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const reloadVersion = useDiscoverStore((s) => s.reloadVersion);
  const {
    candidates,
    loading,
    loadCandidates,
    handleSwipe,
    removeCandidate,
    dailyCountReady,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  } = useDiscover();

  // RefreshControl 의 refreshing 은 사용자 당김에만 묶는다. loading 을 그대로
  // 묶으면 필터 저장 후 복귀(reloadVersion 발화)나 background refetch 가
  // refreshing=true 를 프로그램적으로 발화 → iOS content inset stuck 위험
  // (matches/likes 탭과 동일 원인).
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

  // 초기 후보 fetch 를 quota 동기화(syncQuota)와 병렬로 — dailyCountReady 를
  // 더는 기다리지 않는다. 예전엔 syncQuota → dailyCountReady → loadCandidates
  // 직렬이라 첫 이미지 앞에 BE 왕복이 2개 쌓여 콜드 진입이 느렸다. 후보를
  // dailyCount=0 기준(=full BATCH_SIZE)으로 미리 받아도, 일일 한도는 swipe
  // POST 에서 서버가 429 로 하드 캡하므로 over-fetch 는 무해하다(한도 근접
  // 사용자가 안 받아도 될 카드 몇 장을 더 받는 정도). 병렬로 도는 syncQuota
  // 가 dailyCount 를 곧 정정해 한도 화면도 정상 노출된다. 초기 1회만 발화.
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
    if (dailyCountReady) loadCandidates();
  }, [reloadVersion, dailyCountReady, loadCandidates]);

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

    const res = await handleSwipe(candidate.id, direction);

    if (res?.match) {
      const matchId = res.match.id;
      showAlert({
        variant: 'confirm',
        title: t('discover.itsAMatch'),
        message: t('discover.matchSubtitle'),
        cancelText: t('discover.keepDiscovering'),
        confirmText: t('discover.sendMessage'),
        stackedActions: true,
        onConfirm: () => router.push(`/(main)/chat/${matchId}`),
      });
    }
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

  if (loading && candidates.length === 0) {
    return <LoadingScreen />;
  }

  const current = candidates[0];

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  // 일일 한도 도달 시엔 후보가 남아 있어도(병렬 fetch 가 quota 도착 전 미리
  // 받아둔 카드) 카드를 노출하지 않고 한도 화면을 보여준다. 서버가 swipe 를
  // 429 로 캡하므로 그 카드들은 어차피 못 넘긴다 — "안 넘어가는 카드" 대신
  // 명확한 한도 안내를 띄운다. (병렬화 이전의 한도 UX 를 그대로 보존)
  if (!current || dailyLimitReached) {
    const titleKey = dailyLimitReached ? 'discover.dailyLimitTitle' : 'discover.noMoreProfiles';
    const textKey = dailyLimitReached ? 'discover.dailyLimitText' : 'discover.checkBackLater';
    const iconName = dailyLimitReached ? 'time-outline' : 'sparkles';
    return (
      <PhotoBackground variant="app">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.empty}
          refreshControl={dailyLimitReached ? undefined : refreshControl}
        >
          <LinearGradient
            colors={[...gradients.glow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.emptyHalo, shadows.glow]}
          >
            <Ionicons name={iconName} size={38} color={colors.white} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>{t(titleKey)}</Text>
          <Text style={styles.emptyText}>{t(textKey)}</Text>
          {passResetEnabled && hasPasses && (
            <Button
              title={t('discover.passReset.button')}
              onPress={onReset}
              loading={resetting}
              disabled={resetting}
              style={styles.ctaBtn}
              textStyle={styles.ctaBtnText}
            />
          )}
        </ScrollView>
      </PhotoBackground>
    );
  }

  return (
    <PhotoBackground variant="app">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={refreshControl}
      >
        <SwipeCard
          key={current.id}
          candidate={current}
          gated={gate.gated}
          onLike={() => onSwipe('like')}
          onPass={() => onSwipe('pass')}
          onReported={() => removeCandidate(current.id)}
        />
      </ScrollView>
      {/* 카드를 밀어내지 않고 위에 겹쳐 뜨는 오버레이 — ScrollView 뒤에 둬서
          paint 순서상으로도 위로 올라오게 한다(absolute + zIndex/elevation). */}
      <LaunchPromoCard />
    </PhotoBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyHalo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
    textShadowColor: 'rgba(255,244,238,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 21,
    textShadowColor: 'rgba(255,244,238,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  ctaBtn: {
    marginTop: 28,
    borderRadius: radii.pill,
  },
  ctaBtnText: {
    paddingHorizontal: 4,
  },
});
