import { useCallback } from 'react';
import { Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/Button';
import { PhotoBackground } from '@/components/ui/PhotoBackground';
import { useReceivedLikes } from '@/hooks/useReceivedLikes';
import { showAlert } from '@/stores/alertStore';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// 받은 좋아요 탭 — 나를 like 한 사용자 카드 목록.
// 디스커버와 동일한 SwipeCard 컴포넌트를 재사용해 UX 일관성 유지.
// 차이점:
//   - 카드 풀이 비어있을 때 디스커버 탭으로 유도하는 CTA
//   - 별도 게이팅 없음 (사용자 결정: 보이스 청취 강제 게이팅 미적용)
//   - 일일 50장 한도는 디스커버와 공유
export default function LikesScreen() {
  const { t } = useTranslation();
  const {
    candidates,
    loading,
    loadCandidates,
    handleSwipe,
    dailyCountReady,
    dailyLimitReached,
  } = useReceivedLikes();

  // 탭 focus 마다 refetch — 푸시 알림으로 새 좋아요가 도착했거나, 사용자가 디스커버
  // 등 다른 탭에 머무는 사이 누군가 like 했을 때 탭 진입 시 자동으로 fresh 반영.
  // Realtime 채널은 안 씀(swipes publication 미포함 + RLS 변경 부담) — focus refetch +
  // pull-to-refresh 로 사용자 인지 가능한 한도 내에서 신선도 유지.
  useFocusEffect(
    useCallback(() => {
      loadCandidates();
    }, [loadCandidates]),
  );

  // dailyCountReady 가 false 인 동안엔 quota 미확정 → LoadingScreen 으로 깜빡임 방지.
  if (!dailyCountReady) {
    return <LoadingScreen />;
  }

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate) return;

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

  const refreshControl = (
    <RefreshControl
      refreshing={loading}
      onRefresh={() => loadCandidates()}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  if (loading && candidates.length === 0) {
    return <LoadingScreen />;
  }

  const current = candidates[0];

  // 빈 화면 — 받은 좋아요가 0개 또는 일일 한도 소진.
  if (!current) {
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
          </ScrollView>
        </PhotoBackground>
      );
    }

    // 좋아요 0개 — 디스커버로 유도하는 CTA. 출시 초기엔 사용자 풀 작아서
    // 자주 보일 화면이라 카피 + CTA 톤이 retention 에 직결.
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
          onLike={() => onSwipe('like')}
          onPass={() => onSwipe('pass')}
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
