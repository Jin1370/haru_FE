import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { colors, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { getEmotionMeta } from '@/constants/emotions';
import { AudioPlayer } from './AudioPlayer';
import type { Message } from '@/types';

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  partnerId?: string | null;
  partnerPhoto?: string | null;
  showAvatar?: boolean;
  onAvatarPress?: () => void;
  onRetryAudio?: (messageId: string) => void;
}

const AVATAR_SIZE = 36;

export function ChatBubble({
  message,
  isMine,
  partnerId,
  partnerPhoto,
  showAvatar = true,
  onAvatarPress,
  onRetryAudio,
}: ChatBubbleProps) {
  const showTranslation =
    !isMine &&
    !!message.translated_text &&
    message.translated_text !== message.original_text;

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
          <View style={styles.audioBtn}>
            <AudioPlayer
              url={message.audio_url}
              compact
              tintColor={isMine ? 'rgba(255,255,255,0.95)' : colors.primary}
            />
          </View>
        )}
        {message.audio_status === 'processing' && (
          <View style={styles.audioBtn}>
            <Ionicons
              name="hourglass"
              size={16}
              color={isMine ? 'rgba(255,255,255,0.85)' : colors.textSecondary}
            />
          </View>
        )}
        {message.audio_status === 'failed' && isMine && (
          <Pressable
            onPress={() => onRetryAudio?.(message.id)}
            style={styles.audioBtn}
            accessibilityLabel="retry audio"
          >
            <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.9)" />
          </Pressable>
        )}

        <Text style={[styles.time, isMine && styles.mineTime]}>
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>

        {isMine && message.read_at && (
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
          {inner}
        </View>
        {message.emotion && message.emotion !== 'neutral' && (
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
});
