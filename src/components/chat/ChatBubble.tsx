import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { getEmotionMeta } from '@/constants/emotions';
import {
  playSharedAudio,
  pauseSharedAudio,
  useSharedAudioState,
} from './sharedAudioPlayer';
import type { Message } from '@/types';

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  partnerId?: string | null;
  partnerPhoto?: string | null;
  showAvatar?: boolean;
  onAvatarPress?: () => void;
  // voice-first-message-gate sprint: 수신자가 편지 카드(게이팅 분기)에서
  // 재생을 시작해 자연 완료에 도달하면 본 ChatBubble 내부의 transition
  // detection useEffect 가 1회 발화. 송신자 본인 메시지에는 호출 가드.
  onListened?: (messageId: string) => void;
  // audio-expiry sprint: 폐기된 음성 재합성 요청. 성공 시 audio_url 갱신된
  // Message row 를 resolve — 호출처에서 즉시 playSharedAudio 트리거. 실패
  // (null) 시 본 컴포넌트는 별도 toast 없이 silent fail (다시 누르면 재시도).
  onRegenerateAudio?: (messageId: string) => Promise<Message | null>;
}

const AVATAR_SIZE = 36;

export function ChatBubble({
  message,
  isMine,
  partnerId,
  partnerPhoto,
  showAvatar = true,
  onAvatarPress,
  onListened,
  onRegenerateAudio,
}: ChatBubbleProps) {
  const { t, i18n } = useTranslation();
  const sharedState = useSharedAudioState();
  // chat-audio-singleton sprint: 본 메시지가 shared singleton player 의 현재
  // source 인지 확인. 채팅 화면 전체에서 native player 인스턴스가 1 개라 두
  // 메시지가 동시에 'playing' 상태일 수는 없다.
  const isActive = !!message.audio_url && sharedState.currentUrl === message.audio_url;
  const isPlayingThis = isActive && sharedState.isPlaying;
  // audio-expiry sprint: 폐기된 음성을 재합성하는 동안 로딩 인디케이터 표시.
  // 호출 동안 onPress 가 새 호출을 발화하지 않도록 가드. 성공/실패 모두 false
  // 로 복귀 (실패 시 사용자가 다시 누르면 재시도).
  const [regenerating, setRegenerating] = useState(false);
  // 폐기된 음성 메시지인지 — sweep 으로 audio_url 이 null 되었으나 audio_status
  // 는 ready 로 유지되며 audio_purged_at 가 set. 본 분기에서만 재생성 버튼 노출.
  const isPurged =
    message.audio_status === 'ready' &&
    !message.audio_url &&
    !!message.audio_purged_at;
  const handlePlayPress = () => {
    if (regenerating) return;
    if (isPurged && onRegenerateAudio) {
      setRegenerating(true);
      onRegenerateAudio(message.id)
        .then((updated) => {
          if (updated?.audio_url) {
            playSharedAudio(updated.audio_url);
          }
        })
        .finally(() => setRegenerating(false));
      return;
    }
    if (!message.audio_url) return;
    if (isPlayingThis) {
      pauseSharedAudio();
    } else {
      playSharedAudio(message.audio_url);
    }
  };
  const showTranslation =
    !isMine &&
    !!message.translated_text &&
    message.translated_text !== message.original_text;

  // voice-first-message-gate sprint: 수신자 한정 게이팅 상태.
  //   * isReady — 음성 재생 가능 (audio_status='ready' 이며 url 존재). 편지
  //     카드에서 탭 → playSharedAudio 호출.
  //   * isListened — 수신자가 1회 끝까지 청취 완료 (BE 가 보장하는 단방향
  //     플래그 또는 useChat optimistic). 이 시점부터는 텍스트+재생 버튼
  //     렌더 (기존 inner).
  const isReady = message.audio_status === 'ready' && !!message.audio_url;
  const isListened = !!message.listened_at;
  const showGate = !isMine && !isListened;

  // 재생 완료(transition) 자체 감지. sharedAudioPlayer 의 status update 에서
  //   * wasPlaying === true && nowPlaying === false  → stop transition
  //   * currentTime >= duration - 0.2                 → end of track (자연 완료)
  // 두 조건이 같이 성립할 때만 onListened 발화. 일시정지(중간에서 stop) 또는
  // source 교체로 다른 메시지가 currentUrl 을 가져간 경우는 자연스럽게 분기
  // 밖이라 미발화. fragile 한 sharedAudioPlayer 는 절대 손대지 않는 전제.
  const prevPlayingRef = useRef(false);
  useEffect(() => {
    if (isMine || isListened || !isReady) return;
    const isOurTrack = sharedState.currentUrl === message.audio_url;
    if (!isOurTrack) {
      prevPlayingRef.current = sharedState.isPlaying;
      return;
    }
    const wasPlaying = prevPlayingRef.current;
    const nowStopped = !sharedState.isPlaying;
    const reachedEnd =
      sharedState.duration > 0 &&
      sharedState.currentTime >= sharedState.duration - 0.2;
    if (wasPlaying && nowStopped && reachedEnd) {
      onListened?.(message.id);
    }
    prevPlayingRef.current = sharedState.isPlaying;
  }, [
    sharedState.isPlaying,
    sharedState.currentTime,
    sharedState.duration,
    sharedState.currentUrl,
    message.id,
    message.audio_url,
    isMine,
    isListened,
    isReady,
    onListened,
  ]);

  // chat-audio-async-insert sprint: audio_status 가 가질 수 있는 값은 세 가지.
  //   * 'pending' — 본인 발신 stub. BE 응답 직후, TTS 완료 전. realtime INSERT
  //     도착 시 같은 id 로 useChat 이 replace → 'ready' 가 됨. 상대방에게는
  //     보이지 않음 (DB INSERT 가 아직 안 일어났음).
  //   * 'ready' — 정상 INSERT 완료. audio_url 있으면 재생, 없으면 텍스트 전용
  //     (no-speakable-content 경로).
  //   * 'failed' — TTS 파이프라인 실패 → 텍스트 전용으로 영구 저장. 사용자는
  //     같은 텍스트로 새 메시지를 보내 재시도. 별도 retry UI 없음 (mid-session
  //     UPDATE 패턴을 폐기했기 때문).
  // Follow the app language (i18n), not the device OS locale — otherwise an
  // English-language user on a Korean device sees "오전/오후". Use a full BCP-47
  // tag for Hermes Intl reliability (mirrors formatDateLabel in the chat screen).
  const timeLocale =
    i18n.language === 'ko' ? 'ko-KR' : i18n.language === 'ja' ? 'ja-JP' : 'en-US';
  const timeLabel = new Date(message.created_at).toLocaleTimeString(timeLocale, {
    hour: 'numeric',
    minute: '2-digit',
  });

  // voice-first-message-gate sprint: 수신자 게이팅. isReady 면 탭 가능한 편지
  // 카드(mail-outline + tapToListen), 아니면 비활성 편지 카드(mail-unread-outline
  // + messagePreparing). pending/processing/failed 모두 후자 — 메시지 본문 공개를
  // 일관되게 차단. 청취 완료 후에는 본 분기 밖으로 빠져 기존 inner 렌더.
  //
  // 재생 중 펄스: isPlayingThis 동안 편지 아이콘 뒤에서 분홍 동그라미 두 개가
  // staggered 로 퍼지는 wave 효과. native driver 만 사용 (transform.scale +
  // opacity) → JS 스레드 영향 없음. chat-audio-singleton 의 fragile sharedPlayer
  // 영역과 분리 — 본 컴포넌트 안의 순수 시각 효과.
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isPlayingThis) {
      pulse1.setValue(0);
      pulse2.setValue(0);
      return;
    }
    const makeLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const a = makeLoop(pulse1, 0);
    const b = makeLoop(pulse2, 700);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
      pulse1.setValue(0);
      pulse2.setValue(0);
    };
  }, [isPlayingThis, pulse1, pulse2]);

  const pulseTransform = (val: Animated.Value) => ({
    transform: [
      {
        scale: val.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.8],
        }),
      },
    ],
    opacity: val.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0],
    }),
  });

  const gateInner = isReady ? (
    <Pressable
      onPress={() => {
        if (!message.audio_url) return;
        if (isPlayingThis) {
          pauseSharedAudio();
        } else {
          playSharedAudio(message.audio_url);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={isPlayingThis ? t('chat.playing') : t('chat.tapToListen')}
      style={styles.letterCard}
    >
      <View style={styles.letterIconWrap}>
        {isPlayingThis && (
          <>
            <Animated.View
              style={[styles.pulseDot, pulseTransform(pulse1)]}
              pointerEvents="none"
            />
            <Animated.View
              style={[styles.pulseDot, pulseTransform(pulse2)]}
              pointerEvents="none"
            />
          </>
        )}
        <Ionicons name="mail-outline" size={20} color={colors.primary} />
      </View>
      <Text style={styles.letterText}>
        {isPlayingThis ? t('chat.playing') : t('chat.tapToListen')}
      </Text>
      <Text style={styles.letterTime}>{timeLabel}</Text>
    </Pressable>
  ) : (
    <View
      style={[styles.letterCard, styles.letterCardPending]}
      pointerEvents="none"
    >
      <Ionicons name="mail-unread-outline" size={20} color={colors.primary} />
      <Text style={styles.letterText}>{t('chat.messagePreparing')}</Text>
      <Text style={styles.letterTime}>{timeLabel}</Text>
    </View>
  );

  const inner = (
    <>
      <Text style={[styles.text, isMine && styles.mineText]}>
        {message.original_text}
      </Text>

      {showTranslation && (
        <Text style={styles.translation}>{message.translated_text}</Text>
      )}

      <View style={styles.footer}>
        {message.audio_status === 'ready' && message.audio_url && (
          <Pressable
            onPress={handlePlayPress}
            style={styles.audioBtn}
            accessibilityRole="button"
            accessibilityLabel={
              isPlayingThis ? t('audioPlayer.stop') : t('audioPlayer.play')
            }
            hitSlop={6}
          >
            <Ionicons
              name={isPlayingThis ? 'pause-circle' : 'play-circle'}
              size={24}
              color={isMine ? 'rgba(255,255,255,0.95)' : colors.primary}
            />
          </Pressable>
        )}
        {/* audio-expiry sprint: sweep 으로 폐기된 메시지 — 재생성 버튼 노출.
            로딩 중에는 hourglass, 평시에는 refresh 아이콘. handlePlayPress 가
            isPurged 분기로 자동 분기되어 onRegenerateAudio 호출 후 재생까지. */}
        {isPurged && (
          <Pressable
            onPress={handlePlayPress}
            disabled={regenerating}
            style={styles.audioBtn}
            accessibilityRole="button"
            accessibilityLabel={
              regenerating ? t('chat.audio.regenerating') : t('chat.audio.regeneratePlay')
            }
            hitSlop={6}
          >
            <Ionicons
              name={regenerating ? 'hourglass-outline' : 'refresh-circle'}
              size={24}
              color={isMine ? 'rgba(255,255,255,0.95)' : colors.primary}
            />
          </Pressable>
        )}
        {/* pending stub — 본인 발신 stub 에만 노출 (TTS 완료 전). 상대는 stub
            을 받지 않으므로 분기 도달 불가지만 isMine 가드로 명시. */}
        {message.audio_status === 'pending' && isMine && (
          <View style={styles.audioBtn}>
            <Ionicons
              name="hourglass-outline"
              size={14}
              color="rgba(255,255,255,0.75)"
            />
          </View>
        )}
        {/* failed 메시지는 텍스트 전용 — 별도 인디케이터 없이 timestamp 만. */}

        <Text style={[styles.time, isMine && styles.mineTime]}>
          {timeLabel}
        </Text>

        {/* read-at-removal-list-mask sprint: 송신자 체크마크 기준을 read_at →
            listened_at 로 전환. "상대가 내 메시지의 음성을 끝까지 들었음 = 읽음"
            의미로 일원화. mig 015 백필로 기존 메시지는 read_at == listened_at
            이라 회귀 없음. */}
        {isMine && message.listened_at && (
          <Ionicons name="checkmark-done" size={14} color={colors.white} style={{ marginLeft: 4 }} />
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.container, isMine ? styles.mine : styles.theirs]}>
      {!isMine && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Pressable
              onPress={onAvatarPress}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <ProfilePhoto
                userId={partnerId}
                uri={partnerPhoto ?? undefined}
                size={AVATAR_SIZE}
                variant="avatar"
              />
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={styles.bubbleStack}>
        <View
          style={[
            styles.bubble,
            isMine ? styles.mineBubble : styles.theirsBubble,
            shadows.soft,
          ]}
        >
          {showGate ? gateInner : inner}
        </View>
        {/* voice-first-message-gate sprint: 청취 전에는 emotion 뱃지도 노출
            안 함 — 음성 청취 전에 단서를 흘리지 않도록. 청취 완료(또는 본인
            송신) 시점부터 자연 노출. */}
        {!showGate && message.emotion && message.emotion !== 'neutral' && (
          <View
            style={[
              styles.emotionBadge,
              isMine ? styles.emotionBadgeMine : styles.emotionBadgeTheirs,
            ]}
          >
            <Text style={styles.emotionBadgeText}>
              {getEmotionMeta(message.emotion).emoji}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    marginVertical: 4,
    flexDirection: 'row',
  },
  mine: {
    justifyContent: 'flex-end',
  },
  theirs: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  avatarSlot: {
    width: AVATAR_SIZE,
    marginRight: 8,
  },
  bubbleStack: {
    maxWidth: '78%',
    position: 'relative',
  },
  bubble: {
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: radii.lg,
  },
  mineBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  theirsBubble: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: radii.lg,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  text: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  mineText: {
    color: colors.white,
  },
  translation: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 5,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  audioBtn: {
    marginRight: 6,
  },
  time: {
    fontSize: 9,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  mineTime: {
    color: 'rgba(255,255,255,0.8)',
  },
  emotionBadge: {
    position: 'absolute',
    top: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  emotionBadgeMine: {
    left: -6,
  },
  emotionBadgeTheirs: {
    right: -6,
  },
  emotionBadgeText: {
    fontSize: 12,
    lineHeight: 14,
  },
  // voice-first-message-gate sprint: 편지 카드(수신자 게이팅). 기존
  // theirsBubble 안에 들어가는 children 이므로 배경/보더는 부모가 담당,
  // 본 스타일은 아이콘 + 텍스트 + 시간 한 줄 정렬만 책임진다.
  letterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  letterCardPending: {
    opacity: 0.6,
  },
  letterText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  letterTime: {
    marginLeft: 'auto',
    fontSize: 9,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  // 편지 아이콘 wrap — 펄스 dot 를 absolute 로 깔기 위한 컨테이너. width/height
  // 는 아이콘 크기(20) 와 동일해 letterCard 의 row gap/alignment 영향 없음.
  letterIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // 재생 중 펄스 — 아이콘과 같은 크기에서 시작해 transform.scale 로 퍼져나간다.
  // JSX 에서 아이콘보다 먼저 렌더되므로 z-stack 상 아이콘이 위에 노출됨 (RN
  // 기본 stacking — JSX 순서 후자가 위).
  pulseDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
});
