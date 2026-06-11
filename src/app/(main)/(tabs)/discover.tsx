import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeCard } from '@/components/discover/SwipeCard';
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
    dailyCountReady,
    dailyLimitReached,
    passResetEnabled,
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

  const voiceReady = profile?.voice_clone_status === 'ready';
  const voiceProcessing = profile?.voice_clone_status === 'processing';
  const bioReady = Boolean(profile?.voice_intro && profile.voice_intro.trim().length > 0);
  // Discover is two-way: the user must be visible to others to participate
  // meaningfully. With zero photos the BE-rendered match cards have no
  // image to show, so we gate browsing too — otherwise a user with no
  // photos can swipe but is invisible in everyone else's feed.
  const hasPhoto = (profile?.photos.length ?? 0) > 0;
  const gated = !voiceReady || !bioReady || !hasPhoto;

  // Wait for the daily count to hydrate before the first fetch so we don't
  // overshoot the quota by fetching against a stale count of 0.
  useEffect(() => {
    if (!gated && dailyCountReady) loadCandidates();
  }, [gated, dailyCountReady, loadCandidates]);

  // Auto-refresh trigger: the preferences screen bumps `reloadVersion` on
  // save so the candidate list refetches with the new filters without the
  // user having to pull-to-refresh. The initial mount already fetches via
  // the effect above (reloadVersion=0), so we only fire on subsequent
  // bumps to avoid a double request on first paint.
  const lastSeenReloadRef = useRef(reloadVersion);
  useEffect(() => {
    if (lastSeenReloadRef.current === reloadVersion) return;
    lastSeenReloadRef.current = reloadVersion;
    if (!gated && dailyCountReady) loadCandidates();
  }, [reloadVersion, gated, dailyCountReady, loadCandidates]);

  if (gated) {
    return (
      <PhotoBackground variant="app">
        <GateScreen
          voiceReady={voiceReady}
          voiceProcessing={voiceProcessing}
          bioReady={bioReady}
          hasPhoto={hasPhoto}
          t={t}
        />
      </PhotoBackground>
    );
  }

  const onSwipe = async (direction: 'like' | 'pass') => {
    const candidate = candidates[0];
    if (!candidate) return;

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

  if (!current) {
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
          {passResetEnabled && (
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
          onLike={() => onSwipe('like')}
          onPass={() => onSwipe('pass')}
        />
      </ScrollView>
    </PhotoBackground>
  );
}

function GateScreen({
  voiceReady,
  voiceProcessing,
  bioReady,
  hasPhoto,
  t,
}: {
  voiceReady: boolean;
  voiceProcessing: boolean;
  bioReady: boolean;
  hasPhoto: boolean;
  t: (key: string) => string;
}) {
  // Guide the user through the missing step in the natural signup order:
  // voice first, bio next, photo last.
  const goVoice = () => router.push('/(main)/settings/voice');
  const goBio = () => router.push('/(main)/settings/edit-bio');
  const goPhoto = () => router.push('/(main)/(tabs)/profile');

  if (voiceProcessing) {
    return (
      <View style={styles.empty}>
        <LinearGradient
          colors={[...gradients.glow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.emptyHalo, shadows.glow]}
        >
          <Ionicons name="hourglass-outline" size={38} color={colors.white} />
        </LinearGradient>
        <Text style={styles.emptyTitle}>{t('discover.voiceProcessingTitle')}</Text>
        <Text style={styles.emptyText}>{t('discover.voiceProcessingHint')}</Text>
      </View>
    );
  }

  // Pick the first unmet prerequisite — voice -> bio -> photo. Each step
  // shows its own icon, hint, and CTA so the user always sees the single
  // next action instead of a vague "complete your profile" instruction.
  let icon: 'mic-outline' | 'create-outline' | 'image-outline';
  let title: string;
  let hint: string;
  let ctaLabel: string;
  let onCtaPress: () => void;

  if (!voiceReady) {
    icon = 'mic-outline';
    title = t('discover.lockedVoiceTitle');
    hint = t('discover.lockedVoiceHint');
    ctaLabel = t('discover.lockedGoVoice');
    onCtaPress = goVoice;
  } else if (!bioReady) {
    icon = 'create-outline';
    title = t('discover.lockedBioTitle');
    hint = t('discover.lockedBioHint');
    ctaLabel = t('discover.lockedGoBio');
    onCtaPress = goBio;
  } else {
    // hasPhoto must be the false one here — only remaining gate.
    icon = 'image-outline';
    title = t('discover.lockedPhotoTitle');
    hint = t('discover.lockedPhotoHint');
    ctaLabel = t('discover.lockedGoPhoto');
    onCtaPress = goPhoto;
  }

  return (
    <View style={styles.empty}>
      <LinearGradient
        colors={[...gradients.glow]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.emptyHalo, shadows.glow]}
      >
        <Ionicons name={icon} size={38} color={colors.white} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{hint}</Text>
      <Button
        title={ctaLabel}
        onPress={onCtaPress}
        style={styles.ctaBtn}
        textStyle={styles.ctaBtnText}
      />
    </View>
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
