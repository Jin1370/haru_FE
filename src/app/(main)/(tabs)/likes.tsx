import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { computeDiscoverGate, showLikeGate } from '@/components/discover/DiscoverGate';
import { Button } from '@/components/ui/Button';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { useReceivedLikes } from '@/hooks/useReceivedLikes';
import { useAuthStore } from '@/stores/authStore';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 받은 좋아요 탭 — 나를 like 한 사용자 카드 목록.
// 디스커버와 동일한 SwipeCard 컴포넌트를 재사용해 UX 일관성 유지.
// 차이점:
//   - 카드 풀이 비어있을 때 디스커버 탭으로 유도하는 CTA
//   - 일일 50장 한도는 디스커버와 공유
// 디스커버와 동일한 like-wall 게이트 — 미등록(클론/한마디/사진) 사용자도 카드는
// 보되, 좋아요를 누르면 등록 유도 모달을 띄운다(showLikeGate 공유로 두 탭 UX 통일).
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
    removeCandidate,
    dailyCountReady,
    dailyLimitReached,
    passResetEnabled,
    hasPasses,
    resetting,
    handleResetPasses,
  } = useReceivedLikes();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // quota 도 함께 재동기화 — 다른 탭(디스커버)에서 한도를 채운 경우 stale 카운트로
      // 카드를 보여주다 스와이프가 조용히 429 실패하는 것을 막는다.
      await Promise.all([loadCandidates(), syncQuota()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCandidates, syncQuota]);

  // 탭 focus 마다 refetch — 푸시 알림으로 새 좋아요가 도착했거나, 사용자가 디스커버
  // 등 다른 탭에 머무는 사이 누군가 like 했을 때 탭 진입 시 자동으로 fresh 반영.
  // Realtime 채널은 안 씀(swipes publication 미포함 + RLS 변경 부담) — focus refetch +
  // pull-to-refresh 로 사용자 인지 가능한 한도 내에서 신선도 유지.
  // quota 도 함께 동기화 — 디스커버에서 한도(50)를 채운 뒤 (이미 마운트된) 받은 좋아요
  // 탭으로 돌아올 때 stale 카운트로 카드를 노출하다 스와이프가 429 로 조용히 실패하는
  // 갭을 막는다. 두 탭은 dailyCount 를 각자 들고 있어 focus 마다 서버 기준 재동기화 필요.
  useFocusEffect(
    useCallback(() => {
      loadCandidates();
      syncQuota();
    }, [loadCandidates, syncQuota]),
  );

  // dailyCountReady 가 false 인 동안에도 PhotoBackground 를 루트로 유지하고
  // 그 안에 스피너만 띄운다. 사진 없는 별도 LoadingScreen 을 반환하면 탭 진입
  // 마다 배경 사진이 통째로 unmount→remount 되며 회색 화면 후 사진이 늦게
  // 뜨는 깜빡임이 생긴다(useFocusEffect refetch 와 맞물려 더 자주 노출).
  if (!dailyCountReady) {
    return (
      <PhotoBackground variant="app">
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </PhotoBackground>
    );
  }

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate) return;

    // like-wall: 미등록 사용자의 좋아요는 기능하지 않으므로(상대 피드 비노출 →
    // 매치 불가) 좋아요는 기록하지 않고 등록을 유도한다. pass 는 그대로 처리.
    if (direction === 'like' && gate.gated) {
      showLikeGate(gate, t);
      return;
    }

    const res = await handleSwipe(candidate.id, direction);

    // 받은 좋아요에서 like → 상대가 이미 like 한 상태이므로 거의 항상 즉시 match.
    // 디스커버 화면과 동일한 매치 성사 alert 재사용 (i18n 키도 그대로).
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

  // "넘긴 사람 다시 보기" — 받은 좋아요에서 넘겼던(=pass 한) liker 를 되살린다.
  // 디스커버와 동일 핸들러(같은 DELETE /api/discover/passes). 다시 볼 사람이 0명일
  // 때만 안내 모달. 디스커버 탭과 pass 풀을 공유하므로 한쪽에서 리셋하면 양쪽에 반영.
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

  // RefreshControl 의 refreshing 은 사용자 당김에만 묶는다. loading 을 그대로
  // 묶으면 useFocusEffect 의 포커스 refetch 가 탭 진입마다 refreshing=true 를
  // 프로그램적으로 발화 → iOS 에서 content inset 이 stuck 되어 카드가 아래로
  // 밀리는 회귀(matches 탭과 동일 원인)를 만든다.
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  if (loading && candidates.length === 0) {
    return (
      <PhotoBackground variant="app">
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </PhotoBackground>
    );
  }

  const current = candidates[0];

  // 일일 한도 소진 시엔 카드가 남아 있어도(서버가 swipe 를 429 로 하드 캡하므로
  // 어차피 못 넘긴다) 카드 대신 한도 화면을 먼저 띄운다 — 디스커버 탭과 동일.
  // 안 그러면 한도 도달 후에도 카드가 보이고 스와이프가 조용히 429 실패한다.
  if (dailyLimitReached) {
    return (
      <PhotoBackground variant="app">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.empty}>
          <LinearGradient
            colors={[...gradients.glow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.emptyHalo, shadows.glow]}
          >
            <Ionicons name="time-outline" size={38} color={colors.white} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>{t('discover.dailyLimitTitle')}</Text>
          <Text style={styles.emptyText}>{t('discover.dailyLimitText')}</Text>
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

  // 받은 좋아요 0개 — 디스커버로 유도하는 CTA. 출시 초기엔 사용자 풀 작아서
  // 자주 보일 화면이라 카피 + CTA 톤이 retention 에 직결.
  if (!current) {
    return (
      <PhotoBackground variant="app">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.empty}
          refreshControl={refreshControl}
        >
          <LinearGradient
            colors={[...gradients.glow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.emptyHalo, shadows.glow]}
          >
            <Ionicons name="heart-outline" size={38} color={colors.white} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>{t('likes.empty.title')}</Text>
          <Text style={styles.emptyText}>{t('likes.empty.text')}</Text>
          <Button
            title={t('likes.empty.cta')}
            onPress={() => router.push('/(main)/(tabs)/discover')}
            style={styles.ctaBtn}
            textStyle={styles.ctaBtnText}
          />
          {passResetEnabled && hasPasses && (
            <Button
              title={t('discover.passReset.button')}
              onPress={onReset}
              loading={resetting}
              disabled={resetting}
              style={styles.resetBtn}
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
    </PhotoBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  resetBtn: {
    marginTop: 12,
    borderRadius: radii.pill,
  },
  ctaBtnText: {
    paddingHorizontal: 4,
  },
});
