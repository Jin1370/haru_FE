import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { safePlay } from './sharedAudioPlayer';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radii } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface AudioPlayerProps {
  url: string;
  compact?: boolean;
  showProgressBar?: boolean;
  /**
   * Horizontal play-bar layout: play/pause button + linear progress fill +
   * elapsed/total time. Used when an inline icon feels too sparse (e.g.
   * voice intro preview under language tabs).
   */
  showBar?: boolean;
  tintColor?: string;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const r = Math.floor(seconds % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function AudioPlayer({ url, compact = false, showProgressBar = false, showBar = false, tintColor = colors.primary }: AudioPlayerProps) {
  const { t } = useTranslation();
  // chat-audio-async-insert sprint: 모든 메시지가 cold-start path 만 거치도록
  // BE/useChat 구조가 바뀌었다 (POST 응답이 stub 이거나 동기 INSERT 결과 → 같은
  // id 로 realtime INSERT 가 도착해 upsert → AudioPlayer 가 처음 mount 되는
  // 시점에 항상 audio_status='ready' + audio_url). expo-audio 의 mid-session
  // mount → resource auto-evict 트리거 자체가 없어지므로 본 컴포넌트는 단순한
  // `useAudioPlayer(url)` 만으로 충분. fix v3 (toggle 안 replace), fix v4
  // (keepAudioSessionActive: true), 진단 로그는 모두 제거.
  //
  // 부팅 시 audio session 을 playback-only + playsInSilentMode 로 명시 고정한
  // 코드는 app/_layout.tsx 에 그대로 유지 (녹음 직후 잔여 session 상태 대비
  // 무해한 best practice).
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  // expo-audio surfaces playback status only every ~250–500ms, so binding the
  // play-bar fill straight to `progress` makes it jump in discrete steps. We
  // drive an Animated value instead: each status tick we animate linearly
  // toward the end over the *remaining* real time, so the fill moves
  // continuously between ticks. Only consumed by the `showBar` variant below.
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPlaying && duration > 0) {
      let cancelled = false;
      // Read where the bar actually is right now, then decide the start point.
      fillAnim.stopAnimation((current) => {
        if (cancelled) return;
        // The reported currentTime lags the true playback head (worst right
        // after play starts / during buffering), so `progress` can briefly be
        // *behind* the bar. Snapping back to it is the "stutter + jump back".
        // Keep the bar monotonic forward — only honor a backward move when it's
        // large enough to be a real seek/replay (seek-to-0 on replay).
        const isRealSeekBack = current - progress > 0.2;
        const start = isRealSeekBack ? progress : Math.max(current, progress);
        fillAnim.setValue(start);
        const remainingMs = Math.max((duration - currentTime) * 1000, 0);
        Animated.timing(fillAnim, {
          toValue: 1,
          duration: remainingMs,
          easing: Easing.linear,
          // width % can't be driven natively — keep it on the JS driver.
          useNativeDriver: false,
        }).start();
      });
      return () => {
        cancelled = true;
      };
    }
    // paused / stopped / ended → hold the fill at the real progress.
    fillAnim.stopAnimation();
    fillAnim.setValue(progress);
  }, [isPlaying, duration, currentTime, progress, fillAnim]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const toggle = useCallback(() => {
    if (isPlaying) {
      player.pause();
      return;
    }
    if (duration > 0 && currentTime >= duration) {
      player.seekTo(0);
    }
    safePlay(player);
  }, [player, isPlaying, duration, currentTime]);

  if (showBar) {
    return (
      <View style={styles.barRow}>
        <Pressable
          onPress={toggle}
          style={[styles.barPlayBtn, { borderColor: tintColor }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? t('audioPlayer.stop') : t('audioPlayer.play')}
          hitSlop={6}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={16}
            color={tintColor}
            style={isPlaying ? undefined : styles.playIconOffset}
          />
        </Pressable>
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              { width: fillWidth, backgroundColor: tintColor },
            ]}
          />
        </View>
        <Text style={[styles.barTime, { color: tintColor }]} numberOfLines={1}>
          {formatClock(currentTime)} / {formatClock(duration)}
        </Text>
      </View>
    );
  }

  if (showProgressBar) {
    return (
      <Pressable onPress={toggle} style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.border}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={tintColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={26}
          color={tintColor}
          style={isPlaying ? undefined : styles.playIconOffset}
        />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={toggle} style={[styles.container, compact && styles.compact]}>
      <Ionicons
        name={isPlaying ? 'pause-circle' : 'play-circle'}
        size={compact ? 24 : 32}
        color={tintColor}
      />
      {!compact && (
        <Text style={[styles.label, { color: tintColor }]}>
          {isPlaying ? t('audioPlayer.stop') : t('audioPlayer.play')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
  },
  compact: {
    padding: 2,
  },
  label: {
    fontSize: 13,
    color: colors.primary,
    fontFamily: fonts.medium,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  barPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: radii.pill,
    // Match the voice intro card's edit-button chip (`colors.primaryLight`)
    // so the toggle container, play-bar track, and edit button all share
    // one surface tone against the blush card gradient.
    backgroundColor: colors.primaryLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  barTime: {
    fontSize: 11,
    fontFamily: fonts.medium,
    letterSpacing: 0.3,
    minWidth: 56,
    textAlign: 'right',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  playIconOffset: {
    marginLeft: 3, // optical centering for play triangle
  },
});
