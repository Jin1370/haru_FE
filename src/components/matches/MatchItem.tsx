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

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <ProfilePhoto
        userId={partner?.id}
        uri={partner?.photos[0]}
        size={54}
        variant="avatar"
        ringed={hasUnread}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {partner?.display_name ?? t('matches.unknown')}
          </Text>
          {item.last_message && (
            <Text style={styles.time}>
              {formatRelativeTime(item.last_message.created_at)}
            </Text>
          )}
        </View>
        <View style={styles.messageRow}>
          <Text
            style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {item.last_message?.original_text ?? t('matches.startConversation')}
          </Text>
          {hasUnread && (
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
