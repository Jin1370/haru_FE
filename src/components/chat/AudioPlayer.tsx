import { useCallback } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
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
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const toggle = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      if (duration > 0 && currentTime >= duration) {
        player.seekTo(0);
      }
      player.play();
    }
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
          <View
            style={[
              styles.barFill,
              { width: `${progress * 100}%`, backgroundColor: tintColor },
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
