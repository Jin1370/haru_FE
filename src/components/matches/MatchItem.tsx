import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { colors, gradients, radii, shadows } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { formatRelativeTime } from '@/utils/age';
import type { MatchListItem } from '@/types';

interface MatchItemProps {
  item: MatchListItem;
  onPress: () => void;
  onLongPress?: () => void;
}

export function MatchItem({ item, onPress, onLongPress }: MatchItemProps) {
  const { t } = useTranslation();
  const partner = item.partner;
  const hasUnread = item.unread_count > 0;
  // Tombstone states:
  //   * partner.deleted_at  (mig 012) → "탈퇴한 사용자"
  //   * item.unmatched_at   (mig 013) → "매치 종료"
  // Both suppress avatar photo + the unread ring; deletion takes precedence
  // when both apply (the partner is gone regardless of the match status).
  const isDeleted = !!partner?.deleted_at;
  const isUnmatched = !!item.unmatched_at;
  const isTombstone = isDeleted || isUnmatched;
  const displayName = isDeleted
    ? t('common.deletedUser')
    : (partner?.display_name || t('matches.unknown'));
  const lastMessageText = isUnmatched && !item.last_message
    ? t('matches.tombstone.unmatched')
    : (item.last_message?.original_text ?? t('matches.startConversation'));

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <ProfilePhoto
        userId={partner?.id}
        uri={isTombstone ? undefined : partner?.photos[0]}
        size={54}
        variant="avatar"
        ringed={hasUnread && !isTombstone}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {item.last_message && (
            <Text style={styles.time}>
              {formatRelativeTime(item.last_message.created_at)}
            </Text>
          )}
        </View>
        <View style={styles.messageRow}>
          <Text
            style={[
              styles.lastMessage,
              hasUnread && !isTombstone && styles.lastMessageUnread,
              isTombstone && styles.lastMessageTombstone,
            ]}
            numberOfLines={1}
          >
            {lastMessageText}
          </Text>
          {hasUnread && !isTombstone && (
            <LinearGradient
              colors={[...gradients.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </LinearGradient>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  time: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
    fontFamily: fonts.regular,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    // Lock the row height so unread (with the badge child, h:22) and read
    // (text-only, intrinsic line height) rows stay identical regardless of
    // which fontFamily wins. Without this, switching from regular→medium
    // and the absence of the badge each shave a few px off the card.
    minHeight: 22,
  },
  lastMessage: {
    fontSize: 12,
    // Pin the rendered line height — `regular` and `medium` ship slightly
    // different intrinsic line metrics, so an explicit value keeps the row
    // height consistent across read/unread states.
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    flex: 1,
  },
  lastMessageUnread: {
    color: colors.text,
    fontFamily: fonts.medium,
  },
  lastMessageTombstone: {
    // Galmuri11(픽셀 폰트)에는 italic 변형이 없어 fontStyle: 'italic' 을
    // 주면 RN 이 시스템 폰트로 폴백되어 픽셀 톤이 깨진다. 색만 약하게
    // 두어 구분.
    color: colors.textLight,
  },
  badge: {
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.white,
  },
});
