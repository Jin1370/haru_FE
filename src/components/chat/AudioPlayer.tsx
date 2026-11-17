import { useCallback } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAudioPlayerStatus } from 'expo-audio';
import { useRecoverableAudioPlayer } from './sharedAudioPlayer';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fonts, fs } from '@/constants/fonts';

interface AudioPlayerProps {
  url: string;
  compact?: boolean;
  showProgressBar?: boolean;
  tintColor?: string;
}

const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function AudioPlayer({ url, compact = false, showProgressBar = false, tintColor = colors.primary }: AudioPlayerProps) {
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
  const { player, play } = useRecoverableAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;
  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const toggle = useCallback(() => {
    if (isPlaying) {
      player.pause();
      return;
    }
    if (duration > 0 && currentTime >= duration) {
      player.seekTo(0);
    }
    play();
  }, [player, play, isPlaying, duration, currentTime]);

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
    fontSize: fs(13),
    color: colors.primary,
    fontFamily: fonts.medium,
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
